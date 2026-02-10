import { withOrgContext } from '../config/database';
import { calculateStringing } from '../../../shared/src/utils/stringing';
import {
  checkVocCold,
  checkMpptRange,
  checkStartVoltage,
  checkMpptCurrent,
  checkStringCount,
  checkDcAcRatio,
  checkHybridRequired,
  checkBatteryVoltage,
  checkLvHvMismatch,
} from '../../../shared/src/utils/inverter-validation';

export type InverterRank = 'PASS' | 'WARNING' | 'BLOCK';

export interface InverterRecommendation {
  id: string;
  sku: string;
  brand: string;
  model: string;
  inverter_type: string;
  power_watt: number;
  max_dc_voltage: number;
  mppt_count: number;
  sell_price_vnd: number;
  rank: InverterRank;
  block_reasons: string[];
}

const MPPT_MIN_V = 150;
const MPPT_MAX_V = 850;
const START_VOLTAGE_V = 180;
const MPPT_MAX_CURRENT_A = 30;
const COLD_TEMP_FACTOR = 1.12;

/**
 * Get inverter recommendations for a project + PV module + panel count.
 * Optional batteryId: when set, enforces HYBRID and battery voltage compatibility.
 * Rank: PASS / WARNING / BLOCK. Sorted PASS first, WARNING middle, BLOCK last.
 */
