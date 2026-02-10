/**
 * JOB-02: Phone gate – cancel DEMO projects without phone older than 7 days.
 */
import { withOrgContext } from '../config/database';
import { startJobRun, completeJobRun, failJobRun } from '../services/job-runner';
import { write as auditLogWrite } from '../services/auditLog';

export interface PhoneGateResult {
  skipped?: boolean;
  total?: number;
  cancelled?: number;
}

/**
 * Cancel projects without phone that are >7 days old (DEMO, not already CANCELLED).
 */
export async function runPhoneGateJob(organizationId: string): Promise<PhoneGateResult> {
  const jobRunId = await startJobRun(organizationId, 'phone-gate-job', 'PHONE_GATE');

  if (!jobRunId) {
    console.log('[PhoneGate] Another instance running, skipping...');
    return { skipped: true };
  }

  try {
    const result = await withOrgContext(organizationId, async (client) => {
      const candidates = await client.query<{ id: string; project_number: string | null; status: string; created_at: Date }>(
        `SELECT id, project_number, status, created_at
         FROM projects
         WHERE organization_id = $1
           AND customer_phone IS NULL
           AND status = 'DEMO'
           AND created_at < NOW() - INTERVAL '7 days'
           AND status != 'CANCELLED'`,
        [organizationId]
      );

      let cancelled = 0;

      for (const project of candidates.rows) {
        await client.query(
          `UPDATE projects
           SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
          [project.id, organizationId]
        );

        await auditLogWrite({
          organization_id: organizationId,
          actor: 'SYSTEM',
          action: 'project.cancelled.phone_gate',
          entity_type: 'project',
          entity_id: project.id,
          metadata: {
            project_number: project.project_number,
            reason: 'No phone provided within 7 days',
          },
        });

        cancelled++;
      }

      return { total: candidates.rows.length, cancelled };
    });

    await completeJobRun(organizationId, jobRunId, result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJobRun(organizationId, jobRunId, message);
    throw err;
  }
}
