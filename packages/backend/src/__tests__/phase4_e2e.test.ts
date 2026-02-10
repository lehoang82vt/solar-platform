/**
 * Phase 4 E2E: Lead → Notification → Background job → Commission released (7 days) → Queues working.
 *
 * Requires: DB + Redis running, migrations applied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createPartner } from '../services/partners';
import { createLead } from '../services/leads';
import { runNotificationCron } from '../services/scheduler';
import { notificationQueue, biRefreshQueue } from '../services/job-queue';
import { runCommissionJob } from '../jobs/commission.job';

// Register notification handler on the in-process event bus.
import '../services/notification-handler';

import '../workers/notification-worker';
import '../workers/bi-worker';

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test.before(async () => {
  process.env.ZALO_USE_MOCK = 'true';
  process.env.SMS_USE_MOCK = 'true';
  await connectDatabase();
});

test.after(async () => {
  await notificationQueue.close();
  await biRefreshQueue.close();
  // Bull keeps handles around; give a short window then exit.
  setTimeout(() => process.exit(0), 300);
});

test('phase4_e2e_1: lead_notification_jobs_and_commission_release', async () => {
  const orgId = await getDefaultOrganizationId();

  // 1) Create partner (for commission)
  const partner = await createPartner(orgId, {
    email: `phase4-${Date.now()}@test.com`,
    password: 'test123',
    referral_code: `PHASE4-${Date.now()}`,
    name: 'Phase 4 Partner',
  });
  await withOrgContext(orgId, async (client) => {
    await client.query(`UPDATE partners SET commission_rate = 10 WHERE id = $1`, [partner.id]);
  });

  // 2) Create lead (triggers lead.created notification log PENDING)
  const phone = `+8490${Date.now().toString().slice(-7)}`;
  const lead = await createLead(orgId, { phone, partner_code: partner.referral_code });
  assert.ok(lead.id);

  const logRow = await withOrgContext(orgId, async (client) => {
    const r = await client.query<{ id: string; status: string }>(
      `SELECT id, status
       FROM notification_logs
       WHERE organization_id = $1 AND event_type = 'lead.created' AND recipient = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, lead.phone]
    );
    return r.rows[0] ?? null;
  });
  assert.ok(logRow, 'Expected a lead.created notification log');
  assert.equal(logRow!.status, 'PENDING');

  // 3) Background job processes notifications (scheduler → queue → worker)
  await runNotificationCron();

  // Wait until the notification is SENT (worker processes bull jobs)
  let status = 'PENDING';
  for (let i = 0; i < 40; i++) {
    await wait(250);
    const s = await withOrgContext(orgId, async (client) => {
      const r = await client.query<{ status: string }>(
        `SELECT status FROM notification_logs WHERE id = $1 AND organization_id = $2`,
        [logRow!.id, orgId]
      );
      return r.rows[0]?.status ?? 'PENDING';
    });
    status = s;
    if (status === 'SENT') break;
  }
  assert.equal(status, 'SENT', `Expected notification to become SENT, got ${status}`);

  // 4) Commission released after 7 days (handover date older than 7 days)
  const setup = await withOrgContext(orgId, async (client) => {
    const project = await client.query<{ id: string }>(
      `INSERT INTO projects (organization_id, project_number, partner_id, status, updated_at)
       VALUES ($1, $2, $3, 'COMPLETED', NOW())
       RETURNING id`,
      [orgId, `P-PHASE4-${Date.now()}`, partner.id]
    );
    const contract = await client.query<{ id: string }>(
      `INSERT INTO contracts (organization_id, contract_number, project_id, total_vnd, status)
       VALUES ($1, $2, $3, 100000000, 'COMPLETED')
       RETURNING id`,
      [orgId, `C-PHASE4-${Date.now()}`, project.rows[0].id]
    );
    await client.query(
      `INSERT INTO handovers (organization_id, contract_id, handover_type, handover_date)
       VALUES ($1, $2, 'INSTALLATION', NOW() - INTERVAL '8 days')`,
      [orgId, contract.rows[0].id]
    );
    return { contractId: contract.rows[0].id };
  });

  const jobResult = await runCommissionJob(orgId);
  assert.ok(jobResult && (jobResult.released ?? 0) >= 1, 'Expected commission job to release at least 1 commission');

  const commission = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status, amount_vnd
       FROM partner_commissions
       WHERE organization_id = $1 AND contract_id = $2
       LIMIT 1`,
      [orgId, setup.contractId]
    );
    return r.rows[0] ?? null;
  });
  assert.ok(commission, 'Expected partner_commissions row');
  assert.equal(commission.status, 'AVAILABLE');
  assert.equal(Number(commission.amount_vnd), 10000000);
});

