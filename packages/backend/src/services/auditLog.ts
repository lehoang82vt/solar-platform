import { withOrgContext } from '../config/database';

export interface AuditLogEntry {
  organization_id: string;
  actor: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write audit log entry to audit_logs table
 * MUST throw if organization_id is missing
 */
export async function write(entry: AuditLogEntry): Promise<void> {
  if (!entry.organization_id) {
    throw new Error('organization_id is required for audit logging');
  }

  const metadata = entry.metadata || {};

  await withOrgContext(entry.organization_id, async (client) => {
    await client.query(
      `INSERT INTO audit_logs (organization_id, actor, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.organization_id,
        entry.actor,
        entry.action,
        entry.entity_type || null,
        entry.entity_id || null,
        JSON.stringify(metadata),
      ]
    );
  });
}

/**
 * Get default organization ID
 * Returns the first (typically only) organization in the system
 */
export async function getDefaultOrganizationId(): Promise<string> {
  // organizations is NOT org-scoped (no RLS). Use a one-off org context-less query.
  const { getDatabasePool } = await import('../config/database');
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  const result = await pool.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');

  if (result.rows.length === 0) {
    throw new Error('No organization found in database');
  }

  return result.rows[0].id;
}
