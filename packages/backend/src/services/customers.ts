import { getDatabasePool } from '../config/database';
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
  user: UserPayload
): Promise<Customer> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      'INSERT INTO customers (name, phone, email, address) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, email, address, created_at',
      [input.name, input.phone || null, input.email || null, input.address || null]
    );

    const customer = customerResult.rows[0] as Customer;

    // Audit log
    await client.query(
      'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
      [
        user.email,
        'customer.create',
        JSON.stringify({ customer_id: customer.id }),
      ]
    );

    await client.query('COMMIT');
    return customer;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
