import { getDatabasePool, withOrgContext } from '../config/database';
import { UserPayload } from './auth';

export interface QuotePayload {
  system_kwp?: number;
  annual_kwh?: number;
  estimated_cost?: number;
  [key: string]: unknown;
}

export interface Quote {
  id: string;
  customer_id: string;
  customer_name?: string;
  status: string;
  payload: QuotePayload;
  created_at: string;
}

export async function createQuoteDraft(
  input: { customer_id: string; payload?: Record<string, unknown> },
  user: UserPayload,
  organizationId: string
): Promise<Quote> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  return await withOrgContext(organizationId, async (client) => {
    try {
      await client.query('BEGIN');

      const quoteResult = await client.query(
        'INSERT INTO quotes (organization_id, customer_id, status, payload) VALUES ($1, $2, $3, $4) RETURNING id, customer_id, status, payload, created_at',
        [
          organizationId,
          input.customer_id,
          'draft',
          JSON.stringify(input.payload || {}),
        ]
      );

      const quote = quoteResult.rows[0] as Quote;

      await client.query(
        'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
        [
          user.email,
          'quote.create',
          JSON.stringify({ quote_id: quote.id, customer_id: input.customer_id }),
        ]
      );

      await client.query('COMMIT');
      return quote;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function updateQuotePayload(
  id: string,
  payload: QuotePayload,
  user: UserPayload,
  organizationId: string
): Promise<Quote> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  return await withOrgContext(organizationId, async (client) => {
    try {
      await client.query('BEGIN');

      const quoteResult = await client.query(
        'UPDATE quotes SET payload = $1 WHERE id = $2 RETURNING id, customer_id, status, payload, created_at',
        [JSON.stringify(payload), id]
      );

      if (quoteResult.rows.length === 0) {
        throw new Error('Quote not found');
      }

      const quote = quoteResult.rows[0] as Quote;

      await client.query(
        'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
        [
          user.email,
          'quote.update_payload',
          JSON.stringify({ quote_id: id, changes: payload }),
        ]
      );

      await client.query('COMMIT');
      return quote;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function updateQuoteStatus(
  id: string,
  newStatus: string,
  user: UserPayload,
  organizationId: string
): Promise<Quote> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const validStatuses = ['draft', 'reviewed', 'approved'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  return await withOrgContext(organizationId, async (client) => {
    try {
      await client.query('BEGIN');

      const currentResult = await client.query('SELECT status FROM quotes WHERE id = $1', [
        id,
      ]);

      if (currentResult.rows.length === 0) {
        throw new Error('Quote not found');
      }

    const currentStatus = currentResult.rows[0].status;

    // Forward-only validation
    const statusOrder = { draft: 0, reviewed: 1, approved: 2 };
    const currentIndex = statusOrder[currentStatus as keyof typeof statusOrder];
    const newIndex = statusOrder[newStatus as keyof typeof statusOrder];

    if (newIndex <= currentIndex) {
      throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
    }

    const quoteResult = await client.query(
      'UPDATE quotes SET status = $1 WHERE id = $2 RETURNING id, customer_id, status, payload, created_at',
      [newStatus, id]
    );

    const quote = quoteResult.rows[0] as Quote;

    await client.query(
      'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
      [
        user.email,
        'quote.update_status',
        JSON.stringify({ quote_id: id, from: currentStatus, to: newStatus }),
      ]
    );

      await client.query('COMMIT');
      return quote;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function getQuoteById(id: string): Promise<Quote | null> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, customer_id, status, payload, created_at FROM quotes WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const quote = result.rows[0];
  return {
    ...quote,
    payload: typeof quote.payload === 'string' ? JSON.parse(quote.payload) : quote.payload,
  };
}

export async function listQuotes(
  organizationId: string,
  limit: number = 50
): Promise<{ value: Quote[]; count: number }> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT 
         quotes.id, 
         quotes.customer_id, 
         customers.name as customer_name,
         quotes.status, 
         quotes.payload, 
         quotes.created_at 
       FROM quotes 
       JOIN customers ON quotes.customer_id = customers.id 
       ORDER BY quotes.created_at DESC 
       LIMIT $1`,
      [limit]
    );

    const countResult = await client.query('SELECT COUNT(*) FROM quotes');
    const count = parseInt(countResult.rows[0].count, 10);

    const value = result.rows.map((row) => ({
      id: row.id,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      status: row.status,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      created_at: row.created_at,
    })) as Quote[];

    return { value, count };
  });
}

export async function getQuoteDetailById(
  organizationId: string,
  quoteId: string
): Promise<Quote | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT 
         quotes.id,
         quotes.customer_id,
         customers.name as customer_name,
         quotes.status,
         quotes.payload,
         quotes.created_at
       FROM quotes
       JOIN customers ON quotes.customer_id = customers.id
       WHERE quotes.id = $1
       LIMIT 1`,
      [quoteId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      status: row.status,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      created_at: row.created_at,
    } as Quote;
  });
}
