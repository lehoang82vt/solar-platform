import { withOrgContext } from '../config/database';

export interface PVGISMonthlyData {
  month: number;
  kwh_per_m2_day: number;
}

export interface PVGISResult {
  monthly: PVGISMonthlyData[];
  avg: number;
  min_month: number;
  min_value: number;
  source: 'PVGIS' | 'NASA' | 'DEFAULT';
}

// --- Tier 1: PVGIS API ---

async function fetchFromPVGIS(
  lat: number,
  lon: number,
  tilt: number,
  azimuth: number
): Promise<PVGISResult> {
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&angle=${tilt}&aspect=${azimuth}&outputformat=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`PVGIS HTTP ${response.status}`);

    const data = await response.json();
    const monthlyData = data.outputs?.monthly?.fixed;
    if (!monthlyData || !Array.isArray(monthlyData)) {
      throw new Error('Invalid PVGIS response format');
    }

    const monthly: PVGISMonthlyData[] = monthlyData.map((m: { month: number; 'H(i)_m': number }) => ({
      month: m.month,
      kwh_per_m2_day: Math.round((m['H(i)_m'] / 30) * 100) / 100,
    }));

    return computeStats(monthly, 'PVGIS');
  } finally {
    clearTimeout(timeout);
  }
}

// --- Tier 2: NASA POWER API ---

async function fetchFromNASA(lat: number, lon: number): Promise<PVGISResult> {
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&start=2001&end=2020&format=JSON`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`NASA POWER HTTP ${response.status}`);

    const data = await response.json();
    const params = data.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    if (!params) throw new Error('Invalid NASA POWER response');

    // Compute monthly averages across all years
    const monthSums: number[] = new Array(12).fill(0);
    const monthCounts: number[] = new Array(12).fill(0);

    for (const [key, value] of Object.entries(params)) {
      if (key.length === 6) {
        const month = parseInt(key.slice(4, 6));
        const val = value as number;
        if (month >= 1 && month <= 12 && val > 0) {
          monthSums[month - 1] += val;
          monthCounts[month - 1] += 1;
        }
      }
    }

    const monthly: PVGISMonthlyData[] = [];
    for (let i = 0; i < 12; i++) {
      const avg = monthCounts[i] > 0 ? monthSums[i] / monthCounts[i] : 4.5;
      monthly.push({
        month: i + 1,
        kwh_per_m2_day: Math.round(avg * 100) / 100,
      });
    }

    return computeStats(monthly, 'NASA');
  } finally {
    clearTimeout(timeout);
  }
}

// --- Tier 3: Vietnam defaults by latitude ---

function getVietnamDefaults(lat: number): PVGISResult {
  let baseAvg: number;
  let range: [number, number];

  if (lat > 18) {
    // Northern Vietnam
    baseAvg = 3.8;
    range = [3.2, 4.5];
  } else if (lat >= 13) {
    // Central Vietnam
    baseAvg = 4.4;
    range = [3.8, 5.0];
  } else {
    // Southern Vietnam
    baseAvg = 4.9;
    range = [4.3, 5.5];
  }

  const monthly: PVGISMonthlyData[] = [];
  for (let month = 1; month <= 12; month++) {
    // Seasonal variation: Apr-Sep higher, Oct-Mar lower
    let seasonal: number;
    if (month >= 4 && month <= 9) {
      seasonal = (range[1] - baseAvg) * 0.8;
    } else {
      seasonal = (range[0] - baseAvg) * 0.8;
    }
    const value = baseAvg + seasonal;
    monthly.push({
      month,
      kwh_per_m2_day: Math.round(value * 100) / 100,
    });
  }

  return computeStats(monthly, 'DEFAULT');
}

// --- Stats computation ---

function computeStats(
  monthly: PVGISMonthlyData[],
  source: PVGISResult['source']
): PVGISResult {
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

  return { monthly, avg, min_month: minMonth, min_value: minValue, source };
}

// --- Main function with 3-tier fallback ---

export async function fetchPVGIS(
  organizationId: string,
  projectId: string,
  roofId: string
): Promise<PVGISResult> {
  return await withOrgContext(organizationId, async (client) => {
    // Get project coordinates
    const projectResult = await client.query(
      `SELECT latitude, longitude, customer_address FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projectResult.rows[0];
    const lat = project.latitude ? Number(project.latitude) : null;
    const lon = project.longitude ? Number(project.longitude) : null;

    if (!lat || !lon) {
      throw new Error('Chọn vị trí trên bản đồ trước khi lấy dữ liệu bức xạ');
    }

    // Get roof data
    const roofResult = await client.query(
      `SELECT * FROM project_roofs WHERE id = $1 AND project_id = $2 AND organization_id = $3`,
      [roofId, projectId, organizationId]
    );

    if (roofResult.rows.length === 0) {
      throw new Error('Roof not found');
    }

    const roof = roofResult.rows[0] as { azimuth: number; tilt: number };

    // 3-tier fallback
    let result: PVGISResult;

    try {
      result = await fetchFromPVGIS(lat, lon, roof.tilt || 15, roof.azimuth || 180);
    } catch (pvgisError) {
      console.warn('PVGIS failed, trying NASA POWER:', (pvgisError as Error).message);
      try {
        result = await fetchFromNASA(lat, lon);
      } catch (nasaError) {
        console.warn('NASA POWER failed, using VN defaults:', (nasaError as Error).message);
        result = getVietnamDefaults(lat);
      }
    }

    // Save to project_roofs
    await client.query(
      `UPDATE project_roofs
       SET pvgis_monthly = $1,
           pvgis_avg = $2,
           pvgis_min_month = $3,
           pvgis_min_value = $4,
           pvgis_source = $5,
           pvgis_fetched_at = NOW()
       WHERE id = $6`,
      [
        JSON.stringify(result.monthly),
        result.avg,
        result.min_month,
        result.min_value,
        result.source,
        roofId,
      ]
    );

    return result;
  });
}
