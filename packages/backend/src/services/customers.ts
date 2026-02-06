import { getDatabasePool, withOrgContext } from '../config/database';
import { UserPayload } from './auth';

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
}

export async function createCustomer(
  input: CustomerInput,
  user: UserPayload,
  organizationId: string
): Promise<Customer> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  return await withOrgContext(organizationId, async (client) => {
    try {
      await client.query('BEGIN');

      const customerResult = await client.query(
        'INSERT INTO customers (organization_id, name, phone, email, address) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, email, address, created_at',
        [
          organizationId,
          input.name,
          input.phone || null,
          input.email || null,
          input.address || null,
        ]
      );

      const customer = customerResult.rows[0] as Customer;

      // Audit log
      await client.query(
        'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
        [user.email, 'customer.create', JSON.stringify({ customer_id: customer.id })]
      );

      await client.query('COMMIT');
      return customer;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, name, phone, email, address, created_at FROM customers WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Customer;
}

/**
 * Get customer by id (org-safe). Returns null if not found in org.
 */
export async function getCustomerByIdOrgSafe(
  id: string,
  organizationId: string
): Promise<Customer | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      'SELECT id, name, phone, email, address, created_at FROM customers WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0] as Customer;
  });
}

export async function listCustomers(limit: number = 50): Promise<Customer[]> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, name, phone, email, address, created_at FROM customers ORDER BY created_at DESC LIMIT $1',
    [limit]
  );

  return result.rows as Customer[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidCustomerId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

const CUSTOMER_PATCH_WHITELIST = ['name', 'phone', 'email', 'address'] as const;

export type CustomerPatch = Partial<Pick<CustomerInput, (typeof CUSTOMER_PATCH_WHITELIST)[number]>>;

export async function updateCustomer(
  id: string,
  organizationId: string,
  patch: CustomerPatch
): Promise<{ id: string; changedFields: string[] } | null> {
  return await withOrgContext(organizationId, async (client) => {
    const existResult = await client.query('SELECT id FROM customers WHERE id = $1', [id]);
    if (existResult.rows.length === 0) {
      return null;
    }

    const allowed = Object.keys(patch).filter((k) =>
      CUSTOMER_PATCH_WHITELIST.includes(k as (typeof CUSTOMER_PATCH_WHITELIST)[number])
    ) as (typeof CUSTOMER_PATCH_WHITELIST)[number][];
    if (allowed.length === 0) {
      return { id, changedFields: [] };
    }

    const setParts: string[] = [];
    const values: (string | null)[] = [];
    let idx = 1;
    for (const key of allowed) {
      setParts.push(`${key} = $${idx}`);
      const v = (patch as Record<string, unknown>)[key];
      values.push(v === undefined ? null : v === null ? null : String(v));
      idx += 1;
    }
    values.push(id);

    await client.query(
      `UPDATE customers SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING id`,
      values
    );

    return { id, changedFields: [...allowed] };
  });
}

export async function deleteCustomer(
  id: string,
  organizationId: string
): Promise<{ id: string; mode: 'soft' | 'hard'; quoteCount: number } | null> {
  return await withOrgContext(organizationId, async (client) => {
    const existResult = await client.query('SELECT id FROM customers WHERE id = $1', [id]);
    if (existResult.rows.length === 0) {
      return null;
    }

    const countResult = await client.query(
      'SELECT count(*)::int AS cnt FROM quotes WHERE customer_id = $1',
      [id]
    );
    const quoteCount = parseInt(String(countResult.rows[0]?.cnt ?? 0), 10);

    const colResult = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'customers'
       AND column_name IN ('is_active', 'deleted_at')`,
      []
    );
    const columns = new Set((colResult.rows as { column_name: string }[]).map((r) => r.column_name));

    if (columns.has('is_active')) {
      await client.query('UPDATE customers SET is_active = false WHERE id = $1', [id]);
      return { id, mode: 'soft', quoteCount };
    }
    if (columns.has('deleted_at')) {
      await client.query('UPDATE customers SET deleted_at = now() WHERE id = $1', [id]);
      return { id, mode: 'soft', quoteCount };
    }
    await client.query('DELETE FROM customers WHERE id = $1', [id]);
    return { id, mode: 'hard', quoteCount };
  });
}
