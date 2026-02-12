import { getDatabasePool, withOrgContext } from '../config/database';

export interface ProjectInput {
  customer_name: string;
  address?: string;
}

export interface Project {
  id: string;
  customer_id: string | null;
  customer_name: string;
  address: string | null;
  created_at: string;
}

/** Payload for POST /api/projects (F-20). */
export interface CreateProjectPayload {
  customer_id: string;
  name: string;
  address?: string | null;
  notes?: string | null;
}

/** Result shape for 201 response (F-20). */
export interface ProjectCreateResult {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  notes: string | null;
  status?: string;
  created_at: string;
}

export type CreateProjectResult =
  | { kind: 'customer_not_found' }
  | { kind: 'ok'; project: ProjectCreateResult };

export async function createProject(
  organizationId: string,
  payload: CreateProjectPayload
): Promise<CreateProjectResult> {
  return await withOrgContext(organizationId, async (client) => {
    const existCustomer = await client.query('SELECT id FROM customers WHERE id = $1', [payload.customer_id]);
    if (existCustomer.rows.length === 0) {
      return { kind: 'customer_not_found' };
    }

    const projectResult = await client.query(
      'INSERT INTO projects (organization_id, customer_name, address, customer_id) VALUES ($1, $2, $3, $4) RETURNING id, customer_id, customer_name, address, created_at',
      [organizationId, payload.name, payload.address ?? null, payload.customer_id]
    );
    const row = projectResult.rows[0] as {
      id: string;
      customer_id: string | null;
      customer_name: string;
      address: string | null;
      created_at: string;
    };
    return {
      kind: 'ok',
      project: {
        id: row.id,
        customer_id: row.customer_id ?? payload.customer_id,
        name: row.customer_name,
        address: row.address,
        notes: payload.notes ?? null,
        status: 'NEW',
        created_at: row.created_at,
      },
    };
  });
}

