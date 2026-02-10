import { withOrgContext } from '../config/database';

export interface RoofInput {
  roof_index: number;
  azimuth: number;
  tilt: number;
  area: number;
  usable_pct: number;
}

export interface Roof extends RoofInput {
  id: string;
  organization_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

function validateRoof(input: RoofInput): void {
  if (input.azimuth < 0 || input.azimuth > 360) {
    throw new Error('Azimuth must be between 0 and 360 degrees');
  }

  if (input.tilt < 0 || input.tilt > 90) {
    throw new Error('Tilt must be between 0 and 90 degrees');
  }

  if (input.area <= 0) {
    throw new Error('Area must be positive');
  }

  if (input.usable_pct <= 0 || input.usable_pct > 100) {
    throw new Error('Usable percentage must be between 0 and 100');
  }
}

export async function addRoof(
  organizationId: string,
  projectId: string,
  input: RoofInput
): Promise<Roof> {
  validateRoof(input);

  return await withOrgContext(organizationId, async (client) => {
    const projectCheck = await client.query(
      `SELECT id FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found');
    }

    const result = await client.query(
      `INSERT INTO project_roofs
       (organization_id, project_id, roof_index, azimuth, tilt, area, usable_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        organizationId,
        projectId,
        input.roof_index,
        input.azimuth,
        input.tilt,
        input.area,
        input.usable_pct,
      ]
    );

    return result.rows[0] as Roof;
  });
}

export async function listRoofs(
  organizationId: string,
  projectId: string
): Promise<Roof[]> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM project_roofs
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY roof_index`,
      [organizationId, projectId]
    );

    return result.rows as Roof[];
  });
}

export async function updateRoof(
  organizationId: string,
  roofId: string,
  input: Partial<RoofInput>
): Promise<Roof> {
  return await withOrgContext(organizationId, async (client) => {
    const current = await client.query(
      `SELECT * FROM project_roofs WHERE id = $1 AND organization_id = $2`,
      [roofId, organizationId]
    );

    if (current.rows.length === 0) {
      throw new Error('Roof not found');
    }

    const merged = { ...current.rows[0], ...input } as RoofInput;
    validateRoof(merged);

    const updates: string[] = [];
    const values: (number | string)[] = [];
    let paramIdx = 1;

    if (input.azimuth !== undefined) {
      updates.push(`azimuth = $${paramIdx++}`);
      values.push(input.azimuth);
    }
    if (input.tilt !== undefined) {
      updates.push(`tilt = $${paramIdx++}`);
      values.push(input.tilt);
    }
    if (input.area !== undefined) {
      updates.push(`area = $${paramIdx++}`);
      values.push(input.area);
    }
    if (input.usable_pct !== undefined) {
      updates.push(`usable_pct = $${paramIdx++}`);
      values.push(input.usable_pct);
    }

    if (updates.length === 0) {
      return current.rows[0] as Roof;
    }

    updates.push('updated_at = NOW()');
    values.push(roofId, organizationId);

    const result = await client.query(
      `UPDATE project_roofs
       SET ${updates.join(', ')}
       WHERE id = $${paramIdx} AND organization_id = $${paramIdx + 1}
       RETURNING *`,
      values
    );

    return result.rows[0] as Roof;
  });
}

export async function deleteRoof(
  organizationId: string,
  roofId: string
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `DELETE FROM project_roofs
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [roofId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Roof not found');
    }
  });
}
