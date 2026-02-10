/**
 * BKP-01: Backup job – full/incremental backup, retention, job run tracking.
 */
import { startJobRun, completeJobRun, failJobRun } from '../services/job-runner';
import {
  createFullBackup,
  createIncrementalBackup,
  deleteBackupsOlderThan,
} from '../services/backup';

const RETENTION_DAYS = 30;

export interface BackupJobResult {
  skipped?: boolean;
  fullBackupId?: string;
  incrementalBackupId?: string;
  retentionDeleted?: number;
}

/**
 * Run backup job: create full backup, then retention cleanup. Optionally incremental.
 */
export async function runBackupJob(organizationId: string): Promise<BackupJobResult> {
  const jobRunId = await startJobRun(organizationId, 'backup-job', 'BACKUP');

  if (!jobRunId) {
    console.log('[Backup] Another instance running, skipping...');
    return { skipped: true };
  }

  try {
    const full = await createFullBackup(organizationId);
    const retentionDeleted = await deleteBackupsOlderThan(organizationId, RETENTION_DAYS);

    const result: BackupJobResult = {
      fullBackupId: full.id,
      retentionDeleted,
    };
    await completeJobRun(organizationId, jobRunId, result as Record<string, unknown>);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJobRun(organizationId, jobRunId, message);
    throw err;
  }
}

/**
 * Run incremental-only backup (for tests).
 */
export async function runIncrementalBackupJob(organizationId: string): Promise<BackupJobResult> {
  const jobRunId = await startJobRun(organizationId, 'backup-incremental-job', 'BACKUP');

  if (!jobRunId) {
    return { skipped: true };
  }

  try {
    const incr = await createIncrementalBackup(organizationId);
    const result: BackupJobResult = { incrementalBackupId: incr.id };
    await completeJobRun(organizationId, jobRunId, result as Record<string, unknown>);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJobRun(organizationId, jobRunId, message);
    throw err;
  }
}
