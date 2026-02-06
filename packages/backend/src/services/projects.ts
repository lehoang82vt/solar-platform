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
