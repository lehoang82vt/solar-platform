import { withOrgContext } from '../config/database';
import { QUOTE_STATE_TRANSITIONS } from '../../../shared/src/constants/states';
import type { QuoteState } from '../../../shared/src/constants/states';
import { checkSalesBlocked, write as auditLogWrite } from './auditLog';

/**
 * Submit quote for approval.
 * Auto-approves if financial level is PASS. AUD-01: Logs quote.approve with auto_approval when PASS.
 */
export async function submitQuote(
  organizationId: string,
  quoteId: string,
  submittedBy?: string
): Promise<Record<string, unknown>> {
  checkSalesBlocked(organizationId);
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = result.rows[0] as Record<string, unknown>;
    const currentStatus = quote.status as QuoteState;
    const allowedTransitions = QUOTE_STATE_TRANSITIONS[currentStatus];

    if (!allowedTransitions?.includes('PENDING_APPROVAL')) {
      throw new Error(`Cannot submit quote from status ${currentStatus}`);
    }

    const rawSnapshot = quote.financial_snapshot;
    const snapshot =
      typeof rawSnapshot === 'string'
        ? JSON.parse(rawSnapshot || '{}')
        : (rawSnapshot ?? {}) as Record<string, unknown>;

    if (snapshot.level === 'BLOCK') {
      throw new Error('Cannot submit quote: financial validation BLOCKED');
    }

    let newStatus = 'PENDING_APPROVAL';
    let approvedBy: string | null = null;
    let approvedAt: Date | null = null;

    if (snapshot.level === 'PASS') {
      newStatus = 'APPROVED';
      approvedBy = submittedBy ?? null;
      approvedAt = new Date();
    }

    const updateResult = await client.query(
      `UPDATE quotes 
       SET status = $1, approved_by = $2, approved_at = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, approvedBy, approvedAt, quoteId]
    );

    const row = updateResult.rows[0] as Record<string, unknown>;

    if (newStatus === 'APPROVED' && snapshot.level === 'PASS') {
      await auditLogWrite({
        organization_id: organizationId,
        actor: submittedBy ?? 'system',
        action: 'quote.approve',
        entity_type: 'quote',
        entity_id: quoteId,
        metadata: { quote_id: quoteId, auto_approval: true },
      });
    }

    return {
      ...row,
      auto_approved: snapshot.level === 'PASS',
    };
  });
}

/**
 * Check if quote can be submitted
 */
export async function canSubmitQuote(
  organizationId: string,
  quoteId: string
): Promise<{ can_submit: boolean; reason?: string }> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      return { can_submit: false, reason: 'Quote not found' };
    }

    const quote = result.rows[0] as Record<string, unknown>;
    const currentStatus = quote.status as QuoteState;
    const allowedTransitions = QUOTE_STATE_TRANSITIONS[currentStatus];

    if (!allowedTransitions?.includes('PENDING_APPROVAL')) {
      return { can_submit: false, reason: `Cannot submit from status ${quote.status}` };
    }

    const rawSnapshot = quote.financial_snapshot;
    const snapshot =
      typeof rawSnapshot === 'string'
        ? JSON.parse(rawSnapshot || '{}')
        : (rawSnapshot ?? {}) as Record<string, unknown>;

    if (snapshot.level === 'BLOCK') {
      return { can_submit: false, reason: 'Financial validation BLOCKED' };
    }

    return { can_submit: true };
  });
}
