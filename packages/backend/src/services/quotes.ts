import { getDatabasePool } from '../config/database';
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
  status: string;
  payload: QuotePayload;
  created_at: string;
}

export async function createQuoteDraft(
  input: { customer_id: string; payload?: Record<string, unknown> },
  user: UserPayload
): Promise<Quote> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const quoteResult = await client.query(
      'INSERT INTO quotes (customer_id, status, payload) VALUES ($1, $2, $3) RETURNING id, customer_id, status, payload, created_at',
      [input.customer_id, 'draft', JSON.stringify(input.payload || {})]
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
  } finally {
    client.release();
  }
}

export async function updateQuotePayload(
  id: string,
  payload: QuotePayload,
  user: UserPayload
): Promise<Quote> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();
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
  } finally {
    client.release();
  }
}

export async function updateQuoteStatus(
  id: string,
  newStatus: string,
  user: UserPayload
): Promise<Quote> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const validStatuses = ['draft', 'reviewed', 'approved'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      'SELECT status FROM quotes WHERE id = $1',
      [id]
    );

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
  } finally {
    client.release();
  }
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

export async function listQuotes(limit: number = 50): Promise<Quote[]> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, customer_id, status, payload, created_at FROM quotes ORDER BY created_at DESC LIMIT $1',
    [limit]
  );

  return result.rows.map((row) => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  })) as Quote[];
}