/** Detail shape for GET /api/projects/:id (F-21). status from F-29. */
export interface ProjectDetail {
  id: string;
  customer_id: string | null;
  name: string;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidProjectId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

const PROJECT_PATCH_WHITELIST = ['name', 'address'] as const;

/** Patch payload for PATCH /api/projects/:id (F-22). name maps to customer_name in DB. */
export type ProjectPatch = Partial<{
  name: string;
  address: string | null;
}>;

/** Update project by id (org-safe). Returns { id, changedFields } or null if not found. */
export async function updateProject(
  organizationId: string,
  id: string,
  patch: ProjectPatch
): Promise<{ id: string; changedFields: string[] } | null> {
  return await withOrgContext(organizationId, async (client) => {
    const existResult = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (existResult.rows.length === 0) {
      return null;
    }

    const allowed = Object.keys(patch).filter((k) =>
      PROJECT_PATCH_WHITELIST.includes(k as (typeof PROJECT_PATCH_WHITELIST)[number])
    ) as (typeof PROJECT_PATCH_WHITELIST)[number][];
    if (allowed.length === 0) {
      return { id, changedFields: [] };
    }

    const setParts: string[] = [];
    const values: (string | null)[] = [];
    let idx = 1;
    for (const key of allowed) {
      const v = (patch as Record<string, unknown>)[key];
      const dbValue = v === undefined ? null : v === null ? null : String(v);
      if (key === 'name') {
        setParts.push(`customer_name = $${idx}`);
      } else {
        setParts.push(`${key} = $${idx}`);
      }
      values.push(dbValue);
      idx += 1;
    }
    values.push(id);

    await client.query(
      `UPDATE projects SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING id`,
      values
    );

    return { id, changedFields: [...allowed] };
  });
}

/** Get project by id (org-safe). Returns null if not found or soft-deleted. */
export async function getProjectByIdOrgSafe(
  id: string,
  organizationId: string
): Promise<ProjectDetail | null> {
  return await withOrgContext(organizationId, async (client) => {
    const colResult = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects'
       AND column_name IN ('is_active', 'deleted_at')`,
      []
    );
    const columns = new Set((colResult.rows as { column_name: string }[]).map((r) => r.column_name));
    let where = 'id = $1';
    if (columns.has('is_active')) {
      where += ' AND (is_active IS NULL OR is_active = true)';
    } else if (columns.has('deleted_at')) {
      where += ' AND deleted_at IS NULL';
    }

    const result = await client.query(
      `SELECT id, customer_id, customer_name, address, created_at, status FROM projects WHERE ${where}`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0] as {
      id: string;
      customer_id: string | null;
      customer_name: string;
      address: string | null;
      created_at: string;
      status?: string;
    };
    return {
      id: row.id,
      customer_id: row.customer_id,
      name: row.customer_name,
      address: row.address,
      notes: null,
      status: (row.status && row.status.toUpperCase()) || 'NEW',
      created_at: row.created_at,
    };
  });
}

export async function getProjectById(id: string): Promise<Project | null> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, customer_id, customer_name, address, created_at FROM projects WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Project;
}

/** Get organization_id of a project by id (via SECURITY DEFINER function, bypasses RLS). For quote routes: org from project → no mismatch. */
export async function getProjectOrganizationId(projectId: string): Promise<string | null> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  const result = await pool.query(
    'SELECT get_project_organization_id($1) AS organization_id',
    [projectId]
  );
  if (result.rows.length === 0 || result.rows[0].organization_id == null) {
    return null;
  }
  return (result.rows[0] as { organization_id: string }).organization_id;
}

export async function listProjects(limit: number = 50): Promise<Project[]> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, customer_id, customer_name, address, created_at FROM projects ORDER BY created_at DESC LIMIT $1',
    [limit]
  );

  return result.rows as Project[];
}

/** List item shape for GET /api/projects v2 (F-23). status from F-29 lifecycle. */
export interface ProjectListItem {
  id: string;
  customer_id: string | null;
  name: string;
  address: string | null;
  status: string;
  created_at: string;
}

/** List projects with pagination (org-safe via withOrgContext). Returns ProjectListItem[]. */
export async function listProjectsV2(
  organizationId: string,
  limit: number,
  offset: number
): Promise<ProjectListItem[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      'SELECT id, customer_id, customer_name, address, created_at, status FROM projects ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return (result.rows as {
      id: string;
      customer_id: string | null;
      customer_name: string;
      address: string | null;
      created_at: string;
      status?: string;
    }[]).map(
      (row) => ({
        id: row.id,
        customer_id: row.customer_id,
        name: row.customer_name,
        address: row.address,
        status: (row.status && row.status.toUpperCase()) || 'NEW',
        created_at: row.created_at,
      })
    );
  });
}

/** F-33: List projects v3 item (customer from quote payload->project_id + stats). */
export interface ProjectListV3Item {
  id: string;
  customer_name: string;
  address: string | null;
  status: string;
  created_at: string;
  customer: { name: string; phone: string | null; email: string | null } | null;
  stats: { quotes_count: number; contracts_count: number; handovers_count: number };
}

export interface ListProjectsV3Result {
  value: ProjectListV3Item[];
  paging: { limit: number; offset: number; count: number };
}

/**
 * List projects v3: customer from quotes (payload->>'project_id') when present, stats counts.
 * Quotes joined via q.organization_id = p.organization_id AND (q.payload->>'project_id')::uuid = p.id (no project_id column on quotes).
 * If quotes payload has no project_id, quotes_count = 0; customer resolved only when at least one such quote exists.
 */
export async function listProjectsV3(
  organizationId: string,
  limit: number,
  offset: number,
  filters?: { status?: string; search?: string }
): Promise<ListProjectsV3Result> {
  return await withOrgContext(organizationId, async (client) => {
    const conditions: string[] = [];
    const params: (string | number)[] = [organizationId, limit, offset];
    let paramIndex = 4;

    if (filters?.status != null && filters.status.trim() !== '') {
      conditions.push(`LOWER(TRIM(p.status)) = LOWER(TRIM($${paramIndex}))`);
      params.push(filters.status.trim());
      paramIndex += 1;
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = '%' + filters.search.trim() + '%';
      conditions.push(
        `(p.customer_name ILIKE $${paramIndex} OR p.customer_address ILIKE $${paramIndex} OR p.customer_phone ILIKE $${paramIndex} OR p.customer_email ILIKE $${paramIndex})`
      );
      params.push(likePattern);
      paramIndex += 1;
    }

    const whereClause = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT
        p.id,
        p.customer_name,
        p.customer_address as address,
        COALESCE(UPPER(TRIM(p.status)), 'NEW') as status,
        p.created_at,
        p.customer_phone,
        p.customer_email,
        COUNT(DISTINCT q.id)::int as quotes_count,
        COUNT(DISTINCT ctt.id)::int as contracts_count,
        COUNT(DISTINCT h.id)::int as handovers_count
      FROM projects p
      LEFT JOIN quotes q ON q.organization_id = p.organization_id AND q.project_id = p.id
      LEFT JOIN contracts ctt ON ctt.project_id = p.id
      LEFT JOIN handovers h ON h.contract_id = ctt.id
      WHERE p.organization_id = $1 ${whereClause}
      GROUP BY p.id, p.customer_name, p.customer_address, p.status, p.created_at, p.customer_phone, p.customer_email
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await client.query(sql, params);

    const countFrom = `
      FROM projects p
      WHERE p.organization_id = $1
    `;
    const countParams: (string | number)[] = [organizationId];
    const countConditions: string[] = [];
    let countParamIndex = 2;
    if (filters?.status != null && filters.status.trim() !== '') {
      countConditions.push(`LOWER(TRIM(p.status)) = LOWER(TRIM($${countParamIndex}))`);
      countParams.push(filters.status.trim());
      countParamIndex += 1;
    }
    if (filters?.search != null && filters.search.trim() !== '') {
      const likePattern = '%' + filters.search.trim() + '%';
      countConditions.push(
        `(p.customer_name ILIKE $${countParamIndex} OR p.customer_address ILIKE $${countParamIndex} OR p.customer_phone ILIKE $${countParamIndex} OR p.customer_email ILIKE $${countParamIndex})`
      );
      countParams.push(likePattern);
    }
    const countWhere = countConditions.length > 0 ? ' AND ' + countConditions.join(' AND ') : '';
    const countResult = await client.query(
      `SELECT COUNT(*)::int ${countFrom}${countWhere}`,
      countParams
    );
    const totalCount = parseInt(String(countResult.rows[0].count), 10);

    const value = (result.rows as Array<{
      id: string;
      customer_name: string;
      address: string | null;
      status: string;
      created_at: string;
      customer_phone: string | null;
      customer_email: string | null;
      quotes_count: number;
      contracts_count: number;
      handovers_count: number;
    }>).map((row) => ({
      id: row.id,
      customer_name: row.customer_name,
      address: row.address,
      status: row.status ?? 'NEW',
      created_at: row.created_at,
      customer: {
        name: row.customer_name,
        phone: row.customer_phone,
        email: row.customer_email,
      },
      stats: {
        quotes_count: row.quotes_count ?? 0,
        contracts_count: row.contracts_count ?? 0,
        handovers_count: row.handovers_count ?? 0,
      },
    }));

    return {
      value,
      paging: { limit, offset, count: totalCount },
    };
  });
}

/** Delete project by id (org-safe). Soft delete if is_active/deleted_at exists, else hard delete. Returns { id } or null. */
export async function deleteProject(
  organizationId: string,
  id: string
): Promise<{ id: string } | null> {
  return await withOrgContext(organizationId, async (client) => {
    const existResult = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (existResult.rows.length === 0) {
      return null;
    }

    const colResult = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects'
       AND column_name IN ('is_active', 'deleted_at')`,
      []
    );
    const columns = new Set((colResult.rows as { column_name: string }[]).map((r) => r.column_name));

    if (columns.has('is_active')) {
      await client.query('UPDATE projects SET is_active = false WHERE id = $1', [id]);
      return { id };
    }
    if (columns.has('deleted_at')) {
      await client.query('UPDATE projects SET deleted_at = now() WHERE id = $1', [id]);
      return { id };
    }
    await client.query('DELETE FROM projects WHERE id = $1', [id]);
    return { id };
  });
}

