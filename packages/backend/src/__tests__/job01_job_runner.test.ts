/**
 * JOB-01 Job Runner: job_runs table, locking, status tracking.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import {
  startJobRun,
  completeJobRun,
  failJobRun,
  timeoutJobRun,
  getJobRun,
} from '../services/job-runner';

test.before(async () => {
  await connectDatabase();
});

test('job01_1: creates_job_record', async () => {
  const orgId = await getDefaultOrganizationId();

  const jobRunId = await startJobRun(orgId, 'test-job-1', 'PHONE_GATE');
  assert.ok(jobRunId);

  const jobRun = await getJobRun(orgId, jobRunId);
  assert.equal(jobRun?.status, 'RUNNING');
  assert.equal(jobRun?.job_name, 'test-job-1');

  await completeJobRun(orgId, jobRunId);
});

test('job01_2: mark_completed', async () => {
  const orgId = await getDefaultOrganizationId();

  const jobRunId = await startJobRun(orgId, 'test-job-2', 'CLEANUP');
  assert.ok(jobRunId);

  await completeJobRun(orgId, jobRunId, { processed: 10 });

  const jobRun = await getJobRun(orgId, jobRunId);
  assert.equal(jobRun?.status, 'COMPLETED');
  assert.ok(jobRun?.completed_at);
  assert.ok(jobRun?.duration_ms != null && jobRun.duration_ms > 0);
  const meta = jobRun?.metadata as Record<string, unknown> | undefined;
  assert.equal(meta?.processed, 10);
});

test('job01_3: mark_failed', async () => {
  const orgId = await getDefaultOrganizationId();

  const jobRunId = await startJobRun(orgId, 'test-job-3', 'COMMISSION');
  assert.ok(jobRunId);

  await failJobRun(orgId, jobRunId, 'Database connection failed');

  const jobRun = await getJobRun(orgId, jobRunId);
  assert.equal(jobRun?.status, 'FAILED');
  assert.equal(jobRun?.error_message, 'Database connection failed');
});

test('job01_4: mark_timeout', async () => {
  const orgId = await getDefaultOrganizationId();

  const jobRunId = await startJobRun(orgId, 'test-job-4', 'BACKUP');
  assert.ok(jobRunId);

  await timeoutJobRun(orgId, jobRunId);

  const jobRun = await getJobRun(orgId, jobRunId);
  assert.equal(jobRun?.status, 'TIMEOUT');
  assert.ok(jobRun?.error_message?.includes('exceeded maximum'));
});

test('job01_5: concurrent_lock_prevents_duplicate', async () => {
  const orgId = await getDefaultOrganizationId();

  const jobRunId1 = await startJobRun(orgId, 'concurrent-test', 'PHONE_GATE');
  assert.ok(jobRunId1);

  const jobRunId2 = await startJobRun(orgId, 'concurrent-test', 'PHONE_GATE');
  assert.equal(jobRunId2, null);

  await completeJobRun(orgId, jobRunId1);

  const jobRunId3 = await startJobRun(orgId, 'concurrent-test', 'PHONE_GATE');
  assert.ok(jobRunId3);
  await completeJobRun(orgId, jobRunId3);
});
