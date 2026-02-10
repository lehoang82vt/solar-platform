import { withOrgContext } from '../config/database';
import { createQuote } from './quote-create';
import { isQuoteFrozen } from './quote-approval';

/**
 * Create new revision of a quote.
 * Marks old quote as superseded.
 */
export async function createQuoteRevision(
  organizationId: string,
  oldQuoteId: string
): Promise<Record<string, unknown>> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [oldQuoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const oldQuote = result.rows[0] as Record<string, unknown>;

    if (!['EXPIRED', 'DRAFT', 'CUSTOMER_REJECTED'].includes(oldQuote.status as string)) {
      throw new Error('Can only revise EXPIRED, DRAFT, or CUSTOMER_REJECTED quotes');
    }

    const newQuote = (await createQuote(organizationId, {
      project_id: oldQuote.project_id as string,
      customer_name: oldQuote.customer_name as string | undefined,
      customer_phone: oldQuote.customer_phone as string | undefined,
      customer_email: oldQuote.customer_email as string | undefined,
      customer_address: oldQuote.customer_address as string | undefined,
      notes: oldQuote.notes as string | undefined,
    })) as Record<string, unknown>;

    const nextVersion = (Number(oldQuote.version) || 1) + 1;

    await client.query(
      `UPDATE quotes 
       SET version = $1, parent_quote_id = $2
       WHERE id = $3`,
      [nextVersion, oldQuoteId, newQuote.id]
    );

    await client.query(
      `UPDATE quotes 
       SET superseded = true, updated_at = NOW()
       WHERE id = $1`,
      [oldQuoteId]
    );

    const updatedResult = await client.query(
      `SELECT * FROM quotes WHERE id = $1`,
      [newQuote.id]
    );

    const row = updatedResult.rows[0] as Record<string, unknown>;
    const rawSnapshot = row.financial_snapshot;
    const financial_snapshot =
      typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot || '{}') : rawSnapshot ?? {};

    return {
      ...row,
      financial_snapshot,
    };
  });
}

/**
 * Check if quote can be modified
 */
export function canModifyQuote(status: string): boolean {
  return status === 'DRAFT';
}

/**
 * Validate quote is modifiable (for routes)
 */
export function validateModifiable(status: string): void {
  if (isQuoteFrozen(status)) {
    throw new Error('Cannot modify frozen quote');
  }

  if (!canModifyQuote(status)) {
    throw new Error('Can only modify DRAFT quotes');
  }
}
