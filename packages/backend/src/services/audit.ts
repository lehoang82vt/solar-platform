import { getDatabasePool } from '../config/database';

export interface AuditPayload {
  [key: string]: unknown;
}

export interface AuditEntry {
  actor: string;
  action: string;
  entity?: string;
  metadata?: AuditPayload;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const payload = {
    ...entry.metadata,
  };

  await pool.query(
    'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
    [entry.actor, entry.action, JSON.stringify(payload)]
  );
}

export async function writeAuditLog(
  actor: string,
  action: string,
  metadata: AuditPayload
): Promise<void> {
  await auditLog({ actor, action, metadata });
}
