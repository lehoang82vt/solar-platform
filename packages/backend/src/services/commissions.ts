import { withOrgContext } from '../config/database';
import { write as auditLogWrite } from './auditLog';
import { eventBus } from './event-bus';

export interface Commission {
  id: string;
  partner_id: string;
  lead_id: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  created_at: string;
}

/**
 * List partner commissions
 * Placeholder: Returns empty array (commission logic not yet implemented)
 */
export async function listPartnerCommissions(
  organizationId: string,
  _partnerId: string,
  _statusFilter?: string
): Promise<Commission[]> {
  return await withOrgContext(organizationId, async () => {
    return [];
  });
}

/**
 * AUD-01: Record commission payment in audit log.
 * Call when a commission is marked PAID (or when recording a payment event).
 * NTF-02: Emits commission.paid for notification.
 */
export async function recordCommissionPayment(
  organizationId: string,
  actor: string,
  commissionId: string,
  amount: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLogWrite({
    organization_id: organizationId,
    actor,
    action: 'commission.payment',
    entity_type: 'commission',
    entity_id: commissionId,
    metadata: { commission_id: commissionId, amount, ...metadata },
  });
  const partnerId = metadata?.partner_id as string | undefined;
  if (partnerId != null) {
    await eventBus.emit({
      type: 'commission.paid',
      organizationId,
      data: { commission_id: commissionId, partner_id: partnerId, amount },
    });
  }
}
