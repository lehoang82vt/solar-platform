/**
 * JOB-04: Cleanup job – old sessions, expired OTPs, old notification logs, expiry warnings.
 */
import { withOrgContext, getDatabasePool } from '../config/database';
import { startJobRun, completeJobRun, failJobRun } from '../services/job-runner';
import { write as auditLogWrite } from '../services/auditLog';

export interface CleanupResult {
  skipped?: boolean;
  sessionsDeleted?: number;
  otpsDeleted?: number;
  logsDeleted?: number;
  expiryWarningsSent?: number;
}

/**
 * Run cleanup: delete expired sessions, expired unverified OTPs, old notification logs;
 * send expiry warnings for projects expiring in next 24h.
 */
export async function runCleanupJob(organizationId: string): Promise<CleanupResult> {
  const jobRunId = await startJobRun(organizationId, 'cleanup-job', 'CLEANUP');

  if (!jobRunId) {
    console.log('[Cleanup] Another instance running, skipping...');
    return { skipped: true };
  }

  try {
    const pool = getDatabasePool();
    if (!pool) throw new Error('Database pool not initialized');

    const orgRows = await pool.query<{ id: string }>(
      'SELECT id FROM organizations ORDER BY created_at ASC'
    );

    let sessionsDeleted = 0;
    let otpsDeleted = 0;
    let logsDeleted = 0;
    let expiryWarningsSent = 0;

    for (const org of orgRows.rows) {
      const sid = await withOrgContext(org.id, async (client) => {
        const r = await client.query(
          `DELETE FROM public_sessions WHERE organization_id = $1 AND expires_at < NOW()`,
          [org.id]
        );
        return r.rowCount ?? 0;
      });
      sessionsDeleted += sid;

      const oid = await withOrgContext(org.id, async (client) => {
        const r = await client.query(
          `DELETE FROM otp_challenges WHERE organization_id = $1 AND expires_at < NOW() AND verified = false`,
          [org.id]
        );
        return r.rowCount ?? 0;
      });
      otpsDeleted += oid;

      const lid = await withOrgContext(org.id, async (client) => {
        const r = await client.query(
          `DELETE FROM notification_logs
           WHERE organization_id = $1 AND status IN ('SENT', 'FAILED')
             AND created_at < NOW() - INTERVAL '90 days'`,
          [org.id]
        );
        return r.rowCount ?? 0;
      });
      logsDeleted += lid;

      const warned = await withOrgContext(org.id, async (client) => {
        const projs = await client.query<{ id: string; project_number: string | null; expires_at: Date }>(
          `SELECT id, project_number, expires_at FROM projects
           WHERE organization_id = $1
             AND expires_at IS NOT NULL
             AND expires_at > NOW()
             AND expires_at < NOW() + INTERVAL '1 day'
             AND status != 'CANCELLED'`,
          [org.id]
        );
        for (const p of projs.rows) {
          await auditLogWrite({
            organization_id: org.id,
            actor: 'SYSTEM',
            action: 'project.expiry_warning',
            entity_type: 'project',
            entity_id: p.id,
            metadata: { project_number: p.project_number, expires_at: p.expires_at },
          });
        }
        return projs.rows.length;
      });
      expiryWarningsSent += warned;
    }

    const result: CleanupResult = {
      sessionsDeleted,
      otpsDeleted,
      logsDeleted,
      expiryWarningsSent,
    };
    await completeJobRun(organizationId, jobRunId, result as Record<string, unknown>);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJobRun(organizationId, jobRunId, message);
    throw err;
  }
}