/** F-29: Project status values (UPPERCASE). */
export const PROJECT_STATUS = {
  NEW: 'NEW',
  QUOTED: 'QUOTED',
  CONTRACTED: 'CONTRACTED',
  INSTALLED: 'INSTALLED',
  HANDOVER: 'HANDOVER',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

/** Recompute project status from handovers, contracts, quotes. Returns new status or null if project not found. */
export type RecomputeStatusResult =
  | { kind: 'not_found' }
  | { kind: 'ok'; status: string; from: string };

export async function recomputeProjectStatus(
  organizationId: string,
  projectId: string
): Promise<RecomputeStatusResult> {
  return await withOrgContext(organizationId, async (client) => {
    const proj = await client.query(
      'SELECT id, COALESCE(status, \'NEW\') as status FROM projects WHERE id = $1',
      [projectId]
    );
    if (proj.rows.length === 0) return { kind: 'not_found' };
    const fromStatus = ((proj.rows[0] as { status: string }).status || 'NEW').toUpperCase();

    const handovers = await client.query(
      'SELECT status FROM handovers WHERE project_id = $1',
      [projectId]
    );
    const contracts = await client.query(
      'SELECT status FROM contracts WHERE project_id = $1',
      [projectId]
    );
    const quotes = await client.query(
      `SELECT status, payload FROM quotes WHERE organization_id = $1 AND payload->>'project_id' = $2`,
      [organizationId, projectId]
    );

    let newStatus: string = PROJECT_STATUS.NEW;
    const hasHandoverCompleted = (handovers.rows as { status: string }[]).some((r) => (r.status || '').toUpperCase() === 'COMPLETED');
    const hasHandoverSignedOrDraft = (handovers.rows as { status: string }[]).some((r) => {
      const s = (r.status || '').toUpperCase();
      return s === 'SIGNED' || s === 'DRAFT';
    });
    const hasContractReady = (contracts.rows as { status: string }[]).some((r) => {
      const s = (r.status || '').toUpperCase();
      return s === 'COMPLETED' || s === 'HANDOVER' || s === 'INSTALLING' || s === 'SIGNED';
    });
    const hasQuoteApproved = (quotes.rows as { status: string }[]).some((r) => {
      const s = (r.status || '').toLowerCase();
      return s === 'accepted' || s === 'approved';
    });

    if (hasHandoverCompleted) newStatus = PROJECT_STATUS.COMPLETED;
    else if (hasHandoverSignedOrDraft) newStatus = PROJECT_STATUS.HANDOVER;
    else if (hasContractReady) newStatus = PROJECT_STATUS.CONTRACTED;
    else if (hasQuoteApproved) newStatus = PROJECT_STATUS.QUOTED;

    await client.query(
      'UPDATE projects SET status = $1 WHERE id = $2',
      [newStatus, projectId]
    );
    return { kind: 'ok', status: newStatus, from: fromStatus };
  });
}

/** Valid forward chain; CANCELLED allowed from any with reason. */
const FORWARD_CHAIN: string[] = [PROJECT_STATUS.NEW, PROJECT_STATUS.QUOTED, PROJECT_STATUS.CONTRACTED, PROJECT_STATUS.HANDOVER, PROJECT_STATUS.COMPLETED];

export type TransitionStatusResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; from: string; to: string }
  | { kind: 'reason_required' }
  | { kind: 'ok'; from: string; to: string };

