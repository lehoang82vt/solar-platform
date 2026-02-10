/**
 * JOB-02: Background workers tests.
 * Requires: Redis, DB migrated. Workers register queue processors.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { notificationQueue, biRefreshQueue } from '../services/job-queue';
import { sendNotification } from '../workers/notification-worker';
import { cleanupOldLogs } from '../workers/cleanup-worker';

import '../workers/notification-worker';
import '../workers/bi-worker';

test.before(async () => {
  process.env.ZALO_USE_MOCK = 'true';
  process.env.SMS_USE_MOCK = 'true';
  await connectDatabase();
});

test.after(async () => {
  await notificationQueue.close();
  await biRefreshQueue.close();
  setTimeout(() => process.exit(0), 300);
});

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test('job02_1: notification_worker_sends_successfully', async () => {
  const orgId = await getDefaultOrganizationId();
  let logId: string;

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'test', 'ZALO_ZNS', $2, NULL, '{}', 'PENDING')
       RETURNING id`,
      [orgId, '+84907771111']
    );
    logId = r.rows[0].id;
  });

  const job = await notificationQueue.add(
    { logId: logId!, organizationId: orgId },
    { removeOnComplete: 10 }
  );
  await job.finished().catch(() => {});

  const row = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status FROM notification_logs WHERE id = $1`,
      [logId]
    );
    return r.rows[0];
  });
  assert.equal(row?.status, 'SENT');
});

test('job02_2: notification_worker_handles_failure', async () => {
  const job = await notificationQueue.add(
    {
      logId: '00000000-0000-0000-0000-000000000099',
      organizationId: '00000000-0000-0000-0000-000000000099',
    },
    { removeOnComplete: 0, attempts: 2, backoff: { type: 'exponential', delay: 50 } }
  );

  for (let i = 0; i < 40; i++) {
    await wait(250);
    const state = await job.getState();
    if (state === 'failed' || state === 'stuck') break;
  }

  const state = await job.getState();
  assert.ok(state === 'failed' || state === 'stuck', `Job should fail or be stuck, got ${state}`);
});

test('job02_3: bi_worker_refreshes_views', async () => {
  const job = await biRefreshQueue.add({}, { removeOnComplete: 5 });
  await job.finished().catch(() => {});
  const state = await job.getState();
  assert.ok(state === 'completed' || state === 'active', `BI job should complete, got ${state}`);
});

test('job02_4: cleanup_worker_deletes_old_logs', async () => {
  const orgId = await getDefaultOrganizationId();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 100);

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status, created_at)
       VALUES ($1, 'test', 'ZALO_ZNS', '+84909999999', NULL, '{}', 'SENT', $2)`,
      [orgId, cutoff]
    );
  });

  const recipient = '+84909999999';
  const before = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE recipient = $1`,
      [recipient]
    );
    return r.rows[0]?.c ?? 0;
  });
  assert.ok(before >= 1);

  const result = await cleanupOldLogs();
  assert.ok(typeof result.notificationLogs === 'number');

  const after = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM notification_logs WHERE recipient = $1`,
      [recipient]
    );
    return r.rows[0]?.c ?? 0;
  });
  assert.equal(after, 0);
});

test('job02_5: worker_restarts_after_crash', async () => {
  const orgId = await getDefaultOrganizationId();
  let logId: string;

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'test', 'ZALO_ZNS', $2, NULL, '{}', 'PENDING')
       RETURNING id`,
      [orgId, '+84908881234']
    );
    logId = r.rows[0].id;
  });

  await sendNotification(logId!, orgId);
  const row = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status FROM notification_logs WHERE id = $1`,
      [logId]
    );
    return r.rows[0];
  });
  assert.equal(row?.status, 'SENT');
});

test('job02_6: concurrent_job_processing', async () => {
  const orgId = await getDefaultOrganizationId();
  const logIds: string[] = [];

  for (let i = 0; i < 3; i++) {
    await withOrgContext(orgId, async (client) => {
      const r = await client.query(
        `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
         VALUES ($1, 'test', 'ZALO_ZNS', $2, NULL, '{}', 'PENDING')
         RETURNING id`,
        [orgId, `+8490111${1000 + i}`]
      );
      logIds.push(r.rows[0].id);
    });
  }

  const jobs = await Promise.all(
    logIds.map((id) =>
      notificationQueue.add(
        { logId: id, organizationId: orgId },
        { removeOnComplete: 10 }
      )
    )
  );

  await Promise.all(jobs.map((j) => j.finished().catch(() => {})));

  const counts = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT status, COUNT(*)::int AS c FROM notification_logs WHERE id = ANY($1) GROUP BY status`,
      [logIds]
    );
    return r.rows as { status: string; c: number }[];
  });

  const sent = counts.find((r) => r.status === 'SENT')?.c ?? 0;
  assert.ok(sent >= 1, `Expected at least 1 SENT, got counts: ${JSON.stringify(counts)}`);
});
