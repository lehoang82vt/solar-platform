import { withOrgContext } from '../config/database';
import { configureSystem, getSystemConfig } from './system-config';
import type { SystemConfig } from './system-config';

/**
 * Adjust panel count. Recalculates stringing and reruns validation.
 */
export async function adjustPanelCount(
  organizationId: string,
  projectId: string,
  newPanelCount: number
): Promise<SystemConfig> {
  const config = await getSystemConfig(organizationId, projectId);
  if (!config || !config.pv_module_id || !config.inverter_id) {
    throw new Error('Config not found');
  }

  return await configureSystem(organizationId, projectId, {
    pv_module_id: config.pv_module_id,
    panel_count: newPanelCount,
    inverter_id: config.inverter_id,
    inverter_count: config.inverter_count,
    battery_id: config.battery_id ?? undefined,
    battery_count: config.battery_count ?? undefined,
    combo_box_id: config.combo_box_id ?? undefined,
    accessories: config.accessories,
  });
}

/**
 * Adjust battery (add, remove, or change).
 */
export async function adjustBattery(
  organizationId: string,
  projectId: string,
  batteryId: string | null,
  batteryCount?: number
): Promise<SystemConfig> {
  const config = await getSystemConfig(organizationId, projectId);
  if (!config || !config.pv_module_id || !config.inverter_id) {
    throw new Error('Config not found');
  }

  return await configureSystem(organizationId, projectId, {
    pv_module_id: config.pv_module_id,
    panel_count: config.panel_count!,
    inverter_id: config.inverter_id,
    inverter_count: config.inverter_count,
    battery_id: batteryId ?? undefined,
    battery_count: batteryCount,
    combo_box_id: config.combo_box_id ?? undefined,
    accessories: config.accessories,
  });
}

/**
 * Adjust inverter and/or inverter count (parallel).
 */
export async function adjustInverter(
  organizationId: string,
  projectId: string,
  inverterId: string,
  inverterCount = 1
): Promise<SystemConfig> {
  const config = await getSystemConfig(organizationId, projectId);
  if (!config || !config.pv_module_id || !config.inverter_id) {
    throw new Error('Config not found');
  }

  return await withOrgContext(organizationId, async (client) => {
    const inverterResult = await client.query(
      `SELECT * FROM catalog_inverters WHERE id = $1 AND organization_id = $2`,
      [inverterId, organizationId]
    );

    if (inverterResult.rows.length === 0) {
      throw new Error('Inverter not found');
    }

    const inverter = inverterResult.rows[0] as {
      parallelable?: boolean | null;
      max_parallel_units?: number | null;
    };

    if (inverterCount > 1) {
      if (!inverter.parallelable) {
        throw new Error('Inverter is not parallelable');
      }
      const maxUnits = inverter.max_parallel_units ?? 1;
      if (inverterCount > maxUnits) {
        throw new Error(`Maximum ${maxUnits} units allowed`);
      }
    }

    return await configureSystem(organizationId, projectId, {
      pv_module_id: config.pv_module_id!,
      panel_count: config.panel_count!,
      inverter_id: inverterId,
      inverter_count: inverterCount,
      battery_id: config.battery_id ?? undefined,
      battery_count: config.battery_count ?? undefined,
      combo_box_id: config.combo_box_id ?? undefined,
      accessories: config.accessories,
    });
  });
}

/**
 * Adjust accessories (replace entire array).
 */
export async function adjustAccessories(
  organizationId: string,
  projectId: string,
  accessories: Array<{ accessory_id: string; quantity: number }>
): Promise<SystemConfig> {
  const config = await getSystemConfig(organizationId, projectId);
  if (!config || !config.pv_module_id || !config.inverter_id) {
    throw new Error('Config not found');
  }

  return await configureSystem(organizationId, projectId, {
    pv_module_id: config.pv_module_id,
    panel_count: config.panel_count!,
    inverter_id: config.inverter_id,
    inverter_count: config.inverter_count,
    battery_id: config.battery_id ?? undefined,
    battery_count: config.battery_count ?? undefined,
    combo_box_id: config.combo_box_id ?? undefined,
    accessories,
  });
}

/**
 * Adjust combo box.
 */
export async function adjustComboBox(
  organizationId: string,
  projectId: string,
  comboBoxId: string | null
): Promise<SystemConfig> {
  const config = await getSystemConfig(organizationId, projectId);
  if (!config || !config.pv_module_id || !config.inverter_id) {
    throw new Error('Config not found');
  }

  return await configureSystem(organizationId, projectId, {
    pv_module_id: config.pv_module_id,
    panel_count: config.panel_count!,
    inverter_id: config.inverter_id,
    inverter_count: config.inverter_count,
    battery_id: config.battery_id ?? undefined,
    battery_count: config.battery_count ?? undefined,
    combo_box_id: comboBoxId ?? undefined,
    accessories: config.accessories,
  });
}