export async function getInverterRecommendations(
  organizationId: string,
  _projectId: string,
  pvModuleId: string,
  panelCount: number,
  batteryId?: string
): Promise<InverterRecommendation[]> {
  return await withOrgContext(organizationId, async (client) => {
    const moduleResult = await client.query(
      `SELECT * FROM catalog_pv_modules WHERE id = $1 AND organization_id = $2`,
      [pvModuleId, organizationId]
    );

    if (moduleResult.rows.length === 0) {
      throw new Error('PV module not found');
    }

    const module = moduleResult.rows[0] as Record<string, unknown>;
    const moduleVoc = Number(module.voc);
    const moduleVmp = Number(module.vmp);
    const moduleImp = Number(module.imp);
    const modulePowerWatt = Number(module.power_watt);

    let battery: Record<string, unknown> | null = null;
    if (batteryId) {
      const batteryResult = await client.query(
        `SELECT * FROM catalog_batteries WHERE id = $1 AND organization_id = $2`,
        [batteryId, organizationId]
      );
      if (batteryResult.rows.length > 0) {
        battery = batteryResult.rows[0] as Record<string, unknown>;
      }
    }

    const invertersResult = await client.query(
      `SELECT * FROM catalog_inverters
       WHERE organization_id = $1
       AND ready = true
       AND deleted_at IS NULL
       ORDER BY power_watt DESC`,
      [organizationId]
    );

    const recommendations: InverterRecommendation[] = [];

    for (const inv of invertersResult.rows as Record<string, unknown>[]) {
      const blockReasons: string[] = [];
      const warningReasons: string[] = [];
      const maxDcVoltage = Number(inv.max_dc_voltage);
      const mpptCount = Number(inv.mppt_count);

      const maxPanelsPerString = Math.max(
        1,
        Math.floor(maxDcVoltage / (moduleVoc * COLD_TEMP_FACTOR))
      );
      const stringing = calculateStringing(panelCount, maxPanelsPerString, mpptCount);

      if (!stringing) {
        const stringCountNeeded = Math.ceil(panelCount / maxPanelsPerString);
        if (stringCountNeeded > mpptCount) {
          blockReasons.push(
            `String count (${stringCountNeeded}) exceeds MPPT inputs (${mpptCount})`
          );
        } else {
          blockReasons.push('Cannot find valid stringing configuration');
        }
        recommendations.push({
          id: inv.id as string,
          sku: inv.sku as string,
          brand: inv.brand as string,
          model: inv.model as string,
          inverter_type: inv.inverter_type as string,
          power_watt: Number(inv.power_watt),
          max_dc_voltage: maxDcVoltage,
          mppt_count: mpptCount,
          sell_price_vnd: Number(inv.sell_price_vnd),
          rank: 'BLOCK',
          block_reasons: blockReasons,
        });
        continue;
      }

      const vocCheck = checkVocCold(moduleVoc, stringing.panels_per_string, maxDcVoltage);
      if (vocCheck.result === 'BLOCK' && vocCheck.reason) blockReasons.push(vocCheck.reason);

      const mpptCheck = checkMpptRange(
        moduleVmp,
        stringing.panels_per_string,
        MPPT_MIN_V,
        MPPT_MAX_V
      );
      if (mpptCheck.result === 'BLOCK' && mpptCheck.reason) blockReasons.push(mpptCheck.reason);

      const startCheck = checkStartVoltage(moduleVmp, stringing.panels_per_string, START_VOLTAGE_V);
      if (startCheck.result === 'BLOCK' && startCheck.reason) blockReasons.push(startCheck.reason);

      const currentCheck = checkMpptCurrent(
        moduleImp,
        stringing.panels_per_string,
        MPPT_MAX_CURRENT_A
      );
      if (currentCheck.result === 'BLOCK' && currentCheck.reason)
        blockReasons.push(currentCheck.reason);

      const stringCheck = checkStringCount(stringing.string_count, mpptCount);
      if (stringCheck.result === 'BLOCK' && stringCheck.reason) blockReasons.push(stringCheck.reason);

      const dcPower = modulePowerWatt * stringing.total_panels;
      const acPower = Number(inv.power_watt);
      const dcAcCheck = checkDcAcRatio(dcPower, acPower);
      if (dcAcCheck.result === 'BLOCK' && dcAcCheck.reason) blockReasons.push(dcAcCheck.reason);
      if (dcAcCheck.result === 'WARNING' && dcAcCheck.reason) warningReasons.push(dcAcCheck.reason);

      const hybridCheck = checkHybridRequired(!!battery, inv.inverter_type as string);
      if (hybridCheck.result === 'BLOCK' && hybridCheck.reason) blockReasons.push(hybridCheck.reason);

      if (battery) {
        const invMin = inv.battery_voltage_min != null ? Number(inv.battery_voltage_min) : null;
        const invMax = inv.battery_voltage_max != null ? Number(inv.battery_voltage_max) : null;
        const invNominal = inv.battery_voltage != null ? Number(inv.battery_voltage) : null;
        const minV = invMin ?? invNominal;
        const maxV = invMax ?? invNominal;
        const batteryVoltageCheck = checkBatteryVoltage(
          battery.voltage != null ? Number(battery.voltage) : null,
          minV,
          maxV
        );
        if (batteryVoltageCheck.result === 'BLOCK' && batteryVoltageCheck.reason)
          blockReasons.push(batteryVoltageCheck.reason);
      }

      const stringVoltage = moduleVmp * stringing.panels_per_string;
      const lvHvCheck = checkLvHvMismatch(stringVoltage, maxDcVoltage);
      if (lvHvCheck.result === 'BLOCK' && lvHvCheck.reason) blockReasons.push(lvHvCheck.reason);

      let rank: InverterRank = 'PASS';
      if (blockReasons.length > 0) {
        rank = 'BLOCK';
      } else if (warningReasons.length > 0) {
        rank = 'WARNING';
      }

      recommendations.push({
        id: inv.id as string,
        sku: inv.sku as string,
        brand: inv.brand as string,
        model: inv.model as string,
        inverter_type: inv.inverter_type as string,
        power_watt: Number(inv.power_watt),
        max_dc_voltage: maxDcVoltage,
        mppt_count: mpptCount,
        sell_price_vnd: Number(inv.sell_price_vnd),
        rank,
        block_reasons: [...blockReasons, ...warningReasons],
      });
    }

    const rankOrder: Record<InverterRank, number> = { PASS: 0, WARNING: 1, BLOCK: 2 };
    recommendations.sort((a, b) => rankOrder[a.rank] - rankOrder[b.rank]);

    return recommendations;
  });
}
