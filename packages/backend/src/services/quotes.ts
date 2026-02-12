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
  /** From column quotes.price_total (for contract_value). */
  price_total?: number | null;
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

      const priceTotal =
        payload && typeof (payload as Record<string, unknown>).price_total === 'number'
          ? (payload as Record<string, unknown>).price_total
          : null;
      const quoteResult = await client.query(
        `UPDATE quotes SET payload = $1, price_total = $2 WHERE id = $3
         RETURNING id, customer_id, status, payload, created_at`,
        [JSON.stringify(payload), priceTotal, id]
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
        `(quotes.customer_name ILIKE $${paramIndex} OR quotes.customer_phone ILIKE $${paramIndex} OR quotes.customer_email ILIKE $${paramIndex})`
      );
      params.push(likePattern);
      paramIndex += 1;
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const result = await client.query(
      `SELECT
         quotes.id,
         quotes.customer_name,
         quotes.status,
         quotes.created_at
       FROM quotes
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
        `(quotes.customer_name ILIKE $${countParamIndex} OR quotes.customer_phone ILIKE $${countParamIndex} OR quotes.customer_email ILIKE $${countParamIndex})`
      );
      countParams.push(likePattern);
      countParamIndex += 1;
    }
    const countWhere =
      countConditions.length > 0
        ? ' FROM quotes WHERE ' + countConditions.join(' AND ')
        : ' FROM quotes';
    const countResult = await client.query(
      `SELECT COUNT(*)::int ${countWhere}`,
      countParams.length > 0 ? countParams : undefined
    );
    const count = parseInt(String(countResult.rows[0].count), 10);

    const value = result.rows.map((row) => ({
      id: row.id,
      customer_name: row.customer_name,
      status: row.status,
      created_at: row.created_at,
    })) as Quote[];

    return { value, count };
  });
}

/** F-30: List quotes v2 item shape (join customer). */
export interface QuoteListV2Item {
  id: string;
  status: string;
  price_total: number | null;
  created_at: string;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
}

export interface ListQuotesV2Result {
  value: QuoteListV2Item[];
  paging: { limit: number; offset: number; count: number };
}

/**
 * List quotes v2: join customer (name/phone/email), pagination, optional status (exact case-insensitive), search (ILIKE customer name/phone/email).
 * limit default 20 max 100, offset default 0. Order by quotes.created_at DESC.
 */
export async function listQuotesV2(
  organizationId: string,
  limit: number,
  offset: number,
  filters?: { status?: string; search?: string }
): Promise<ListQuotesV2Result> {
  return await withOrgContext(organizationId, async (client) => {
    const conditions: string[] = [];
    const params: (number | string)[] = [limit, offset];
    let paramIndex = 3;

    if (filters?.status != null && filters.status.trim() !== '') {
      conditions.push(`LOWER(TRIM(quotes.status)) = LOWER(TRIM($${paramIndex}))`);
      params.push(filters.status.trim());
      paramIndex += 1;
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = '%' + filters.search.trim() + '%';
      conditions.push(
        `(quotes.customer_name ILIKE $${paramIndex} OR quotes.customer_phone ILIKE $${paramIndex} OR quotes.customer_email ILIKE $${paramIndex})`
      );
      params.push(likePattern);
      paramIndex += 1;
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const result = await client.query(
      `SELECT
         quotes.id,
         quotes.status,
         quotes.total_vnd as price_total,
         quotes.created_at,
         quotes.customer_name,
         quotes.customer_phone,
         quotes.customer_email
       FROM quotes
       ${whereClause}
       ORDER BY quotes.created_at DESC
       LIMIT $1
       OFFSET $2`,
      params
    );

    const countParams: (string | number)[] = [];
    const countConditions: string[] = [];
    let countParamIndex = 1;
    if (filters?.status != null && filters.status.trim() !== '') {
      countConditions.push(`LOWER(TRIM(quotes.status)) = LOWER(TRIM($${countParamIndex}))`);
      countParams.push(filters.status.trim());
      countParamIndex += 1;
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = '%' + filters.search.trim() + '%';
      countConditions.push(
        `(quotes.customer_name ILIKE $${countParamIndex} OR quotes.customer_phone ILIKE $${countParamIndex} OR quotes.customer_email ILIKE $${countParamIndex})`
      );
      countParams.push(likePattern);
      countParamIndex += 1;
    }
    const countWhere =
      countConditions.length > 0
        ? ' FROM quotes WHERE ' + countConditions.join(' AND ')
        : ' FROM quotes';
    const countResult = await client.query(
      `SELECT COUNT(*)::int ${countWhere}`,
      countParams.length > 0 ? countParams : undefined
    );
    const count = parseInt(String(countResult.rows[0].count), 10);

    const value = (result.rows as Array<{
      id: string;
      status: string;
      price_total: unknown;
      created_at: string;
      customer_name: string | null;
      customer_phone: string | null;
      customer_email: string | null;
    }>).map((row) => ({
      id: row.id,
      status: row.status,
      price_total: row.price_total != null ? Number(row.price_total) : null,
      created_at: row.created_at,
      customer: {
        name: row.customer_name,
        phone: row.customer_phone,
        email: row.customer_email,
      },
    }));

    return {
      value,
      paging: { limit, offset, count },
    };
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
  | { kind: 'project_missing_customer' }
  | { kind: 'customer_not_found'; customer_id: string; project_id: string }
  | { kind: 'ok'; quote: CreateQuoteFromProjectResult };

/**
 * Create quote from project (org-safe). Resolves project.customer_id,
 * validates customer by id in same org context, inserts quote with payload containing project_id.
 */
export async function createQuoteFromProject(
  organizationId: string,
  payload: CreateQuoteFromProjectPayload
): Promise<CreateQuoteFromProjectOutcome> {
  const project = await getProjectByIdOrgSafe(payload.project_id, organizationId);
  if (!project) {
    return { kind: 'project_not_found' };
  }

  if (!project.customer_id) {
    return { kind: 'project_missing_customer' };
  }

  const customer_id = project.customer_id;
  const customer_name = project.name;

  return await withOrgContext(organizationId, async (client) => {
    const custResult = await client.query(
      'SELECT id, name FROM customers WHERE id = $1 LIMIT 1',
      [customer_id]
    );
    if (custResult.rows.length === 0) {
      return { kind: 'customer_not_found', customer_id, project_id: payload.project_id };
    }
    const customer = custResult.rows[0] as { id: string; name: string | null };
    const customerNameSnapshot = customer.name ?? customer_name;

    const quotePayload = {
      project_id: payload.project_id,
      customer_name_snapshot: customerNameSnapshot,
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
        customer_name: customerNameSnapshot,
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
         q.price_total,
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
      price_total: row.price_total != null ? Number(row.price_total) : null,
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

/** F-34: Quote detail v2 response (customer, project, contract, handover joins). */
export interface QuoteDetailV2 {
  id: string;
  quote_number: string;
  version: number;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  system_size_kwp: number | null;
  panel_count: number | null;
  subtotal_vnd: number | null;
  discount_vnd: number | null;
  tax_vnd: number | null;
  total_vnd: number | null;
  financial_snapshot: Record<string, unknown> | null;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
  project_id: string | null;
  line_items: Array<{
    id: string;
    item_type: string;
    description: string;
    sku: string | null;
    quantity: number;
    unit: string | null;
    unit_price_vnd: number;
    total_price_vnd: number;
  }>;
  // Legacy compatibility
  project: { id: string; customer_name: string; address: string | null; status: string } | null;
  contract: { id: string; contract_number: string; status: string } | null;
  handover: { id: string; status: string } | null;
}

/** Result of getQuoteDetailV2 including audit flags. */
export interface GetQuoteDetailV2Result {
  quote: QuoteDetailV2;
  has_project: boolean;
  has_contract: boolean;
  has_handover: boolean;
}

/**
 * Get quote detail v2 (org-safe). Uses inline customer data from quotes table.
 * Joins: project (quotes.project_id), contract (contracts.quote_id), handover (via contract).
 * Returns null if quote not found.
 */
export async function getQuoteDetailV2(
  id: string,
  organizationId: string
): Promise<GetQuoteDetailV2Result | null> {
  return await withOrgContext(organizationId, async (client) => {
    const quoteResult = await client.query(
      `SELECT q.id, q.quote_number, q.version, q.status, q.created_at,
              q.customer_name, q.customer_phone, q.customer_email, q.customer_address,
              q.system_size_kwp, q.panel_count,
              q.subtotal_vnd, q.discount_vnd, q.tax_vnd, q.total_vnd,
              q.financial_snapshot, q.notes, q.valid_until, q.project_id
       FROM quotes q
       WHERE q.id = $1 LIMIT 1`,
      [id]
    );
    if (quoteResult.rows.length === 0) {
      return null;
    }
    const q = quoteResult.rows[0] as {
      id: string;
      quote_number: string;
      version: number;
      status: string;
      created_at: string;
      customer_name: string | null;
      customer_phone: string | null;
      customer_email: string | null;
      customer_address: string | null;
      system_size_kwp: unknown;
      panel_count: unknown;
      subtotal_vnd: unknown;
      discount_vnd: unknown;
      tax_vnd: unknown;
      total_vnd: unknown;
      financial_snapshot: unknown;
      notes: string | null;
      valid_until: string | null;
      project_id: string | null;
    };

    // Fetch line items if quote_line_items table exists
    let lineItems: QuoteDetailV2['line_items'] = [];
    try {
      const liResult = await client.query(
        `SELECT id, item_type, description, sku, quantity, unit, unit_price_vnd, total_price_vnd
         FROM quote_line_items WHERE quote_id = $1 ORDER BY id`,
        [id]
      );
      lineItems = (liResult.rows as Array<{
        id: string; item_type: string; description: string; sku: string | null;
        quantity: number; unit: string | null; unit_price_vnd: number; total_price_vnd: number;
      }>);
    } catch { /* table may not exist yet */ }

    const projectId = q.project_id;

    // Fetch related contract
    const contractResult = await client.query(
      `SELECT id, project_id, contract_number, status FROM contracts WHERE quote_id = $1 LIMIT 1`,
      [id]
    );
    const contractRow =
      contractResult.rows.length > 0
        ? (contractResult.rows[0] as { id: string; project_id: string; contract_number: string; status: string })
        : null;

    // Fetch project info
    let project: { id: string; customer_name: string; address: string | null; status: string } | null = null;
    const resolvedProjectId = projectId ?? contractRow?.project_id ?? null;
    if (resolvedProjectId) {
      const projResult = await client.query(
        `SELECT id, customer_name, customer_address as address, COALESCE(status, 'NEW') as status FROM projects WHERE id = $1 LIMIT 1`,
        [resolvedProjectId]
      );
      if (projResult.rows.length > 0) {
        const p = projResult.rows[0] as { id: string; customer_name: string; address: string | null; status: string };
        project = { id: p.id, customer_name: p.customer_name, address: p.address, status: p.status };
      }
    }

    // Fetch latest handover
    let handover: { id: string; status: string } | null = null;
    if (resolvedProjectId) {
      const hoResult = await client.query(
        `SELECT h.id, CASE WHEN h.cancelled_at IS NOT NULL THEN 'CANCELLED' ELSE COALESCE(h.handover_type, 'DRAFT') END as status
         FROM handovers h
         JOIN contracts c ON h.contract_id = c.id
         WHERE c.project_id = $1
         ORDER BY h.created_at DESC LIMIT 1`,
        [resolvedProjectId]
      );
      if (hoResult.rows.length > 0) {
        const h = hoResult.rows[0] as { id: string; status: string };
        handover = { id: h.id, status: h.status };
      }
    }

    const contract =
      contractRow != null
        ? { id: contractRow.id, contract_number: contractRow.contract_number, status: contractRow.status }
        : null;

    const financialSnapshot = q.financial_snapshot
      ? (typeof q.financial_snapshot === 'string' ? JSON.parse(q.financial_snapshot) : q.financial_snapshot) as Record<string, unknown>
      : null;

    const quote: QuoteDetailV2 = {
      id: q.id,
      quote_number: q.quote_number,
      version: q.version ?? 1,
      status: q.status,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone,
      customer_email: q.customer_email,
      customer_address: q.customer_address,
      system_size_kwp: q.system_size_kwp != null ? Number(q.system_size_kwp) : null,
      panel_count: q.panel_count != null ? Number(q.panel_count) : null,
      subtotal_vnd: q.subtotal_vnd != null ? Number(q.subtotal_vnd) : null,
      discount_vnd: q.discount_vnd != null ? Number(q.discount_vnd) : null,
      tax_vnd: q.tax_vnd != null ? Number(q.tax_vnd) : null,
      total_vnd: q.total_vnd != null ? Number(q.total_vnd) : null,
      financial_snapshot: financialSnapshot,
      notes: q.notes,
      valid_until: q.valid_until,
      created_at: q.created_at,
      project_id: resolvedProjectId,
      line_items: lineItems,
      project,
      contract,
      handover,
    };

    return {
      quote,
      has_project: project != null,
      has_contract: contract != null,
      has_handover: handover != null,
    };
  });
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
