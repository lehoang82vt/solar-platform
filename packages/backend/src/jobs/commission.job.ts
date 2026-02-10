/**
 * JOB-03: Commission job – release commission for handovers >7 days old.
 */
import { withOrgContext } from '../config/database';
import { startJobRun, completeJobRun, failJobRun } from '../services/job-runner';
import { write as auditLogWrite } from '../services/auditLog';
import { eventBus } from '../services/event-bus';

export interface CommissionJobResult {
  skipped?: boolean;
  total?: number;
  released?: number;
}

/**
 * Release commission for completed handovers >7 days old (no existing commission for contract).
 */
export async function runCommissionJob(organizationId: string): Promise<CommissionJobResult> {
  const jobRunId = await startJobRun(organizationId, 'commission-job', 'COMMISSION');

  if (!jobRunId) {
    console.log('[Commission] Another instance running, skipping...');
    return { skipped: true };
  }

  try {
    const result = await withOrgContext(organizationId, async (client) => {
      const candidates = await client.query<{
        id: string;
        contract_id: string;
        handover_date: string;
        total_vnd: string;
        partner_id: string;
        commission_rate: string | null;
      }>(
        `SELECT h.id, h.contract_id, h.handover_date, c.total_vnd,
                p.partner_id, pt.commission_rate
         FROM handovers h
         JOIN contracts c ON h.contract_id = c.id AND c.organization_id = h.organization_id
         JOIN projects p ON c.project_id = p.id AND p.organization_id = h.organization_id
         LEFT JOIN partners pt ON p.partner_id = pt.id AND pt.organization_id = h.organization_id
         WHERE h.organization_id = $1
           AND h.cancelled_at IS NULL
           AND h.handover_date < NOW() - INTERVAL '7 days'
           AND NOT EXISTS (
             SELECT 1 FROM partner_commissions pc
             WHERE pc.contract_id = c.id
           )
           AND p.partner_id IS NOT NULL`,
        [organizationId]
      );

      let released = 0;

      for (const row of candidates.rows) {
        const ratePct = row.commission_rate != null ? Number(row.commission_rate) : 5;
        const totalVnd = Number(row.total_vnd) || 0;
        const commissionAmount = Math.floor((totalVnd * ratePct) / 100);

        const commResult = await client.query<{ id: string }>(
          `INSERT INTO partner_commissions
           (organization_id, partner_id, contract_id, amount_vnd, status)
           VALUES ($1, $2, $3, $4, 'AVAILABLE')
           RETURNING id`,
          [organizationId, row.partner_id, row.contract_id, commissionAmount]
        );

        await auditLogWrite({
          organization_id: organizationId,
          actor: 'SYSTEM',
          action: 'commission.released',
          entity_type: 'commission',
          entity_id: commResult.rows[0].id,
          metadata: {
            contract_id: row.contract_id,
            handover_id: row.id,
            amount_vnd: commissionAmount,
          },
        });

        await eventBus.emit({
          type: 'commission.approved',
          organizationId,
          data: {
            commission_id: commResult.rows[0].id,
            partner_id: row.partner_id,
            amount: commissionAmount,
          },
        });

        released++;
      }

      return { total: candidates.rows.length, released };
    });

    await completeJobRun(organizationId, jobRunId, result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJobRun(organizationId, jobRunId, message);
    throw err;
  }
}
