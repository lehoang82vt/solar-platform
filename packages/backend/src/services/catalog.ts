import { withOrgContext } from '../config/database';
import {
  checkPVModuleReady,
  checkInverterReady,
  checkBatteryReady,
  checkAccessoryReady,
  type PVModule,
  type Inverter,
  type Battery,
  type Accessory,
} from '../../../shared/src/utils/ready-gate';

export type CatalogType = 'pv_modules' | 'inverters' | 'batteries' | 'accessories';

const CATALOG_TYPES: CatalogType[] = ['pv_modules', 'inverters', 'batteries', 'accessories'];

export function isValidCatalogType(type: string): type is CatalogType {
  return CATALOG_TYPES.includes(type as CatalogType);
}

/**
 * List catalog items
 * @param readyOnly - If true, only return items where ready=true
 */
export async function listCatalog(
  organizationId: string,
  type: CatalogType,
  readyOnly = false
): Promise<any[]> {
  const tableName = `catalog_${type}`;

  return await withOrgContext(organizationId, async (client) => {
    const readyFilter = readyOnly ? 'AND ready = true' : '';
    const result = await client.query(
      `SELECT * FROM ${tableName}
       WHERE organization_id = $1
       AND deleted_at IS NULL
       ${readyFilter}
       ORDER BY created_at DESC`,
      [organizationId]
    );
    return result.rows;
  });
}

/**
 * Create catalog item
 * Automatically calculates ready status using READY gate
 */
export async function createCatalogItem(
  organizationId: string,
  type: CatalogType,
  data: any
): Promise<any> {
  const tableName = `catalog_${type}`;

  // Calculate ready status
  let isReady = false;
  switch (type) {
    case 'pv_modules':
      isReady = checkPVModuleReady(data as PVModule);
      break;
    case 'inverters':
      isReady = checkInverterReady(data as Inverter);
      break;
    case 'batteries':
      isReady = checkBatteryReady(data as Battery);
      break;
    case 'accessories':
      isReady = checkAccessoryReady(data as Accessory);
      break;
  }

  return await withOrgContext(organizationId, async (client) => {
    // Build column list dynamically (exclude 'ready' - we set it ourselves)
    const columns = Object.keys(data).filter((k) => k !== 'ready');
    const values = columns.map((k) => data[k]);
    const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');

    const result = await client.query(
      `INSERT INTO ${tableName}
       (organization_id, ${columns.join(', ')}, ready)
       VALUES ($1, ${placeholders}, $${columns.length + 2})
       RETURNING *`,
      [organizationId, ...values, isReady]
    );
    return result.rows[0];
  });
}

/**
 * Update catalog item
 * Recalculates ready status after update
 */
export async function updateCatalogItem(
  organizationId: string,
  type: CatalogType,
  id: string,
  data: any
): Promise<any> {
  const tableName = `catalog_${type}`;

  return await withOrgContext(organizationId, async (client) => {
    // Get current item
    const current = await client.query(
      `SELECT * FROM ${tableName} WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (current.rows.length === 0) {
      throw new Error('Item not found');
    }

    // Merge data
    const merged = { ...current.rows[0], ...data };

    // Recalculate ready
    let isReady = false;
    switch (type) {
      case 'pv_modules':
        isReady = checkPVModuleReady(merged as PVModule);
        break;
      case 'inverters':
        isReady = checkInverterReady(merged as Inverter);
        break;
      case 'batteries':
        isReady = checkBatteryReady(merged as Battery);
        break;
      case 'accessories':
        isReady = checkAccessoryReady(merged as Accessory);
        break;
    }

    // Build SET clause from data keys only
    const columns = Object.keys(data).filter((k) => k !== 'ready');
    if (columns.length === 0) {
      // Only update ready and updated_at
      const result = await client.query(
        `UPDATE ${tableName}
         SET ready = $3, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [id, organizationId, isReady]
      );
      return result.rows[0];
    }
    const setClause = columns.map((k, i) => `${k} = $${i + 3}`).join(', ');
    const values = columns.map((k) => data[k]);

    const result = await client.query(
      `UPDATE ${tableName}
       SET ${setClause}, ready = $${columns.length + 3}, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId, ...values, isReady]
    );
    return result.rows[0];
  });
}

/**
 * Soft delete catalog item
 */
export async function deleteCatalogItem(
  organizationId: string,
  type: CatalogType,
  id: string
): Promise<void> {
  const tableName = `catalog_${type}`;

  await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `UPDATE ${tableName} SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (result.rowCount === 0) {
      throw new Error('Item not found');
    }
  });
}
