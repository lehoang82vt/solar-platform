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

export interface QuoteWithCustomer extends Quote {
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
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
): Promise<{ quote: Quote; from: string; to: string }> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const validStatuses = ['draft', 'sent', 'accepted', 'rejected'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid status');
  }

  return await withOrgContext(organizationId, async (client) => {
    try {
      await client.query('BEGIN');

      const currentResult = await client.query('SELECT status FROM quotes WHERE id = $1', [id]);

      if (currentResult.rows.length === 0) {
        throw new Error('Quote not found');
      }

      const currentStatus = currentResult.rows[0].status as string;

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
      return { quote, from: currentStatus, to: newStatus };
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
  limit: number = 20,
  offset: number = 0,
  filters?: { status?: string; q?: string }
): Promise<{ value: Quote[]; count: number }> {
  return await withOrgContext(organizationId, async (client) => {
    const conditions: string[] = [];
    const params: (number | string)[] = [limit, offset];
    let paramIndex = 3;

    if (filters?.status) {
      conditions.push(`quotes.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex += 1;
    }
    if (filters?.q) {
      const likePattern = '%' + filters.q + '%';
      conditions.push(
        `(customers.name ILIKE $${paramIndex} OR customers.phone ILIKE $${paramIndex} OR customers.email ILIKE $${paramIndex})`
      );
      params.push(likePattern);
      paramIndex += 1;
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const result = await client.query(
      `SELECT 
         quotes.id, 
         quotes.customer_id, 
         customers.name as customer_name,
         quotes.status, 
         quotes.created_at 
       FROM quotes 
       JOIN customers ON quotes.customer_id = customers.id 
       ${whereClause}
       ORDER BY quotes.created_at DESC 
       LIMIT $1
       OFFSET $2`,
      params
    );

    const countParams: (string | number)[] = [];
    const countConditions: string[] = [];
    let countParamIndex = 1;
    if (filters?.status) {
      countConditions.push(`quotes.status = $${countParamIndex}`);
      countParams.push(filters.status);
      countParamIndex += 1;
    }
    if (filters?.q) {
      const likePattern = '%' + filters.q + '%';
      countConditions.push(
        `(customers.name ILIKE $${countParamIndex} OR customers.phone ILIKE $${countParamIndex} OR customers.email ILIKE $${countParamIndex})`
      );
      countParams.push(likePattern);
      countParamIndex += 1;
    }
    const countWhere =
      countConditions.length > 0
        ? ' FROM quotes JOIN customers ON quotes.customer_id = customers.id WHERE ' +
          countConditions.join(' AND ')
        : ' FROM quotes';
    const countResult = await client.query(
      `SELECT COUNT(*)::int ${countWhere}`,
      countParams.length > 0 ? countParams : undefined
    );
    const count = parseInt(String(countResult.rows[0].count), 10);

    const value = result.rows.map((row) => ({
      id: row.id,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      status: row.status,
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidQuoteId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Get quote by id with customer join (org-safe). Returns null if not found.
 */
export async function getQuoteWithCustomer(
  id: string,
  organizationId: string
): Promise<QuoteWithCustomer | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT 
         q.id,
         q.customer_id,
         q.status,
         q.payload,
         q.created_at,
         c.name as customer_name,
         c.phone as customer_phone,
         c.email as customer_email
       FROM quotes q
       JOIN customers c ON q.customer_id = c.id
       WHERE q.id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      customer_id: row.customer_id,
      status: row.status,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      created_at: row.created_at,
      customer_name: row.customer_name ?? '',
      customer_phone: row.customer_phone ?? undefined,
      customer_email: row.customer_email ?? undefined,
    } as QuoteWithCustomer;
  });
}
