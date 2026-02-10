import { withOrgContext } from '../config/database';
import { createLead } from './leads';
import { createProjectFromLead } from './projects-lead';
import { updateProjectUsage } from './usage';
import { getPVRecommendations } from './recommendations-pv';
import { getInverterRecommendations } from './recommendations-inverter';
import { getBatteryRecommendations } from './recommendations-battery';
import { configureSystem } from './system-config';
import type { SystemConfig } from './system-config';

export interface QuickQuoteInput {
  customer_name?: string;
  customer_phone?: string;
  monthly_kwh: number;
  day_usage_pct: number;
  roof_area?: number;
}

export interface QuickQuoteResult {
  project_id: string;
  is_demo: true;
  expires_at: string;
  system_config: SystemConfig;
  estimated_cost_vnd: number;
}

async function autoSelectEquipment(
  organizationId: string,
  projectId: string,
  _monthlyKwh: number,
  storageTargetKwh: number
): Promise<{
  pvModuleId: string;
  panelCount: number;
  inverterId: string;
  batteryId?: string;
}> {
  const pvRecs = await getPVRecommendations(organizationId, projectId);

  if (pvRecs.length === 0) {
    throw new Error('No PV modules available');
  }

  const selectedPV = pvRecs[0];
  const panelCount = selectedPV.suggested_panel_count ?? 20;

  const invRecs = await getInverterRecommendations(
    organizationId,
    projectId,
    selectedPV.id,
    panelCount
  );

  const passInverters = invRecs.filter((r) => r.rank === 'PASS');
  const warningInverters = invRecs.filter((r) => r.rank === 'WARNING');
  const selectedInverter = passInverters[0] ?? warningInverters[0];
  if (!selectedInverter) {
    throw new Error('No suitable inverters found');
  }

  let selectedBattery: string | undefined;
  if (storageTargetKwh > 0) {
    const batteryRecs = await getBatteryRecommendations(
      organizationId,
      projectId
    );
    const passBatteries = batteryRecs.filter((r) => r.rank === 'PASS');
    if (passBatteries.length > 0) {
      selectedBattery = passBatteries[0].id;
    }
  }

  return {
    pvModuleId: selectedPV.id,
    panelCount,
    inverterId: selectedInverter.id,
    batteryId: selectedBattery,
  };
}

/**
 * Create quick quote (DEMO project). No auth required.
 */
export async function createQuickQuote(
  organizationId: string,
  input: QuickQuoteInput
): Promise<QuickQuoteResult> {
  const startTime = Date.now();

  return await withOrgContext(organizationId, async (client) => {
    const phone =
      input.customer_phone?.trim() ||
      `+8490${String(Date.now()).slice(-7)}`;

    const lead = await createLead(organizationId, { phone });

    const project = await createProjectFromLead(organizationId, lead.id);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await client.query(
      `UPDATE projects
       SET is_demo = true, demo_expires_at = $1, updated_at = NOW()
       WHERE id = $2`,
      [expiresAt, project.id]
    );

    await updateProjectUsage(organizationId, project.id, {
      monthly_kwh: input.monthly_kwh,
      day_usage_pct: input.day_usage_pct,
    });

    const projectData = await client.query(
      `SELECT storage_target_kwh FROM projects WHERE id = $1`,
      [project.id]
    );
    const storageTarget =
      Number(projectData.rows[0]?.storage_target_kwh) || 0;

    const equipment = await autoSelectEquipment(
      organizationId,
      project.id,
      input.monthly_kwh,
      storageTarget
    );

    const config = await configureSystem(organizationId, project.id, {
      pv_module_id: equipment.pvModuleId,
      panel_count: equipment.panelCount,
      inverter_id: equipment.inverterId,
      battery_id: equipment.batteryId,
    });

    const pvResult = await client.query(
      `SELECT sell_price_vnd FROM catalog_pv_modules WHERE id = $1`,
      [equipment.pvModuleId]
    );
    const invResult = await client.query(
      `SELECT sell_price_vnd FROM catalog_inverters WHERE id = $1`,
      [equipment.inverterId]
    );

    let estimatedCost =
      Number(pvResult.rows[0]?.sell_price_vnd ?? 0) * equipment.panelCount +
      Number(invResult.rows[0]?.sell_price_vnd ?? 0);

    if (equipment.batteryId) {
      const batResult = await client.query(
        `SELECT sell_price_vnd FROM catalog_batteries WHERE id = $1`,
        [equipment.batteryId]
      );
      estimatedCost += Number(batResult.rows[0]?.sell_price_vnd ?? 0);
    }

    const elapsedMs = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Quick quote created in ${elapsedMs}ms`);
    }

    return {
      project_id: project.id,
      is_demo: true,
      expires_at: expiresAt.toISOString(),
      system_config: config,
      estimated_cost_vnd: estimatedCost,
    };
  });
}

/**
 * Transition demo to real project (clear demo flags).
 */
export async function transitionDemoToReal(
  organizationId: string,
  projectId: string
): Promise<void> {
  await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `SELECT is_demo FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    if (!result.rows[0].is_demo) {
      throw new Error('Project is not a demo');
    }

    await client.query(
      `UPDATE projects
       SET is_demo = false, demo_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [projectId]
    );
  });
}

/**
 * Check if project can create official quote (non-demo only).
 */
export function canCreateOfficialQuote(isDemo: boolean): boolean {
  return !isDemo;
}
