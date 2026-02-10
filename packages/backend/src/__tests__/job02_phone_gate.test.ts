/**
 * JOB-02: Phone gate job tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { runPhoneGateJob } from '../jobs/phone-gate.job';

test.before(async () => {
  await connectDatabase();
});

test('job02_1: expired_projects_cancelled', async () => {
  const orgId = await getDefaultOrganizationId();

  const project = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `INSERT INTO projects
       (organization_id, project_number, status, customer_phone, created_at, updated_at)
       VALUES ($1, 'P-DEMO-OLD', 'DEMO', NULL, NOW() - INTERVAL '8 days', NOW())
       RETURNING *`,
      [orgId]
    );
    return result.rows[0] as { id: string };
  });

  await runPhoneGateJob(orgId);

  const updated = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT status FROM projects WHERE id = $1`,
      [project.id]
    );
    return result.rows[0];
  });

  assert.equal(updated?.status, 'CANCELLED');
});

test('job02_2: projects_with_phone_not_cancelled', async () => {
  const orgId = await getDefaultOrganizationId();

  const project = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `INSERT INTO projects
       (organization_id, project_number, status, customer_phone, created_at, updated_at)
       VALUES ($1, 'P-DEMO-PHONE', 'DEMO', '+84901234567', NOW() - INTERVAL '8 days', NOW())
       RETURNING *`,
      [orgId]
    );
    return result.rows[0] as { id: string };
  });

  await runPhoneGateJob(orgId);

  const updated = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT status FROM projects WHERE id = $1`,
      [project.id]
    );
    return result.rows[0];
  });

  assert.equal(updated?.status, 'DEMO');
});

test('job02_3: already_cancelled_projects_skipped', async () => {
  const orgId = await getDefaultOrganizationId();

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO projects
       (organization_id, project_number, status, customer_phone, created_at, updated_at, cancelled_at)
       VALUES ($1, 'P-ALREADY-CANCELLED', 'CANCELLED', NULL, NOW() - INTERVAL '8 days', NOW(), NOW())`,
      [orgId]
    );
  });

  const result = await runPhoneGateJob(orgId);
  assert.equal(result.cancelled, 0);
});

test('job02_4: audit_log_created', async () => {
  const orgId = await getDefaultOrganizationId();

  const project = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `INSERT INTO projects
       (organization_id, project_number, status, customer_phone, created_at, updated_at)
       VALUES ($1, 'P-AUDIT-TEST', 'DEMO', NULL, NOW() - INTERVAL '8 days', NOW())
       RETURNING *`,
      [orgId]
    );
    return result.rows[0] as { id: string };
  });

  await runPhoneGateJob(orgId);

  const audit = await withOrgContext(orgId, async (client) => {
    const result = await client.query(
      `SELECT * FROM audit_logs
       WHERE entity_id = $1 AND action = 'project.cancelled.phone_gate'`,
      [project.id]
    );
    return result.rows[0];
  });

  assert.ok(audit);
  assert.equal(audit?.actor, 'SYSTEM');
});

test('job02_5: idempotent_run', async () => {
  const orgId = await getDefaultOrganizationId();

  await runPhoneGateJob(orgId);
  const result2 = await runPhoneGateJob(orgId);

  assert.ok(result2.skipped === true || (result2.cancelled === 0 && result2.total === 0));
});
