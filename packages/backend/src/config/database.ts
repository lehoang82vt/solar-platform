import { Pool, PoolClient } from 'pg';
import { config } from './env';

let pool: Pool | null = null;
let isConnected = false;

export async function withOrgContext<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [
      organizationId,
    ]);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function connectDatabase(): Promise<void> {
  try {
    pool = new Pool(config.database);
    
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    isConnected = true;
    console.log('Database connected successfully');
  } catch (error) {
    isConnected = false;
    console.error('Database connection failed:', error);
    throw error;
  }
}

export function getDatabasePool(): Pool | null {
  return pool;
}

export function isDatabaseConnected(): boolean {
  return isConnected;
}

export async function disconnectDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    isConnected = false;
    console.log('Database disconnected');
  }
}
