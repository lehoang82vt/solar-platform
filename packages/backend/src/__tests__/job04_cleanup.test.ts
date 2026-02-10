/**
 * JOB-04: Cleanup job tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { runCleanupJob } from '../jobs/cleanup.job';

test.before(async () => {
  await connectDatabase();
});

test('job04_1: old_sessions_deleted', async () => {
  const orgId = await getDefaultOrganizationId();

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO public_sessions (organization_id, session_token, expires_at)
       VALUES ($1, 'old-token', NOW() - INTERVAL '1 day')`,
      [orgId]
    );
  });

  const result = await runCleanupJob(orgId);
  assert.ok((result.sessionsDeleted ?? 0) >= 1);

  const remaining = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM public_sessions WHERE session_token = 'old-token'`,
      []
    );
    return r.rows[0]?.c ?? 0;
  });
  assert.equal(remaining, 0);
});

test('job04_2: active_sessions_preserved', async () => {
  const orgId = await getDefaultOrganizationId();
  const token = `active-${Date.now()}`;

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO public_sessions (organization_id, session_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [orgId, token]
    );
  });

  await runCleanupJob(orgId);

  const remaining = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM public_sessions WHERE session_token = $1`,
      [token]
    );
    return r.rows[0]?.c ?? 0;
  });
  assert.equal(remaining, 1);
});

test('job04_3: expired_otps_deleted', async () => {
  const orgId = await getDefaultOrganizationId();

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO otp_challenges (organization_id, phone, otp_hash, expires_at, verified)
       VALUES ($1, '+84900000001', 'hash', NOW() - INTERVAL '1 hour', false)`,
      [orgId]
    );
  });

  await runCleanupJob(orgId);

  const remaining = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM otp_challenges WHERE phone = '+84900000001'`,
      []
    );
    return r.rows[0]?.c ?? 0;
  });
  assert.equal(remaining, 0);
});

test('job04_4: verified_otps_kept', async () => {
  const orgId = await getDefaultOrganizationId();
  const phone = `+8490000${Date.now().toString().slice(-4)}`;

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO otp_challenges (organization_id, phone, otp_hash, expires_at, verified)
       VALUES ($1, $2, 'hash2', NOW() - INTERVAL '1 hour', true)`,
      [orgId, phone]
    );
  });

  await runCleanupJob(orgId);

  const remaining = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM otp_challenges WHERE phone = $1`,
      [phone]
    );
    return r.rows[0]?.c ?? 0;
  });
  assert.equal(remaining, 1);
});

test('job04_5: lead_expiry_warnings_sent', async () => {
  const orgId = await getDefaultOrganizationId();

  const project = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO projects (organization_id, project_number, status, expires_at, updated_at)
       VALUES ($1, 'P-EXPIRY-WARN', 'SURVEY_PENDING', NOW() + INTERVAL '12 hours', NOW())
       RETURNING id`,
      [orgId]
    );
    return r.rows[0] as { id: string };
  });

  await runCleanupJob(orgId);

  const audit = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'project.expiry_warning'`,
      [project.id]
    );
    return r.rows[0];
  });
  assert.ok(audit);
  assert.equal(audit?.actor, 'SYSTEM');
});
