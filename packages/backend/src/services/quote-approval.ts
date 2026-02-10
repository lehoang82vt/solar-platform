import { withOrgContext } from '../config/database';
import { write as auditLogWrite } from './auditLog';

/**
 * Approve pending quote (Admin only)
 * AUD-01: Logs quote.approve to audit_logs.
 */
export async function approveQuote(
  organizationId: string,
  quoteId: string,
  approvedBy: string
): Promise<Record<string, unknown>> {
  const row = await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = result.rows[0] as Record<string, unknown>;

    if (quote.status !== 'PENDING_APPROVAL') {
      throw new Error('Only PENDING_APPROVAL quotes can be approved');
    }

    const updateResult = await client.query(
      `UPDATE quotes 
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, quoteId]
    );

    return updateResult.rows[0] as Record<string, unknown>;
  });

  await auditLogWrite({
    organization_id: organizationId,
    actor: approvedBy,
    action: 'quote.approve',
    entity_type: 'quote',
    entity_id: quoteId,
    metadata: { quote_id: quoteId, auto_approval: false },
  });

  return row;
}

/**
 * Reject pending quote (Admin only)
 * Sends back to DRAFT with rejection reason in notes
 */
export async function rejectQuote(
  organizationId: string,
  quoteId: string,
  rejectedBy: string,
  rejectionReason: string
): Promise<Record<string, unknown>> {
  if (!rejectionReason || rejectionReason.trim() === '') {
    throw new Error('Rejection reason is required');
  }

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = result.rows[0] as Record<string, unknown>;

    if (quote.status !== 'PENDING_APPROVAL') {
      throw new Error('Only PENDING_APPROVAL quotes can be rejected');
    }

    const currentNotes = (quote.notes as string) || '';
    const rejectionNote = `\n\n[REJECTED by ${rejectedBy}: ${rejectionReason}]`;
    const updatedNotes = currentNotes + rejectionNote;

    const updateResult = await client.query(
      `UPDATE quotes 
       SET status = 'DRAFT', notes = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [updatedNotes, quoteId]
    );

    const row = updateResult.rows[0] as Record<string, unknown>;
    return {
      ...row,
      rejection_reason: rejectionReason,
    };
  });
}

/**
 * Check if quote is frozen (cannot be modified)
 * Frozen: APPROVED, SENT, CUSTOMER_ACCEPTED
 */
export function isQuoteFrozen(status: string): boolean {
  const frozenStatuses = ['APPROVED', 'SENT', 'CUSTOMER_ACCEPTED'];
  return frozenStatuses.includes(status);
}

/**
 * Get quote status for frozen check
 */
export async function getQuoteStatus(
  organizationId: string,
  quoteId: string
): Promise<{ status: string }> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT status FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    return result.rows[0] as { status: string };
  });
}

/**
 * Get pending quotes for approval
 */
export async function getPendingQuotes(
  organizationId: string
): Promise<Record<string, unknown>[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes 
       WHERE organization_id = $1 AND status = 'PENDING_APPROVAL'
       ORDER BY created_at ASC`,
      [organizationId]
    );

    return result.rows.map((q: Record<string, unknown>) => {
      const raw = q.financial_snapshot;
      const financial_snapshot =
        typeof raw === 'string' ? JSON.parse(raw || '{}') : raw ?? {};
      return { ...q, financial_snapshot };
    });
  });
}
