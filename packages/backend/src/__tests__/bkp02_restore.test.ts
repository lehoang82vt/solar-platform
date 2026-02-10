/**
 * BKP-02: Restore service tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, withOrgContext } from '../config/database';
import { getDefaultOrganizationId } from '../services/auditLog';
import { createFullBackup } from '../services/backup';
import {
  listBackupsForRestore,
  restoreToTempSchema,
  isSuperAdmin,
} from '../services/restore';
import { getDatabasePool } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  const pool = getDatabasePool();
  if (pool) {
    const r = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'restore_%'`
    );
    for (const row of r.rows) {
      await pool.query(`DROP SCHEMA IF EXISTS ${row.schema_name} CASCADE`).catch(() => {});
    }
  }
});

test('bkp02_1: list_backups', async () => {
  const orgId = await getDefaultOrganizationId();
  const list = await listBackupsForRestore(orgId, 10);

  assert.ok(Array.isArray(list));
});

test('bkp02_2: audit_before_restore', async () => {
  const orgId = await getDefaultOrganizationId();
  const backup = await createFullBackup(orgId);

  await restoreToTempSchema(orgId, backup.id, 'super_admin@test.com');

  const audits = await withOrgContext(orgId, async (client) => {
    const r = await client.query(
      `SELECT action FROM audit_logs
       WHERE entity_id = $1 AND entity_type = 'backup'
       ORDER BY created_at ASC`,
      [backup.id]
    );
    return r.rows as { action: string }[];
  });

  const actions = audits.map((a) => a.action);
  assert.ok(actions.includes('backup.restore.started'));
  assert.ok(actions.includes('backup.restore.completed'));
});

test('bkp02_3: temp_schema_used', async () => {
  const orgId = await getDefaultOrganizationId();
  const backup = await createFullBackup(orgId);

  const result = await restoreToTempSchema(orgId, backup.id, 'admin@test.com');

  assert.ok(result.schemaName.startsWith('restore_'));
  assert.equal(result.status, 'COMPLETED');

  const pool = getDatabasePool();
  const r = await pool!.query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
    [result.schemaName]
  );
  assert.equal(r.rows.length, 1);
});

test('bkp02_4: super_admin_only', async () => {
  assert.equal(isSuperAdmin('super_admin'), true);
  assert.equal(isSuperAdmin('superadmin'), true);
  assert.equal(isSuperAdmin('admin'), false);
  assert.equal(isSuperAdmin('sales'), false);
  assert.equal(isSuperAdmin(undefined), false);
});

test('bkp02_5: status_tracking', async () => {
  const orgId = await getDefaultOrganizationId();
  const backup = await createFullBackup(orgId);

  const result = await restoreToTempSchema(orgId, backup.id, 'super_admin@test.com');

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.backupId, backup.id);
});
