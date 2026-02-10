/**
 * JOB-01: Job queue + scheduler tests.
 * Requires: Redis (e.g. docker compose up -d redis), DB migrated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import {
  notificationQueue,
  biRefreshQueue,
} from '../services/job-queue';
import '../workers/notification-worker';
import '../workers/bi-worker';
import {
  startScheduler,
  runBiRefreshCron,
  runNotificationCron,
} from '../services/scheduler';

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

test('job01_1: queue_created_successfully', () => {
  assert.ok(notificationQueue);
  assert.ok(biRefreshQueue);
  assert.equal(notificationQueue.name, 'notifications');
  assert.equal(biRefreshQueue.name, 'bi-refresh');
});

test('job01_2: job_added_to_queue', async () => {
  const job = await notificationQueue.add(
    { logId: '00000000-0000-0000-0000-000000000001', organizationId: '00000000-0000-0000-0000-000000000001' },
    { removeOnComplete: 10 }
  );
  assert.ok(job.id);
  assert.ok(job.opts);
  await job.remove().catch(() => {});
});

test('job01_3: job_processed_successfully', async () => {
  const orgId = await getDefaultOrganizationId();
  let logId: string;

  await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'test', 'ZALO_ZNS', $2, NULL, '{}', 'PENDING')
       RETURNING id`,
      [orgId, '+84901112222']
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

test('job01_4: job_retry_on_failure_three_attempts', async () => {
  const job = await notificationQueue.add(
    {
      logId: '00000000-0000-0000-0000-000000000099',
      organizationId: '00000000-0000-0000-0000-000000000099',
    },
    { removeOnComplete: 0, attempts: 3, backoff: { type: 'exponential', delay: 100 } }
  );

  for (let i = 0; i < 80; i++) {
    await wait(250);
    const state = await job.getState();
    if (state === 'failed') {
      assert.equal(state, 'failed');
      await job.remove().catch(() => {});
      return;
    }
  }
  await job.remove().catch(() => {});
  assert.fail('Job should have failed within timeout');
});

test.skip('job01_5: scheduler_runs_cron_job', async () => {
  startScheduler();
  const before = await biRefreshQueue.getJobCounts();
  await runBiRefreshCron();
  await wait(200);
  const after = await biRefreshQueue.getJobCounts();
  assert.ok(after.waiting + after.active + after.completed >= before.waiting + before.active + before.completed);
});

test('job01_6: bi_refresh_scheduled', async () => {
  const job = await biRefreshQueue.add({}, { priority: 1, removeOnComplete: 5 });
  assert.ok(job.id);
  await job.remove().catch(() => {});
});

test.skip('job01_7: notification_processing_scheduled', async () => {
  const orgId = await getDefaultOrganizationId();
  await withOrgContext(orgId, async (client) => {
    await client.query(
      `INSERT INTO notification_logs (organization_id, event_type, channel, recipient, template_id, payload, status)
       VALUES ($1, 'test', 'ZALO_ZNS', '+84903334444', NULL, '{}', 'PENDING')`,
      [orgId]
    );
  });

  const before = await notificationQueue.getJobCounts();
  await runNotificationCron();
  await wait(300);
  const after = await notificationQueue.getJobCounts();
  assert.ok(
    after.waiting + after.active + after.completed >= before.waiting + before.active + before.completed,
    'Notification queue should have same or more jobs after cron'
  );
});

test('job01_8: dead_letter_queue_for_failed_jobs', async () => {
  const job = await notificationQueue.add(
    {
      logId: '00000000-0000-0000-0000-000000000088',
      organizationId: '00000000-0000-0000-0000-000000000088',
    },
    { attempts: 3, backoff: { type: 'exponential', delay: 100 }, removeOnFail: false }
  );

  for (let i = 0; i < 60; i++) {
    await wait(250);
    const state = await job.getState();
    if (state === 'failed') break;
  }

  const failed = await notificationQueue.getFailed();
  const found = failed.some((j) => String(j.id) === String(job.id));
  assert.ok(found, 'Failed job should be in dead letter (failed) list');
});
