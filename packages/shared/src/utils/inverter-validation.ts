export type InverterCheckResult = 'PASS' | 'WARNING' | 'BLOCK';

export interface InverterValidation {
  voc_cold_check: InverterCheckResult;
  mppt_range_check: InverterCheckResult;
  start_voltage_check: InverterCheckResult;
  mppt_current_check: InverterCheckResult;
  string_count_check: InverterCheckResult;
  overall: InverterCheckResult;
  block_reasons: string[];
}

const COLD_TEMP_FACTOR = 1.12;

/**
 * Check if Voc at cold temp exceeds inverter max DC voltage
 */
export function checkVocCold(
  moduleVoc: number,
  panelsPerString: number,
  inverterMaxDcVoltage: number
): { result: InverterCheckResult; reason?: string } {
  const vocCold = moduleVoc * COLD_TEMP_FACTOR * panelsPerString;

  if (vocCold > inverterMaxDcVoltage) {
    return {
      result: 'BLOCK',
      reason: `Voc cold (${vocCold.toFixed(1)}V) exceeds max DC voltage (${inverterMaxDcVoltage}V)`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check if Vmp is within MPPT range
 */
export function checkMpptRange(
  moduleVmp: number,
  panelsPerString: number,
  mpptMinVoltage: number,
  mpptMaxVoltage: number
): { result: InverterCheckResult; reason?: string } {
  const vmp = moduleVmp * panelsPerString;

  if (vmp < mpptMinVoltage || vmp > mpptMaxVoltage) {
    return {
      result: 'BLOCK',
      reason: `Vmp (${vmp.toFixed(1)}V) outside MPPT range (${mpptMinVoltage}-${mpptMaxVoltage}V)`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check if Vmp is above start voltage
 */
export function checkStartVoltage(
  moduleVmp: number,
  panelsPerString: number,
  startVoltage: number
): { result: InverterCheckResult; reason?: string } {
  const vmp = moduleVmp * panelsPerString;

  if (vmp < startVoltage) {
    return {
      result: 'BLOCK',
      reason: `Vmp (${vmp.toFixed(1)}V) below start voltage (${startVoltage}V)`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check if MPPT current is within limits (uses Imp, not Isc)
 * Note: In series connection, current doesn't add - only voltage does.
 * So we use moduleImp directly, not multiplied by panelsPerString.
 */
export function checkMpptCurrent(
  moduleImp: number,
  panelsPerString: number,
  mpptMaxCurrent: number
): { result: InverterCheckResult; reason?: string } {
  // In series connection: voltage adds, current stays the same
  const current = moduleImp;

  if (current > mpptMaxCurrent) {
    return {
      result: 'BLOCK',
      reason: `MPPT current (${current.toFixed(1)}A) exceeds max (${mpptMaxCurrent}A)`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check if string count fits inverter inputs
 */
export function checkStringCount(
  stringCount: number,
  inverterMpptInputs: number
): { result: InverterCheckResult; reason?: string } {
  if (stringCount > inverterMpptInputs) {
    return {
      result: 'BLOCK',
      reason: `String count (${stringCount}) exceeds MPPT inputs (${inverterMpptInputs})`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check DC/AC ratio
 * WARNING: ratio > 1.3
 * BLOCK: ratio > 1.5
 */
export function checkDcAcRatio(
  dcPowerWatt: number,
  acPowerWatt: number
): { result: InverterCheckResult; reason?: string } {
  const ratio = dcPowerWatt / acPowerWatt;

  if (ratio > 1.5) {
    return {
      result: 'BLOCK',
      reason: `DC/AC ratio (${ratio.toFixed(2)}) exceeds 1.5`,
    };
  }

  if (ratio > 1.3) {
    return {
      result: 'WARNING',
      reason: `DC/AC ratio (${ratio.toFixed(2)}) exceeds 1.3`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check if hybrid inverter required for battery
 */
export function checkHybridRequired(
  hasBattery: boolean,
  inverterType: string
): { result: InverterCheckResult; reason?: string } {
  if (hasBattery && inverterType !== 'HYBRID') {
    return {
      result: 'BLOCK',
      reason: 'Battery requires HYBRID inverter',
    };
  }

  return { result: 'PASS' };
}

/**
 * Check battery voltage compatibility (for HYBRID with battery)
 */
export function checkBatteryVoltage(
  batteryVoltage: number | null,
  inverterBatteryVoltageMin: number | null,
  inverterBatteryVoltageMax: number | null
): { result: InverterCheckResult; reason?: string } {
  if (!batteryVoltage) {
    return { result: 'PASS' };
  }

  if (!inverterBatteryVoltageMin || !inverterBatteryVoltageMax) {
    return { result: 'PASS' };
  }

  if (
    batteryVoltage < inverterBatteryVoltageMin ||
    batteryVoltage > inverterBatteryVoltageMax
  ) {
    return {
      result: 'BLOCK',
      reason: `Battery voltage (${batteryVoltage}V) outside inverter range (${inverterBatteryVoltageMin}-${inverterBatteryVoltageMax}V)`,
    };
  }

  return { result: 'PASS' };
}

/**
 * Check LV/HV system mismatch (LV < 1000V, HV >= 1000V)
 */
/**
 * Check phase compatibility between project and inverter
 * 1-phase inverter + 3-phase project = BLOCK
 * 3-phase inverter + 1-phase project = WARNING (possible but not optimal)
 */
export function checkPhaseCompatibility(
  projectPhase: number | null,
  inverterPhase: number | null
): { result: InverterCheckResult; reason?: string } {
  if (!projectPhase || !inverterPhase) return { result: 'PASS' };
  if (projectPhase === 3 && inverterPhase === 1) {
    return {
      result: 'BLOCK',
      reason: 'Inverter 1 pha không tương thích hệ thống 3 pha',
    };
  }
  if (projectPhase === 1 && inverterPhase === 3) {
    return {
      result: 'WARNING',
      reason: 'Inverter 3 pha cho hệ thống 1 pha (không tối ưu)',
    };
  }
  return { result: 'PASS' };
}

export function checkLvHvMismatch(
  stringVoltage: number,
  inverterMaxDcVoltage: number
): { result: InverterCheckResult; reason?: string } {
  const isLvString = stringVoltage < 1000;
  const isLvInverter = inverterMaxDcVoltage < 1000;

  if (isLvString !== isLvInverter) {
    return {
      result: 'BLOCK',
      reason: `LV/HV mismatch: string ${stringVoltage}V vs inverter ${inverterMaxDcVoltage}V`,
    };
  }

  return { result: 'PASS' };
}
