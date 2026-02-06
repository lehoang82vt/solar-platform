import { getDatabasePool, withOrgContext } from '../config/database';

export interface ProjectInput {
  customer_name: string;
  address?: string;
}

export interface Project {
  id: string;
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

/** Result shape for 201 response (F-20). Schema has customer_name, address only; customer_id/name/notes from payload. */
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
      'INSERT INTO projects (organization_id, customer_name, address) VALUES ($1, $2, $3) RETURNING id, customer_name, address, created_at',
      [organizationId, payload.name, payload.address ?? null]
    );
    const row = projectResult.rows[0] as { id: string; customer_name: string; address: string | null; created_at: string };
    return {
      kind: 'ok',
      project: {
        id: row.id,
        customer_id: payload.customer_id,
        name: row.customer_name,
        address: row.address,
        notes: payload.notes ?? null,
        status: 'draft',
        created_at: row.created_at,
      },
    };
  });
}

/** Detail shape for GET /api/projects/:id (F-21). Schema has customer_name, address only. */
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

/** Get project by id (org-safe). Returns null if not found in org. */
export async function getProjectByIdOrgSafe(
  id: string,
  organizationId: string
): Promise<ProjectDetail | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      'SELECT id, customer_name, address, created_at FROM projects WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0] as { id: string; customer_name: string; address: string | null; created_at: string };
    return {
      id: row.id,
      customer_id: null,
      name: row.customer_name,
      address: row.address,
      notes: null,
      status: 'draft',
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
    'SELECT id, customer_name, address, created_at FROM projects WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Project;
}

export async function listProjects(limit: number = 50): Promise<Project[]> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const result = await pool.query(
    'SELECT id, customer_name, address, created_at FROM projects ORDER BY created_at DESC LIMIT $1',
    [limit]
  );

  return result.rows as Project[];
}

/** List item shape for GET /api/projects v2 (F-23). customer_name exposed as name; customer_id null (schema chưa có). */
export interface ProjectListItem {
  id: string;
  customer_id: null;
  name: string;
  address: string | null;
  status: 'draft';
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
      'SELECT id, customer_name, address, created_at FROM projects ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return (result.rows as { id: string; customer_name: string; address: string | null; created_at: string }[]).map(
      (row) => ({
        id: row.id,
        customer_id: null,
        name: row.customer_name,
        address: row.address,
        status: 'draft' as const,
        created_at: row.created_at,
      })
    );
  });
}
