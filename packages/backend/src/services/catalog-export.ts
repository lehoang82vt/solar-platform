import * as XLSX from 'xlsx';
import { withOrgContext } from '../config/database';
import type { CatalogType } from './catalog';

/**
 * Export catalog to Excel buffer
 * Returns Excel file with all records in template format
 */
export async function exportCatalog(
  organizationId: string,
  type: CatalogType
): Promise<Buffer> {
  const tableName = `catalog_${type}`;

  const rows = await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM ${tableName}
       WHERE organization_id = $1
       AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [organizationId]
    );
    return result.rows;
  });

  const data = rows.map((row: any) => {
    const exported: any = {
      sku: row.sku,
      brand: row.brand,
      model: row.model,
    };

    switch (type) {
      case 'pv_modules':
        exported.power_watt = row.power_watt;
        exported.voc = row.voc;
        exported.vmp = row.vmp;
        exported.isc = row.isc;
        exported.imp = row.imp;
        exported.efficiency = row.efficiency;
        exported.cost_price_vnd = row.cost_price_vnd;
        exported.sell_price_vnd = row.sell_price_vnd;
        break;

      case 'inverters':
        exported.inverter_type = row.inverter_type;
        exported.power_watt = row.power_watt;
        exported.max_dc_voltage = row.max_dc_voltage;
        exported.mppt_count = row.mppt_count;
        exported.battery_voltage = row.battery_voltage;
        exported.max_charge_current = row.max_charge_current;
        exported.cost_price_vnd = row.cost_price_vnd;
        exported.sell_price_vnd = row.sell_price_vnd;
        break;

      case 'batteries':
        exported.voltage = row.voltage;
        exported.capacity_kwh = row.capacity_kwh;
        exported.depth_of_discharge = row.depth_of_discharge;
        exported.cycle_life = row.cycle_life;
        exported.cost_price_vnd = row.cost_price_vnd;
        exported.sell_price_vnd = row.sell_price_vnd;
        break;

      case 'accessories':
        exported.name = row.name;
        exported.category = row.category;
        exported.unit = row.unit;
        exported.cost_price_vnd = row.cost_price_vnd;
        exported.sell_price_vnd = row.sell_price_vnd;
        delete exported.brand;
        delete exported.model;
        break;
    }

    return exported;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalog');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
