export interface FinancialInput {
  pv_cost: number;
  inverter_cost: number;
  battery_cost?: number;
  accessories_cost: number;
  combo_box_cost?: number;

  labor_cost: number;

  marketing_cost_pct: number;
  warranty_cost_pct: number;
  overhead_cost_pct: number;

  target_gross_margin: number;
  warning_gross_margin: number;
  block_gross_margin: number;
  target_net_margin: number;
  warning_net_margin: number;
  block_net_margin: number;

  quote_price: number;
}

export type MarginLevel = 'PASS' | 'WARNING' | 'BLOCK';

export interface FinancialResult {
  total_equipment_cost: number;
  total_hard_cost: number;

  marketing_cost: number;
  warranty_cost: number;
  overhead_cost: number;
  total_soft_cost: number;

  total_cost: number;

  gross_margin_amount: number;
  gross_margin_pct: number;

  net_margin_amount: number;
  net_margin_pct: number;

  gross_margin_level: MarginLevel;
  net_margin_level: MarginLevel;
  overall_level: MarginLevel;

  alerts: string[];
}

/**
 * Financial snapshot for storage
 * Compact format for quote line items
 */
export interface FinancialSnapshot {
  equipment_cost: number;
  labor_cost: number;
  soft_cost: number;
  total_cost: number;
  gross_margin_pct: number;
  net_margin_pct: number;
  level: MarginLevel;
  calculated_at: string;
}

/**
 * Evaluate alert level for a margin
 */
export function evaluateMarginLevel(
  marginPct: number,
  target: number,
  warning: number,
  block: number
): MarginLevel {
  if (marginPct < block) {
    return 'BLOCK';
  }
  if (marginPct < warning || marginPct < target) {
    return 'WARNING';
  }
  return 'PASS';
}

/**
 * Handle edge cases
 */
export function validateFinancialInput(input: FinancialInput): string[] {
  const errors: string[] = [];

  if (input.quote_price <= 0) {
    errors.push('Quote price must be positive');
  }

  if (input.pv_cost < 0 || input.inverter_cost < 0) {
    errors.push('Equipment costs must be non-negative');
  }

  if (input.labor_cost < 0) {
    errors.push('Labor cost must be non-negative');
  }

  if (
    input.marketing_cost_pct < 0 ||
    input.warranty_cost_pct < 0 ||
    input.overhead_cost_pct < 0
  ) {
    errors.push('Soft cost percentages must be non-negative');
  }

  return errors;
}

/**
 * Create snapshot from calculation result
 */
export function createFinancialSnapshot(
  input: FinancialInput,
  result: FinancialResult
): FinancialSnapshot {
  return {
    equipment_cost: result.total_equipment_cost,
    labor_cost: input.labor_cost,
    soft_cost: result.total_soft_cost,
    total_cost: result.total_cost,
    gross_margin_pct: Number(result.gross_margin_pct.toFixed(2)),
    net_margin_pct: Number(result.net_margin_pct.toFixed(2)),
    level: result.overall_level,
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Calculate financial metrics (pure function).
 */
export function calculateFinancial(input: FinancialInput): FinancialResult {
  const total_equipment_cost =
    input.pv_cost +
    input.inverter_cost +
    (input.battery_cost ?? 0) +
    input.accessories_cost +
    (input.combo_box_cost ?? 0);

  const total_hard_cost = total_equipment_cost + input.labor_cost;

  const marketing_cost = (input.quote_price * input.marketing_cost_pct) / 100;
  const warranty_cost = (input.quote_price * input.warranty_cost_pct) / 100;
  const overhead_cost = (input.quote_price * input.overhead_cost_pct) / 100;
  const total_soft_cost = marketing_cost + warranty_cost + overhead_cost;

  const total_cost = total_hard_cost + total_soft_cost;

  const gross_margin_amount = input.quote_price - total_hard_cost;
  const gross_margin_pct =
    input.quote_price > 0 ? (gross_margin_amount / input.quote_price) * 100 : 0;

  const net_margin_amount = input.quote_price - total_cost;
  const net_margin_pct =
    input.quote_price > 0 ? (net_margin_amount / input.quote_price) * 100 : 0;

  const gross_margin_level = evaluateMarginLevel(
    gross_margin_pct,
    input.target_gross_margin,
    input.warning_gross_margin,
    input.block_gross_margin
  );

  const net_margin_level = evaluateMarginLevel(
    net_margin_pct,
    input.target_net_margin,
    input.warning_net_margin,
    input.block_net_margin
  );

  let overall_level: MarginLevel = 'PASS';
  if (gross_margin_level === 'BLOCK' || net_margin_level === 'BLOCK') {
    overall_level = 'BLOCK';
  } else if (
    gross_margin_level === 'WARNING' ||
    net_margin_level === 'WARNING'
  ) {
    overall_level = 'WARNING';
  }

  const alerts: string[] = [];

  if (gross_margin_level === 'BLOCK') {
    alerts.push(
      `Gross margin ${gross_margin_pct.toFixed(1)}% below block threshold ${input.block_gross_margin}%`
    );
  } else if (gross_margin_level === 'WARNING') {
    alerts.push(
      `Gross margin ${gross_margin_pct.toFixed(1)}% below target ${input.target_gross_margin}%`
    );
  }

  if (net_margin_level === 'BLOCK') {
    alerts.push(
      `Net margin ${net_margin_pct.toFixed(1)}% below block threshold ${input.block_net_margin}%`
    );
  } else if (net_margin_level === 'WARNING') {
    alerts.push(
      `Net margin ${net_margin_pct.toFixed(1)}% below target ${input.target_net_margin}%`
    );
  }

  return {
    total_equipment_cost,
    total_hard_cost,
    marketing_cost,
    warranty_cost,
    overhead_cost,
    total_soft_cost,
    total_cost,
    gross_margin_amount,
    gross_margin_pct,
    net_margin_amount,
    net_margin_pct,
    gross_margin_level,
    net_margin_level,
    overall_level,
    alerts,
  };
}
