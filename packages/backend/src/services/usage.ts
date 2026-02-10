import { withOrgContext } from '../config/database';

export interface UsageInput {
  monthly_kwh: number;
  day_usage_pct: number; // 0-100
}

/**
 * night_kwh = monthly_kwh * (100 - day_usage_pct) / 100
 */
function calculateNightKwh(monthlyKwh: number, dayUsagePct: number): number {
  return (monthlyKwh * (100 - dayUsagePct)) / 100;
}

/**
 * storage_target = night_kwh * 0.8
 */
function calculateStorageTarget(nightKwh: number): number {
  return nightKwh * 0.8;
}

/**
 * Update project usage. Server calculates night_kwh and storage_target_kwh; client cannot override.
 */
export async function updateProjectUsage(
  organizationId: string,
  projectId: string,
  input: UsageInput
): Promise<Record<string, unknown>> {
  if (input.monthly_kwh <= 0) {
    throw new Error('monthly_kwh must be positive');
  }

  if (input.day_usage_pct < 0 || input.day_usage_pct > 100) {
    throw new Error('day_usage_pct must be between 0 and 100');
  }

  const nightKwh = calculateNightKwh(input.monthly_kwh, input.day_usage_pct);
  const storageTarget = calculateStorageTarget(nightKwh);

  return await withOrgContext(organizationId, async (client) => {
    const check = await client.query(
      `SELECT id FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (check.rows.length === 0) {
      throw new Error('Project not found');
    }

    const result = await client.query(
      `UPDATE projects
       SET monthly_kwh = $1,
           day_usage_pct = $2,
           night_kwh = $3,
           storage_target_kwh = $4,
           updated_at = NOW()
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        input.monthly_kwh,
        input.day_usage_pct,
        nightKwh,
        storageTarget,
        projectId,
        organizationId,
      ]
    );

    return result.rows[0] as Record<string, unknown>;
  });
}
