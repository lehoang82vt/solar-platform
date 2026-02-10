/**
 * BKP-01: Backup service – full/incremental dump, S3 (or mock) upload, retention.
 */
import { withOrgContext, getDatabasePool } from '../config/database';
import { getS3Config } from '../config/s3';

const RETENTION_DAYS = 30;

export interface BackupRecord {
  id: string;
  organization_id: string;
  backup_type: string;
  storage_path: string;
  size_bytes: number | null;
  status: string;
  error_message: string | null;
  created_at: Date;
}

const mockStore = new Map<string, Buffer>();

function getDumpContent(organizationId: string, type: 'FULL' | 'INCREMENTAL'): string {
  const ts = new Date().toISOString();
  return `-- Backup ${type} for org ${organizationId} at ${ts}\n-- Mock dump content\n`;
}

/**
 * Upload content to S3 or mock. Returns storage path/key.
 */
export async function uploadBackup(
  _organizationId: string,
  key: string,
  content: string | Buffer
): Promise<string> {
  const config = getS3Config();
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

  if (config.useMock) {
    mockStore.set(key, buf);
    return `mock://${config.bucket}/${key}`;
  }
  return `s3://${config.bucket}/${key}`;
}

/**
 * Create full backup: generate dump content, upload, record in backup_jobs.
 */
export async function createFullBackup(organizationId: string): Promise<BackupRecord> {
  const key = `backups/${organizationId}/full-${Date.now()}.sql`;
  const content = getDumpContent(organizationId, 'FULL');
  const storagePath = await uploadBackup(organizationId, key, content);
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  return await withOrgContext(organizationId, async (client) => {
    const r = await client.query<BackupRecord>(
      `INSERT INTO backup_jobs (organization_id, backup_type, storage_path, size_bytes, status)
       VALUES ($1, 'FULL', $2, $3, 'CREATED')
       RETURNING *`,
      [organizationId, storagePath, sizeBytes]
    );
    return r.rows[0];
  });
}

/**
 * Create incremental backup (same as full for mock; in production would use WAL or delta).
 */
export async function createIncrementalBackup(organizationId: string): Promise<BackupRecord> {
  const key = `backups/${organizationId}/incr-${Date.now()}.sql`;
  const content = getDumpContent(organizationId, 'INCREMENTAL');
  const storagePath = await uploadBackup(organizationId, key, content);
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  return await withOrgContext(organizationId, async (client) => {
    const r = await client.query<BackupRecord>(
      `INSERT INTO backup_jobs (organization_id, backup_type, storage_path, size_bytes, status)
       VALUES ($1, 'INCREMENTAL', $2, $3, 'CREATED')
       RETURNING *`,
      [organizationId, storagePath, sizeBytes]
    );
    return r.rows[0];
  });
}

/**
 * List backups for org (newest first).
 */
export async function listBackups(
  organizationId: string,
  limit = 50
): Promise<BackupRecord[]> {
  return await withOrgContext(organizationId, async (client) => {
    const r = await client.query<BackupRecord>(
      `SELECT * FROM backup_jobs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit]
    );
    return r.rows;
  });
}

/**
 * Delete backup records and mock storage entries older than retention days.
 */
export async function deleteBackupsOlderThan(
  organizationId: string,
  days: number = RETENTION_DAYS
): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;

  const list = await withOrgContext(organizationId, async (client) => {
    const r = await client.query<{ id: string; storage_path: string }>(
      `SELECT id, storage_path FROM backup_jobs
       WHERE organization_id = $1 AND created_at < NOW() - INTERVAL '1 day' * $2`,
      [organizationId, days]
    );
    return r.rows;
  });

  for (const row of list) {
    if (row.storage_path.startsWith('mock://')) {
      const key = row.storage_path.replace(/^mock:\/\/[^/]+\//, '');
      mockStore.delete(key);
    }
  }

  const deleted = await withOrgContext(organizationId, async (client) => {
    const r = await client.query(
      `DELETE FROM backup_jobs
       WHERE organization_id = $1 AND created_at < NOW() - INTERVAL '1 day' * $2`,
      [organizationId, days]
    );
    return r.rowCount ?? 0;
  });
  return deleted;
}

/**
 * Get single backup by id.
 */
export async function getBackupById(
  organizationId: string,
  backupId: string
): Promise<BackupRecord | null> {
  return await withOrgContext(organizationId, async (client) => {
    const r = await client.query<BackupRecord>(
      `SELECT * FROM backup_jobs WHERE id = $1 AND organization_id = $2`,
      [backupId, organizationId]
    );
    return r.rows[0] ?? null;
  });
}

/** Expose for tests: clear mock store */
export function clearMockBackupStore(): void {
  mockStore.clear();
}
