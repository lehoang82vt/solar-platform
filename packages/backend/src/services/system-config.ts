import { withOrgContext } from '../config/database';
import { getInverterRecommendations } from './recommendations-inverter';
import { calculateStringing } from '../../../shared/src/utils/stringing';

export interface SystemConfig {
  id: string;
  organization_id: string;
  project_id: string;
  pv_module_id?: string | null;
  panel_count?: number | null;
  inverter_id?: string | null;
  inverter_count: number;
  battery_id?: string | null;
  battery_count?: number | null;
  combo_box_id?: string | null;
  accessories: Array<{ accessory_id: string; quantity: number }>;
  validation_status?: string | null;
  validation_reasons: string[];
  panels_per_string?: number | null;
  string_count?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConfigureInput {
  pv_module_id: string;
  panel_count: number;
  inverter_id: string;
  inverter_count?: number;
  battery_id?: string;
  battery_count?: number;
  combo_box_id?: string;
  accessories?: Array<{ accessory_id: string; quantity: number }>;
}

function calculateAccessories(
  inputAccessories: Array<{ accessory_id: string; quantity: number }> | undefined
): Array<{ accessory_id: string; quantity: number }> {
  return inputAccessories ?? [];
}

async function selectComboBox(
  _organizationId: string,
  comboBoxId: string | undefined,
  _systemSizeKw: number
): Promise<string | null> {
  if (comboBoxId) {
    return comboBoxId;
  }
  return null;
}

/**
 * Configure system and save. Runs validation and stringing; UPSERT by project_id.
 */
export async function configureSystem(
  organizationId: string,
  projectId: string,
  input: ConfigureInput
): Promise<SystemConfig> {
  return await withOrgContext(organizationId, async (client) => {
    const projectCheck = await client.query(
      `SELECT id FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found');
    }

    const moduleResult = await client.query(
      `SELECT * FROM catalog_pv_modules WHERE id = $1 AND organization_id = $2`,
      [input.pv_module_id, organizationId]
    );

    if (moduleResult.rows.length === 0) {
      throw new Error('PV module not found');
    }

    const module = moduleResult.rows[0] as Record<string, unknown>;

    const inverterResult = await client.query(
      `SELECT * FROM catalog_inverters WHERE id = $1 AND organization_id = $2`,
      [input.inverter_id, organizationId]
    );

    if (inverterResult.rows.length === 0) {
      throw new Error('Inverter not found');
    }

    const inverter = inverterResult.rows[0] as Record<string, unknown>;
    const moduleVoc = Number(module.voc);
    const maxDcVoltage = Number(inverter.max_dc_voltage);
    const mpptCount = Number(inverter.mppt_count);

    const maxPanelsPerString = Math.max(
      1,
      Math.floor(maxDcVoltage / (moduleVoc * 1.12))
    );
    const stringing = calculateStringing(
      input.panel_count,
      maxPanelsPerString,
      mpptCount
    );

    if (!stringing) {
      throw new Error('Cannot calculate valid stringing');
    }

    const recommendations = await getInverterRecommendations(
      organizationId,
      projectId,
      input.pv_module_id,
      input.panel_count,
      input.battery_id
    );

    const selectedInv = recommendations.find((r) => r.id === input.inverter_id);
    const validationStatus = selectedInv?.rank ?? 'BLOCK';
    const validationReasons = selectedInv?.block_reasons ?? [];

    const accessories = calculateAccessories(input.accessories);

    const systemSizeKw =
      (Number(module.power_watt) * input.panel_count) / 1000;
    const comboBoxId = await selectComboBox(
      organizationId,
      input.combo_box_id,
      systemSizeKw
    );

    const result = await client.query(
      `INSERT INTO system_configs
       (organization_id, project_id, pv_module_id, panel_count, inverter_id, inverter_count,
        battery_id, battery_count, combo_box_id, accessories, validation_status, validation_reasons,
        panels_per_string, string_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT (project_id)
       DO UPDATE SET
         pv_module_id = EXCLUDED.pv_module_id,
         panel_count = EXCLUDED.panel_count,
         inverter_id = EXCLUDED.inverter_id,
         inverter_count = EXCLUDED.inverter_count,
         battery_id = EXCLUDED.battery_id,
         battery_count = EXCLUDED.battery_count,
         combo_box_id = EXCLUDED.combo_box_id,
         accessories = EXCLUDED.accessories,
         validation_status = EXCLUDED.validation_status,
         validation_reasons = EXCLUDED.validation_reasons,
         panels_per_string = EXCLUDED.panels_per_string,
         string_count = EXCLUDED.string_count,
         updated_at = NOW()
       RETURNING *`,
      [
        organizationId,
        projectId,
        input.pv_module_id,
        input.panel_count,
        input.inverter_id,
        input.inverter_count ?? 1,
        input.battery_id ?? null,
        input.battery_count ?? null,
        comboBoxId,
        JSON.stringify(accessories),
        validationStatus,
        JSON.stringify(validationReasons),
        stringing.panels_per_string,
        stringing.string_count,
      ]
    );

    const row = result.rows[0] as Record<string, unknown>;
    const acc = row.accessories;
    const reasons = row.validation_reasons;

    return {
      ...row,
      accessories: Array.isArray(acc)
        ? acc
        : typeof acc === 'string'
          ? (JSON.parse(acc) as Array<{ accessory_id: string; quantity: number }>)
          : [],
      validation_reasons: Array.isArray(reasons)
        ? reasons
        : typeof reasons === 'string'
          ? (JSON.parse(reasons) as string[])
          : [],
    } as SystemConfig;
  });
}

/**
 * Get system config by project.
 */
export async function getSystemConfig(
  organizationId: string,
  projectId: string
): Promise<SystemConfig | null> {
  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM system_configs WHERE project_id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    const acc = row.accessories;
    const reasons = row.validation_reasons;

    return {
      ...row,
      accessories: Array.isArray(acc)
        ? acc
        : typeof acc === 'string'
          ? (JSON.parse(acc) as Array<{ accessory_id: string; quantity: number }>)
          : [],
      validation_reasons: Array.isArray(reasons)
        ? reasons
        : typeof reasons === 'string'
          ? (JSON.parse(reasons) as string[])
          : [],
    } as SystemConfig;
  });
}
