import * as XLSX from 'xlsx';
import { withOrgContext } from '../config/database';
import {
  checkPVModuleReady,
  checkInverterReady,
  checkBatteryReady,
  checkAccessoryReady,
} from '../../../shared/src/utils/ready-gate';
import type { CatalogType } from './catalog';

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

/**
 * Parse Excel file buffer
 */
function parseExcel(buffer: Buffer): any[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

/**
 * Validate and normalize row data
 */
function validateRow(
  type: CatalogType,
  row: any,
  _rowIndex: number
): { valid: boolean; data?: any; error?: string } {
  const data: any = {};

  switch (type) {
    case 'pv_modules':
      if (!row.sku || !row.brand || !row.model) {
        return { valid: false, error: 'Missing required fields: sku, brand, model' };
      }
      if (!row.power_watt) {
        return { valid: false, error: 'Missing power_watt' };
      }
      data.sku = row.sku.toString().trim();
      data.brand = row.brand.toString().trim();
      data.model = row.model.toString().trim();
      data.power_watt = parseInt(String(row.power_watt), 10);
      data.voc = row.voc != null && row.voc !== '' ? parseFloat(String(row.voc)) : null;
      data.vmp = row.vmp != null && row.vmp !== '' ? parseFloat(String(row.vmp)) : null;
      data.isc = row.isc != null && row.isc !== '' ? parseFloat(String(row.isc)) : null;
      data.imp = row.imp != null && row.imp !== '' ? parseFloat(String(row.imp)) : null;
      data.efficiency =
        row.efficiency != null && row.efficiency !== ''
          ? parseFloat(String(row.efficiency))
          : null;
      data.cost_price_vnd =
        row.cost_price_vnd != null && row.cost_price_vnd !== ''
          ? parseInt(String(row.cost_price_vnd), 10)
          : null;
      data.sell_price_vnd =
        row.sell_price_vnd != null && row.sell_price_vnd !== ''
          ? parseInt(String(row.sell_price_vnd), 10)
          : null;
      break;

    case 'inverters':
      if (!row.sku || !row.brand || !row.model) {
        return { valid: false, error: 'Missing required fields: sku, brand, model' };
      }
      if (!row.power_watt || !row.inverter_type) {
        return { valid: false, error: 'Missing power_watt or inverter_type' };
      }
      data.sku = row.sku.toString().trim();
      data.brand = row.brand.toString().trim();
      data.model = row.model.toString().trim();
      data.power_watt = parseInt(String(row.power_watt), 10);
      data.inverter_type = row.inverter_type.toString().toUpperCase().trim();
      if (!['STRING', 'HYBRID', 'MICRO'].includes(data.inverter_type)) {
        return { valid: false, error: 'Invalid inverter_type (must be STRING, HYBRID, or MICRO)' };
      }
      data.max_dc_voltage =
        row.max_dc_voltage != null && row.max_dc_voltage !== ''
          ? parseInt(String(row.max_dc_voltage), 10)
          : null;
      data.mppt_count =
        row.mppt_count != null && row.mppt_count !== ''
          ? parseInt(String(row.mppt_count), 10)
          : null;
      data.battery_voltage =
        row.battery_voltage != null && row.battery_voltage !== ''
          ? parseInt(String(row.battery_voltage), 10)
          : null;
      data.max_charge_current =
        row.max_charge_current != null && row.max_charge_current !== ''
          ? parseInt(String(row.max_charge_current), 10)
          : null;
      data.cost_price_vnd =
        row.cost_price_vnd != null && row.cost_price_vnd !== ''
          ? parseInt(String(row.cost_price_vnd), 10)
          : null;
      data.sell_price_vnd =
        row.sell_price_vnd != null && row.sell_price_vnd !== ''
          ? parseInt(String(row.sell_price_vnd), 10)
          : null;
      break;

    case 'batteries':
      if (!row.sku || !row.brand || !row.model) {
        return { valid: false, error: 'Missing required fields: sku, brand, model' };
      }
      if (row.voltage == null || row.voltage === '') {
        return { valid: false, error: 'Missing voltage' };
      }
      data.sku = row.sku.toString().trim();
      data.brand = row.brand.toString().trim();
      data.model = row.model.toString().trim();
      data.voltage = parseInt(String(row.voltage), 10);
      data.capacity_kwh =
        row.capacity_kwh != null && row.capacity_kwh !== ''
          ? parseFloat(String(row.capacity_kwh))
          : null;
      data.depth_of_discharge =
        row.depth_of_discharge != null && row.depth_of_discharge !== ''
          ? parseFloat(String(row.depth_of_discharge))
          : null;
      data.cycle_life =
        row.cycle_life != null && row.cycle_life !== ''
          ? parseInt(String(row.cycle_life), 10)
          : null;
      data.cost_price_vnd =
        row.cost_price_vnd != null && row.cost_price_vnd !== ''
          ? parseInt(String(row.cost_price_vnd), 10)
          : null;
      data.sell_price_vnd =
        row.sell_price_vnd != null && row.sell_price_vnd !== ''
          ? parseInt(String(row.sell_price_vnd), 10)
          : null;
      break;

    case 'accessories':
      if (!row.sku || !row.name) {
        return { valid: false, error: 'Missing required fields: sku or name' };
      }
      data.sku = row.sku.toString().trim();
      data.name = row.name.toString().trim();
      data.category =
        row.category != null && row.category !== '' ? row.category.toString().trim() : null;
      data.unit =
        row.unit != null && row.unit !== '' ? row.unit.toString().trim() : 'piece';
      data.cost_price_vnd =
        row.cost_price_vnd != null && row.cost_price_vnd !== ''
          ? parseInt(String(row.cost_price_vnd), 10)
          : null;
      data.sell_price_vnd =
        row.sell_price_vnd != null && row.sell_price_vnd !== ''
          ? parseInt(String(row.sell_price_vnd), 10)
          : null;
      break;

    default:
      return { valid: false, error: 'Invalid catalog type' };
  }

  return { valid: true, data };
}

/**
 * Calculate ready status
 */
function calculateReady(type: CatalogType, data: any): boolean {
  switch (type) {
    case 'pv_modules':
      return checkPVModuleReady(data);
    case 'inverters':
      return checkInverterReady(data);
    case 'batteries':
      return checkBatteryReady(data);
    case 'accessories':
      return checkAccessoryReady(data);
    default:
      return false;
  }
}

/**
 * Import Excel file to catalog
 * Upsert: If SKU exists, update; otherwise create
 */
export async function importCatalog(
  organizationId: string,
  type: CatalogType,
  buffer: Buffer
): Promise<ImportResult> {
  const result: ImportResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const rows = parseExcel(buffer);
    result.total = rows.length;

    const tableName = `catalog_${type}`;

    await withOrgContext(organizationId, async (client) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // Excel row (1-indexed + header)

        const validation = validateRow(type, row, rowNum);
        if (!validation.valid) {
          result.skipped++;
          result.errors.push({ row: rowNum, error: validation.error || 'Unknown error' });
          continue;
        }

        const data = validation.data!;
        const isReady = calculateReady(type, data);

        const existing = await client.query(
          `SELECT id FROM ${tableName} WHERE organization_id = $1 AND sku = $2`,
          [organizationId, data.sku]
        );

        if (existing.rows.length > 0) {
          const columns = Object.keys(data).filter((k) => k !== 'sku');
          const setClause = columns.map((k, idx) => `${k} = $${idx + 3}`).join(', ');
          const values = columns.map((k) => data[k]);

          await client.query(
            `UPDATE ${tableName}
             SET ${setClause}, ready = $${columns.length + 3}, updated_at = NOW()
             WHERE id = $1 AND organization_id = $2`,
            [existing.rows[0].id, organizationId, ...values, isReady]
          );
          result.updated++;
        } else {
          const columns = Object.keys(data);
          const placeholders = columns.map((_, idx) => `$${idx + 2}`).join(', ');
          const values = columns.map((k) => data[k]);

          await client.query(
            `INSERT INTO ${tableName}
             (organization_id, ${columns.join(', ')}, ready)
             VALUES ($1, ${placeholders}, $${columns.length + 2})`,
            [organizationId, ...values, isReady]
          );
          result.created++;
        }
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ row: 0, error: `Import failed: ${message}` });
  }

  return result;
}
