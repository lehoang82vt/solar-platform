/**
 * JOB-01 Job Runner: job tracking + locking (one RUNNING per job_name per org).
 */
import { withOrgContext } from '../config/database';

export interface JobRun {
  id: string;
  organization_id: string;
  job_name: string;
  job_type: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  started_at: Date;
  completed_at?: Date | null;
  duration_ms?: number | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Start a job run with concurrent lock.
 * Returns jobRunId if lock acquired, null if another instance is running.
 */
export async function startJobRun(
  organizationId: string,
  jobName: string,
  jobType: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return await withOrgContext(organizationId, async (client) => {
    try {
      const result = await client.query<{ id: string }>(
        `INSERT INTO job_runs (organization_id, job_name, job_type, status, metadata)
         VALUES ($1, $2, $3, 'RUNNING', $4)
         RETURNING id`,
        [organizationId, jobName, jobType, metadata ? JSON.stringify(metadata) : {}]
      );
      return result.rows[0].id;
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      if (code === '23505') {
        return null;
      }
      throw err;
    }
  });
}

/**
 * Mark job as completed.
 */
export async function completeJobRun(
  organizationId: string,
  jobRunId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE job_runs
       SET status = 'COMPLETED',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           metadata = COALESCE($3::jsonb, metadata)
       WHERE id = $1 AND organization_id = $2`,
      [jobRunId, organizationId, metadata ? JSON.stringify(metadata) : null]
    );
  });
}

/**
 * Mark job as failed.
 */
export async function failJobRun(
  organizationId: string,
  jobRunId: string,
  errorMessage: string
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE job_runs
       SET status = 'FAILED',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           error_message = $3
       WHERE id = $1 AND organization_id = $2`,
      [jobRunId, organizationId, errorMessage]
    );
  });
}

/**
 * Mark job as timeout.
 */
export async function timeoutJobRun(
  organizationId: string,
  jobRunId: string
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    await client.query(
      `UPDATE job_runs
       SET status = 'TIMEOUT',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           error_message = 'Job exceeded maximum execution time'
       WHERE id = $1 AND organization_id = $2`,
      [jobRunId, organizationId]
    );
  });
}

/**
 * Get job run by ID.
 */
export async function getJobRun(
  organizationId: string,
  jobRunId: string
): Promise<JobRun | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query<JobRun>(
      `SELECT * FROM job_runs WHERE id = $1 AND organization_id = $2`,
      [jobRunId, organizationId]
    );
    return result.rows[0] ?? null;
  });
}

/**
 * Cleanup old completed jobs (older than 30 days).
 */
export async function cleanupOldJobRuns(organizationId: string): Promise<number> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `DELETE FROM job_runs
       WHERE organization_id = $1
         AND status IN ('COMPLETED', 'FAILED', 'TIMEOUT')
         AND completed_at < NOW() - INTERVAL '30 days'`,
      [organizationId]
    );
    return result.rowCount ?? 0;
  });
}
