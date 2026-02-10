import { withOrgContext } from '../config/database';

export interface PVRecommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  power_watt: number;
  efficiency: number;
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
  sell_price_vnd: number;
  suggested_panel_count?: number;
}

function calculateSuggestedPanelCount(
  monthlyKwh: number | null,
  roofArea: number | null,
  moduleArea: number | null,
  modulePower: number
): number | undefined {
  if (!monthlyKwh || !roofArea || !moduleArea) {
    return undefined;
  }

  const dailyKwh = monthlyKwh / 30;
  const systemSizeKw = dailyKwh / 4;
  const panelCount = Math.ceil((systemSizeKw * 1000) / modulePower);

  const totalModuleArea = panelCount * moduleArea;
  if (totalModuleArea > roofArea * 0.8) {
    return Math.floor((roofArea * 0.8) / moduleArea);
  }

  return panelCount;
}

/**
 * Get PV module recommendations: READY only, sorted by efficiency DESC.
 */
export async function getPVRecommendations(
  organizationId: string,
  projectId: string
): Promise<PVRecommendation[]> {
  return await withOrgContext(organizationId, async (client) => {
    const projectResult = await client.query(
      `SELECT monthly_kwh FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projectResult.rows[0] as { monthly_kwh: number | null };

    const roofResult = await client.query(
      `SELECT SUM(area) AS total_area FROM project_roofs
       WHERE project_id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    const totalRoofArea = roofResult.rows[0]?.total_area != null
      ? Number(roofResult.rows[0].total_area)
      : null;

    const modulesResult = await client.query(
      `SELECT * FROM catalog_pv_modules
       WHERE organization_id = $1
       AND ready = true
       AND deleted_at IS NULL
       ORDER BY efficiency DESC NULLS LAST, power_watt DESC`,
      [organizationId]
    );

    const recommendations: PVRecommendation[] = modulesResult.rows.map((m: Record<string, unknown>) => {
      const lengthMm = m.length_mm != null ? Number(m.length_mm) : null;
      const widthMm = m.width_mm != null ? Number(m.width_mm) : null;
      const moduleArea =
        lengthMm != null && widthMm != null
          ? (lengthMm * widthMm) / 1_000_000
          : 2.0;

      const suggestedCount = calculateSuggestedPanelCount(
        project.monthly_kwh,
        totalRoofArea,
        moduleArea,
        Number(m.power_watt)
      );

      return {
        id: m.id as string,
        sku: m.sku as string,
        brand: m.brand as string,
        model: m.model as string,
        power_watt: Number(m.power_watt),
        efficiency: m.efficiency != null ? Number(m.efficiency) : 0,
        voc: Number(m.voc),
        vmp: Number(m.vmp),
        isc: Number(m.isc),
        imp: Number(m.imp),
        sell_price_vnd: Number(m.sell_price_vnd),
        suggested_panel_count: suggestedCount,
      };
    });

    return recommendations;
  });
}
