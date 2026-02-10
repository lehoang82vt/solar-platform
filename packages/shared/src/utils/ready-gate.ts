/**
 * READY GATE LOGIC
 *
 * Catalog items must pass validation before being usable in quotes.
 * Each item type has different required fields.
 */

export interface PVModule {
  power_watt: number;
  voc?: number | null;
  vmp?: number | null;
  isc?: number | null;
  imp?: number | null;
  efficiency?: number | null;
  cost_price_vnd?: number | null;
  sell_price_vnd?: number | null;
}

export interface Inverter {
  inverter_type: 'STRING' | 'HYBRID' | 'MICRO';
  power_watt: number;
  max_dc_voltage?: number | null;
  mppt_count?: number | null;
  battery_voltage?: number | null;
  max_charge_current?: number | null;
  cost_price_vnd?: number | null;
  sell_price_vnd?: number | null;
}

export interface Battery {
  voltage: number;
  capacity_kwh?: number | null;
  depth_of_discharge?: number | null;
  cycle_life?: number | null;
  cost_price_vnd?: number | null;
  sell_price_vnd?: number | null;
}

export interface Accessory {
  name: string;
  cost_price_vnd?: number | null;
  sell_price_vnd?: number | null;
}

/**
 * Check if PV Module is ready
 * Required: voc, vmp, isc, imp, sell_price_vnd
 */
export function checkPVModuleReady(item: PVModule): boolean {
  return !!(
    item.voc &&
    item.vmp &&
    item.isc &&
    item.imp &&
    item.sell_price_vnd
  );
}

/**
 * Check if Inverter is ready
 * Required: sell_price_vnd
 * If HYBRID: also requires battery_voltage, max_charge_current
 */
export function checkInverterReady(item: Inverter): boolean {
  if (!item.sell_price_vnd) {
    return false;
  }

  if (item.inverter_type === 'HYBRID') {
    return !!(item.battery_voltage && item.max_charge_current);
  }

  return true;
}

/**
 * Check if Battery is ready
 * Required: capacity_kwh, sell_price_vnd
 */
export function checkBatteryReady(item: Battery): boolean {
  return !!(item.capacity_kwh && item.sell_price_vnd);
}

/**
 * Check if Accessory is ready
 * Required: sell_price_vnd
 */
export function checkAccessoryReady(item: Accessory): boolean {
  return !!item.sell_price_vnd;
}

/**
 * Generic ready gate checker
 */
export function checkReadyGate(
  type: 'pv' | 'inverter' | 'battery' | 'accessory',
  item: PVModule | Inverter | Battery | Accessory
): boolean {
  switch (type) {
    case 'pv':
      return checkPVModuleReady(item as PVModule);
    case 'inverter':
      return checkInverterReady(item as Inverter);
    case 'battery':
      return checkBatteryReady(item as Battery);
    case 'accessory':
      return checkAccessoryReady(item as Accessory);
    default:
      return false;
  }
}
