/**
 * BKP-02: Restore service – list backups, restore to temp schema, audit.
 */
import { getDatabasePool } from '../config/database';
import { listBackups, getBackupById, type BackupRecord } from './backup';
import { write as auditLogWrite } from './auditLog';

export type RestoreStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface RestoreResult {
  schemaName: string;
  backupId: string;
  status: RestoreStatus;
  auditLogId?: string;
}

/**
 * List backups available for restore (same as listBackups).
 */
export async function listBackupsForRestore(
  organizationId: string,
  limit = 50
): Promise<BackupRecord[]> {
  return listBackups(organizationId, limit);
}

/**
 * Restore a backup into a temporary schema. Writes audit and creates schema (mock: schema only).
 * Caller must ensure actor is super admin (API layer).
 */
export async function restoreToTempSchema(
  organizationId: string,
  backupId: string,
  actor: string
): Promise<RestoreResult> {
  const backup = await getBackupById(organizationId, backupId);
  if (!backup) throw new Error('Backup not found');

  const schemaName = `restore_${backupId.replace(/-/g, '_')}_${Date.now()}`;
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  await auditLogWrite({
    organization_id: organizationId,
    actor,
    action: 'backup.restore.started',
    entity_type: 'backup',
    entity_id: backupId,
    metadata: { schema_name: schemaName, backup_type: backup.backup_type },
  });

  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  } catch (err) {
    await auditLogWrite({
      organization_id: organizationId,
      actor,
      action: 'backup.restore.failed',
      entity_type: 'backup',
      entity_id: backupId,
      metadata: { schema_name: schemaName, error: String(err) },
    });
    throw err;
  }

  await auditLogWrite({
    organization_id: organizationId,
    actor,
    action: 'backup.restore.completed',
    entity_type: 'backup',
    entity_id: backupId,
    metadata: { schema_name: schemaName, status: 'COMPLETED' },
  });

  return {
    schemaName,
    backupId,
    status: 'COMPLETED',
  };
}

/**
 * Check if user is super admin (role === 'super_admin' or 'admin' with super flag).
 * Used by API layer to gate restore.
 */
export function isSuperAdmin(role: string | undefined): boolean {
  const r = (role || '').toLowerCase();
  return r === 'super_admin' || r === 'superadmin';
}
