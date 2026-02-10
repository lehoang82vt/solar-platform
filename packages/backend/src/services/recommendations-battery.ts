import { withOrgContext } from '../config/database';

export type BatteryRank = 'PASS' | 'WARNING' | 'BLOCK';

export interface BatteryRecommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  voltage: number;
  capacity_kwh: number;
  usable_capacity_kwh: number;
  depth_of_discharge: number;
  cycle_life: number;
  sell_price_vnd: number;
  rank: BatteryRank;
  block_reason?: string;
}

interface BatteryRow {
  depth_of_discharge?: number | null;
  capacity_kwh: number;
}

function rankBattery(
  battery: BatteryRow,
  storageTargetKwh: number
): { rank: BatteryRank; reason?: string } {
  const dod = battery.depth_of_discharge ?? 80;
  const usableCapacity = (battery.capacity_kwh * dod) / 100;

  if (storageTargetKwh === 0) {
    return { rank: 'BLOCK', reason: 'No storage needed for this project' };
  }

  if (usableCapacity < storageTargetKwh * 0.5) {
    return {
      rank: 'BLOCK',
      reason: `Usable capacity (${usableCapacity.toFixed(1)} kWh) too small for storage target (${storageTargetKwh.toFixed(1)} kWh)`,
    };
  }

  if (usableCapacity < storageTargetKwh * 0.8) {
    return { rank: 'WARNING' };
  }

  return { rank: 'PASS' };
}

/**
 * Get battery recommendations ranked as PASS/WARNING/BLOCK.
 * Sorted: PASS first, WARNING middle, BLOCK last.
 */
export async function getBatteryRecommendations(
  organizationId: string,
  projectId: string
): Promise<BatteryRecommendation[]> {
  return await withOrgContext(organizationId, async (client) => {
    const projectResult = await client.query(
      `SELECT storage_target_kwh FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const storageTarget =
      projectResult.rows[0].storage_target_kwh != null
        ? Number(projectResult.rows[0].storage_target_kwh)
        : 0;

    const batteriesResult = await client.query(
      `SELECT * FROM catalog_batteries
       WHERE organization_id = $1
       AND ready = true
       AND deleted_at IS NULL
       ORDER BY capacity_kwh DESC`,
      [organizationId]
    );

    const recommendations: BatteryRecommendation[] = batteriesResult.rows.map(
      (b: Record<string, unknown>) => {
        const capacityKwh = Number(b.capacity_kwh);
        const dod = b.depth_of_discharge != null ? Number(b.depth_of_discharge) : 80;
        const usableCapacity = (capacityKwh * dod) / 100;
        const { rank, reason } = rankBattery(
          { capacity_kwh: capacityKwh, depth_of_discharge: b.depth_of_discharge as number | null },
          storageTarget
        );

        return {
          id: b.id as string,
          sku: b.sku as string,
          brand: b.brand as string,
          model: b.model as string,
          voltage: Number(b.voltage),
          capacity_kwh: capacityKwh,
          usable_capacity_kwh: Number(usableCapacity.toFixed(2)),
          depth_of_discharge: dod,
          cycle_life: b.cycle_life != null ? Number(b.cycle_life) : 0,
          sell_price_vnd: Number(b.sell_price_vnd),
          rank,
          block_reason: reason,
        };
      }
    );

    const rankOrder: Record<BatteryRank, number> = { PASS: 0, WARNING: 1, BLOCK: 2 };
    recommendations.sort((a, b) => rankOrder[a.rank] - rankOrder[b.rank]);

    return recommendations;
  });
}
