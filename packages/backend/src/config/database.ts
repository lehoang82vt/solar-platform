import { Pool } from 'pg';
import { config } from './env';

let pool: Pool | null = null;
let isConnected = false;

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
