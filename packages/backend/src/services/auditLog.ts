import { withOrgContext, getDatabasePool } from '../config/database';

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
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  const result = await pool.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');

  if (result.rows.length === 0) {
    throw new Error('No organization found in database');
  }

  return result.rows[0].id;
}

/** Row returned by query helpers */
export interface AuditLogRow {
  id: string;
  organization_id: string;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/**
 * AUD-01: Query audit logs by entity type (e.g. quote, contract).
 */
export async function queryByEntityType(
  organizationId: string,
  entityType: string,
  limit = 100
): Promise<AuditLogRow[]> {
  const { getDatabasePool } = await import('../config/database');
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  const result = await withOrgContext(organizationId, async (client) => {
    return client.query(
      `SELECT id, organization_id, actor, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE entity_type = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [entityType, limit]
    );
  });

  return (result.rows as unknown[]) as AuditLogRow[];
}

/**
 * AUD-01: Query audit logs by date range (inclusive).
 */
export async function queryByDateRange(
  organizationId: string,
  from: Date,
  to: Date,
  limit = 100
): Promise<AuditLogRow[]> {
  const { getDatabasePool } = await import('../config/database');
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  const result = await withOrgContext(organizationId, async (client) => {
    return client.query(
      `SELECT id, organization_id, actor, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [from, to, limit]
    );
  });

  return (result.rows as unknown[]) as AuditLogRow[];
}

/**
 * AUD-01 Part 2: Query audit logs by actor (who did what).
 */
export async function queryByUser(
  organizationId: string,
  actor: string,
  limit = 100
): Promise<AuditLogRow[]> {
  const { getDatabasePool } = await import('../config/database');
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  const result = await withOrgContext(organizationId, async (client) => {
    return client.query(
      `SELECT id, organization_id, actor, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE actor = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [actor, limit]
    );
  });

  return (result.rows as unknown[]) as AuditLogRow[];
}

/** Per-org lock: when true, sales activity is blocked during audit export (prevent tampering). */
const auditExportLock = new Set<string>();

export function setAuditExportLock(organizationId: string, on: boolean): void {
  if (on) auditExportLock.add(organizationId);
  else auditExportLock.delete(organizationId);
}

export function isSalesBlockedByAudit(organizationId: string): boolean {
  return auditExportLock.has(organizationId);
}

/**
 * AUD-01 Part 2: Throw if sales activity is blocked (e.g. during audit export).
 * Call at start of quote submit, contract create, etc.
 */
export function checkSalesBlocked(organizationId: string): void {
  if (auditExportLock.has(organizationId)) {
    throw new Error('Sales activity blocked during audit export');
  }
}

export interface ExportAuditOptions {
  from?: Date;
  to?: Date;
  limit?: number;
}

/**
 * AUD-01 Part 2: Export audit logs to CSV (all fields). Read-only during export; blocks sales for org.
 */
export async function exportAuditToCsv(
  organizationId: string,
  options: ExportAuditOptions = {}
): Promise<string> {
  const { getDatabasePool } = await import('../config/database');
  const pool = getDatabasePool();
  if (!pool) throw new Error('Database pool not initialized');

  setAuditExportLock(organizationId, true);
  try {
    const limit = options.limit ?? 10_000;
    const rows = options.from != null && options.to != null
      ? await queryByDateRange(organizationId, options.from, options.to, limit)
      : await withOrgContext(organizationId, async (client) => {
          const r = await client.query(
            `SELECT id, organization_id, actor, action, entity_type, entity_id, metadata, created_at
             FROM audit_logs
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
          );
          return (r.rows as unknown[]) as AuditLogRow[];
        });

    const header = 'id,organization_id,actor,action,entity_type,entity_id,metadata,created_at';
    const escape = (v: string) => {
      const s = String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header];
    for (const row of rows) {
      const metaStr = typeof row.metadata === 'object'
        ? JSON.stringify(row.metadata ?? {})
        : String(row.metadata ?? '');
      lines.push(
        [
          escape(row.id),
          escape(row.organization_id),
          escape(row.actor),
          escape(row.action),
          escape(row.entity_type ?? ''),
          escape(row.entity_id ?? ''),
          escape(metaStr),
          escape(row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)),
        ].join(',')
      );
    }
    return lines.join('\n');
  } finally {
    setAuditExportLock(organizationId, false);
  }
}
