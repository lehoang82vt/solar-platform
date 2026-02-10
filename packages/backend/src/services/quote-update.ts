import { withOrgContext } from '../config/database';
import { createQuote } from './quote-create';

export interface UpdateQuoteInput {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  notes?: string;
  recalculate?: boolean; // Trigger recalculation from system config
}

/**
 * Update quote (DRAFT only)
 */
export async function updateQuote(
  organizationId: string,
  quoteId: string,
  input: UpdateQuoteInput
): Promise<Record<string, unknown>> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = result.rows[0] as Record<string, unknown>;

    if (quote.status !== 'DRAFT') {
      throw new Error('Only DRAFT quotes can be updated');
    }

    if (input.recalculate) {
      const projectId = quote.project_id as string;

      const newQuote = (await createQuote(organizationId, {
        project_id: projectId,
        customer_name: (input.customer_name ?? quote.customer_name) as string | undefined,
        customer_phone: (input.customer_phone ?? quote.customer_phone) as string | undefined,
        customer_email: (input.customer_email ?? quote.customer_email) as string | undefined,
        customer_address: (input.customer_address ?? quote.customer_address) as string | undefined,
        notes: (input.notes ?? quote.notes) as string | undefined,
      })) as Record<string, unknown>;

      const nextVersion = (Number(quote.version) || 1) + 1;
      await client.query(
        `UPDATE quotes SET version = $1 WHERE id = $2`,
        [nextVersion, newQuote.id]
      );

      return { ...newQuote, version: nextVersion };
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (input.customer_name !== undefined) {
      updates.push(`customer_name = $${paramIdx++}`);
      values.push(input.customer_name);
    }
    if (input.customer_phone !== undefined) {
      updates.push(`customer_phone = $${paramIdx++}`);
      values.push(input.customer_phone);
    }
    if (input.customer_email !== undefined) {
      updates.push(`customer_email = $${paramIdx++}`);
      values.push(input.customer_email);
    }
    if (input.customer_address !== undefined) {
      updates.push(`customer_address = $${paramIdx++}`);
      values.push(input.customer_address);
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIdx++}`);
      values.push(input.notes);
    }

    if (updates.length === 0) {
      return quote;
    }

    updates.push('updated_at = NOW()');
    values.push(quoteId);

    const updatedResult = await client.query(
      `UPDATE quotes SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    return updatedResult.rows[0] as Record<string, unknown>;
  });
}

/**
 * Get quote by ID (with line items)
 */
export async function getQuote(
  organizationId: string,
  quoteId: string
): Promise<Record<string, unknown>> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM quotes WHERE id = $1 AND organization_id = $2`,
      [quoteId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = result.rows[0] as Record<string, unknown>;
    const rawSnapshot = quote.financial_snapshot;
    const financial_snapshot =
      typeof rawSnapshot === 'string'
        ? JSON.parse(rawSnapshot || '{}')
        : (rawSnapshot ?? {});

    const lineItemsResult = await client.query(
      `SELECT * FROM quote_line_items 
       WHERE quote_id = $1 AND organization_id = $2 
       ORDER BY line_order`,
      [quoteId, organizationId]
    );

    return {
      ...quote,
      financial_snapshot,
      line_items: lineItemsResult.rows,
    };
  });
}
