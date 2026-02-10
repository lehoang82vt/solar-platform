/**
 * BKP-01: Backup service and job tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import {
  createFullBackup,
  createIncrementalBackup,
  listBackups,
  deleteBackupsOlderThan,
  uploadBackup,
  getBackupById,
  clearMockBackupStore,
} from '../services/backup';
import { runBackupJob } from '../jobs/backup.job';

test.before(async () => {
  process.env.S3_USE_MOCK = 'true';
  await connectDatabase();
  clearMockBackupStore();
});

test('bkp01_1: full_backup_created', async () => {
  const orgId = await getDefaultOrganizationId();
  const backup = await createFullBackup(orgId);

  assert.ok(backup.id);
  assert.equal(backup.backup_type, 'FULL');
  assert.ok(backup.storage_path.startsWith('mock://'));
  assert.ok(backup.size_bytes != null && backup.size_bytes > 0);
  assert.equal(backup.status, 'CREATED');
});

test('bkp01_2: s3_upload_mock', async () => {
  const orgId = await getDefaultOrganizationId();
  const path = await uploadBackup(orgId, 'test/key.sql', '-- mock dump');

  assert.ok(path.startsWith('mock://'));
  assert.ok(path.includes('test/key.sql'));
});

test('bkp01_3: incremental_backup', async () => {
  const orgId = await getDefaultOrganizationId();
  const backup = await createIncrementalBackup(orgId);

  assert.ok(backup.id);
  assert.equal(backup.backup_type, 'INCREMENTAL');
  assert.ok(backup.storage_path);
});

test('bkp01_4: retention_cleanup', async () => {
  const orgId = await getDefaultOrganizationId();

  const oldId = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO backup_jobs (organization_id, backup_type, storage_path, size_bytes, status, created_at)
       VALUES ($1, 'FULL', 'mock://b/old.sql', 100, 'CREATED', NOW() - INTERVAL '31 days')
       RETURNING id`,
      [orgId]
    );
    return (r.rows[0] as { id: string }).id;
  });

  const deleted = await deleteBackupsOlderThan(orgId, 30);
  assert.ok(deleted >= 1);

  const found = await getBackupById(orgId, oldId);
  assert.equal(found, null);
});

test('bkp01_5: job_record_created', async () => {
  const orgId = await getDefaultOrganizationId();
  const result = await runBackupJob(orgId);

  assert.ok(result.fullBackupId);
  const backup = await getBackupById(orgId, result.fullBackupId);
  assert.ok(backup);
  assert.equal(backup.backup_type, 'FULL');
  assert.equal(backup.status, 'CREATED');
});

test('bkp01_6: failure_handled', async () => {
  const orgId = await getDefaultOrganizationId();
  const beforeCount = (await listBackups(orgId, 100)).length;

  await assert.rejects(
    async () => {
      await runBackupJob('00000000-0000-0000-0000-000000000099');
    },
    /organizationId|organization_id|current_setting/
  );

  const afterCount = (await listBackups(orgId, 100)).length;
  assert.ok(afterCount >= beforeCount);
});
