import { getDatabasePool, withOrgContext } from '../config/database';
import { UserPayload } from './auth';

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

export async function createProject(
  input: ProjectInput,
  user: UserPayload,
  organizationId: string
): Promise<Project> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  return await withOrgContext(organizationId, async (client) => {
    try {
      await client.query('BEGIN');

      // Insert project
      const projectResult = await client.query(
        'INSERT INTO projects (organization_id, customer_name, address) VALUES ($1, $2, $3) RETURNING id, customer_name, address, created_at',
        [organizationId, input.customer_name, input.address || null]
      );

      const project = projectResult.rows[0] as Project;

      // Audit log
      await client.query(
        'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
        [user.email, 'project.create', JSON.stringify({ project_id: project.id })]
      );

      await client.query('COMMIT');
      return project;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
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