export async function transitionProjectStatus(
  organizationId: string,
  projectId: string,
  toStatus: string,
  reason?: string
): Promise<TransitionStatusResult> {
  const toUpper = (toStatus || '').toUpperCase();
  if (toUpper === PROJECT_STATUS.CANCELLED) {
    if (reason == null || String(reason).trim() === '') return { kind: 'reason_required' };
  } else {
    const validTo = FORWARD_CHAIN.includes(toUpper);
    if (!validTo) return { kind: 'invalid_transition', from: '', to: toUpper };
  }

  return await withOrgContext(organizationId, async (client) => {
    const proj = await client.query(
      'SELECT id, COALESCE(status, \'NEW\') as status FROM projects WHERE id = $1',
      [projectId]
    );
    if (proj.rows.length === 0) return { kind: 'not_found' };
    const fromStatus = ((proj.rows[0] as { status: string }).status || 'NEW').toUpperCase();

    if (toUpper === PROJECT_STATUS.CANCELLED) {
      await client.query('UPDATE projects SET status = $1 WHERE id = $2', [PROJECT_STATUS.CANCELLED, projectId]);
      return { kind: 'ok', from: fromStatus, to: PROJECT_STATUS.CANCELLED };
    }
    const fromIdx = FORWARD_CHAIN.indexOf(fromStatus);
    const toIdx = FORWARD_CHAIN.indexOf(toUpper);
    if (fromIdx < 0 || toIdx <= fromIdx) {
      return { kind: 'invalid_transition', from: fromStatus, to: toUpper };
    }
    await client.query('UPDATE projects SET status = $1 WHERE id = $2', [toUpper, projectId]);
    return { kind: 'ok', from: fromStatus, to: toUpper };
  });
}
