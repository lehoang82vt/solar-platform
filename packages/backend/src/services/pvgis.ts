import { withOrgContext } from '../config/database';

export interface PVGISMonthlyData {
  month: number;
  kwh_per_m2_day: number;
}

export interface PVGISResult {
  monthly: PVGISMonthlyData[];
  avg: number;
  min_month: number;
}

/**
 * Mock PVGIS data generator.
 * In production, this would call the real PVGIS API.
 */
function generateMockPVGIS(
  _lat: number,
  _lon: number,
  _azimuth: number,
  _tilt: number
): PVGISResult {
  const baseIrradiation = 5.0;

  const monthly: PVGISMonthlyData[] = [];

  for (let month = 1; month <= 12; month++) {
    let seasonal = 0;
    if (month >= 4 && month <= 9) {
      seasonal = 0.3;
    } else {
      seasonal = -0.2;
    }

    const random = (Math.random() - 0.5) * 0.2;
    const value = baseIrradiation + seasonal + random;

    monthly.push({
      month,
      kwh_per_m2_day: Math.round(value * 100) / 100,
    });
  }

  const sum = monthly.reduce((acc, m) => acc + m.kwh_per_m2_day, 0);
  const avg = Math.round((sum / 12) * 100) / 100;

  let minMonth = 1;
  let minValue = monthly[0].kwh_per_m2_day;

  for (const m of monthly) {
    if (m.kwh_per_m2_day < minValue) {
      minValue = m.kwh_per_m2_day;
      minMonth = m.month;
    }
  }

  return {
    monthly,
    avg,
    min_month: minMonth,
  };
}

/**
 * Fetch PVGIS data for a roof and persist on project_roofs.
 * Requires project to have customer_address (location).
 */
export async function fetchPVGIS(
  organizationId: string,
  projectId: string,
  roofId: string
): Promise<PVGISResult> {
  return await withOrgContext(organizationId, async (client) => {
    const projectResult = await client.query(
      `SELECT customer_address FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const address = projectResult.rows[0].customer_address;

    if (!address || String(address).trim() === '') {
      throw new Error('Project must have location (address)');
    }

    const roofResult = await client.query(
      `SELECT * FROM project_roofs WHERE id = $1 AND project_id = $2 AND organization_id = $3`,
      [roofId, projectId, organizationId]
    );

    if (roofResult.rows.length === 0) {
      throw new Error('Roof not found');
    }

    const roof = roofResult.rows[0] as { azimuth: number; tilt: number };

    const lat = 10.8231;
    const lon = 106.6297;

    const result = generateMockPVGIS(lat, lon, roof.azimuth, roof.tilt);

    await client.query(
      `UPDATE project_roofs
       SET pvgis_monthly = $1,
           pvgis_avg = $2,
           pvgis_min_month = $3,
           pvgis_fetched_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(result.monthly), result.avg, result.min_month, roofId]
    );

    return result;
  });
}
