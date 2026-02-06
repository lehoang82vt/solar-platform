import { getDatabasePool, withOrgContext } from '../config/database';
import { getProjectByIdOrgSafe } from './projects';
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

/** Payload for POST /api/quotes v1 (F-25): create quote from project. */
export interface CreateQuoteFromProjectPayload {
  project_id: string;
  title?: string;
}

/** Result shape for 201 response (F-25). */
export interface CreateQuoteFromProjectResult {
  id: string;
  project_id: string;
  customer_name: string;
  status: string;
  created_at: string;
}

export type CreateQuoteFromProjectOutcome =
  | { kind: 'project_not_found' }
  | { kind: 'customer_not_found' }
  | { kind: 'ok'; quote: CreateQuoteFromProjectResult };

/**
 * Create quote from project (org-safe). Resolves project, snapshots customer_name,
 * finds customer by name in org for FK, inserts quote with payload containing project_id.
 */
export async function createQuoteFromProject(
  organizationId: string,
  payload: CreateQuoteFromProjectPayload
): Promise<CreateQuoteFromProjectOutcome> {
  const project = await getProjectByIdOrgSafe(payload.project_id, organizationId);
  if (!project) {
    return { kind: 'project_not_found' };
  }

  const customer_name = project.name;

  return await withOrgContext(organizationId, async (client) => {
    const custResult = await client.query(
      'SELECT id FROM customers WHERE name = $1 LIMIT 1',
      [customer_name]
    );
    if (custResult.rows.length === 0) {
      return { kind: 'customer_not_found' };
    }
    const customer_id = (custResult.rows[0] as { id: string }).id;

    const quotePayload = {
      project_id: payload.project_id,
      customer_name_snapshot: customer_name,
      ...(payload.title !== undefined && { title: payload.title }),
    };

    const quoteResult = await client.query(
      `INSERT INTO quotes (organization_id, customer_id, status, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [
        organizationId,
        customer_id,
        'draft',
        JSON.stringify(quotePayload),
      ]
    );
    const row = quoteResult.rows[0] as { id: string; created_at: string };
    return {
      kind: 'ok',
      quote: {
        id: row.id,
        project_id: payload.project_id,
        customer_name,
        status: 'draft',
        created_at: row.created_at,
      },
    };
  });
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

/** Detail shape for GET /api/quotes/:id v3 (F-26). project_id and customer_name_snapshot from payload when present. */
export interface QuoteDetailV3 {
  id: string;
  customer_id: string;
  customer_name: string;
  status: string;
  created_at: string;
  payload: QuotePayload;
  project_id?: string;
  customer_name_snapshot?: string;
  customer_phone?: string;
  customer_email?: string;
}

/**
 * Get quote detail v3 (org-safe). Returns null if not found.
 * Includes project_id and customer_name_snapshot from payload when present (F-25 path).
 */
export async function getQuoteDetailV3(
  id: string,
  organizationId: string
): Promise<QuoteDetailV3 | null> {
  const quote = await getQuoteWithCustomer(id, organizationId);
  if (!quote) {
    return null;
  }
  const payload = quote.payload as Record<string, unknown> | undefined;
  const project_id = payload?.project_id != null ? String(payload.project_id) : undefined;
  const customer_name_snapshot =
    payload?.customer_name_snapshot != null ? String(payload.customer_name_snapshot) : undefined;
  return {
    id: quote.id,
    customer_id: quote.customer_id,
    customer_name: quote.customer_name,
    status: quote.status,
    created_at: quote.created_at,
    payload: quote.payload,
    ...(project_id !== undefined && { project_id }),
    ...(customer_name_snapshot !== undefined && { customer_name_snapshot }),
    ...(quote.customer_phone !== undefined && { customer_phone: quote.customer_phone }),
    ...(quote.customer_email !== undefined && { customer_email: quote.customer_email }),
  };
}

/**
 * Delete quote by id (org-safe). Returns deleted row data or null if not found.
 */
export async function deleteQuote(
  id: string,
  organizationId: string
): Promise<Pick<Quote, 'id' | 'customer_id' | 'status'> | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      'DELETE FROM quotes WHERE id = $1 RETURNING id, customer_id, status',
      [id]
    );
    if (result.rowCount === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      id: row.id,
      customer_id: row.customer_id,
      status: row.status,
    };
  });
}
