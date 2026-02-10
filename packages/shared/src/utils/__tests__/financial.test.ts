import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFinancial,
  createFinancialSnapshot,
} from '../financial.ts';

const baseInput = {
  pv_cost: 60000000,
  inverter_cost: 15000000,
  battery_cost: 20000000,
  accessories_cost: 5000000,
  combo_box_cost: 2000000,
  labor_cost: 10000000,
  marketing_cost_pct: 3,
  warranty_cost_pct: 2,
  overhead_cost_pct: 5,
  target_gross_margin: 30,
  warning_gross_margin: 25,
  block_gross_margin: 20,
  target_net_margin: 15,
  warning_net_margin: 10,
  block_net_margin: 5,
  quote_price: 150000000,
};

test('test_fin02_01: basic_calculation_correct', () => {
  const result = calculateFinancial(baseInput);

  assert.equal(result.total_equipment_cost, 102000000);
  assert.equal(result.total_hard_cost, 112000000);
  assert.equal(result.total_soft_cost, 15000000);
  assert.equal(result.total_cost, 127000000);
});

test('test_fin02_02: gross_margin_calculation', () => {
  const result = calculateFinancial(baseInput);

  assert.equal(result.gross_margin_amount, 38000000);
  assert.ok(Math.abs(result.gross_margin_pct - 25.33) < 0.1);
});

test('test_fin02_03: gross_margin_pass_threshold', () => {
  const input = {
    ...baseInput,
    quote_price: 180000000,
  };

  const result = calculateFinancial(input);

  assert.equal(result.gross_margin_level, 'PASS');
});

test('test_fin02_04: gross_margin_warning_threshold', () => {
  const result = calculateFinancial(baseInput);

  assert.equal(result.gross_margin_level, 'WARNING');
});

test('test_fin02_05: gross_margin_block_threshold', () => {
  const input = {
    ...baseInput,
    quote_price: 130000000,
  };

  const result = calculateFinancial(input);

  assert.equal(result.gross_margin_level, 'BLOCK');
});

test('test_fin02_06: soft_costs_calculated_from_quote_price', () => {
  const result = calculateFinancial(baseInput);

  assert.equal(result.marketing_cost, 4500000);
  assert.equal(result.warranty_cost, 3000000);
  assert.equal(result.overhead_cost, 7500000);
});

test('test_fin02_07: net_margin_includes_soft_costs', () => {
  const result = calculateFinancial(baseInput);

  assert.equal(result.net_margin_amount, 23000000);
  assert.ok(Math.abs(result.net_margin_pct - 15.33) < 0.1);
  assert.equal(result.net_margin_level, 'PASS');
});

test('test_fin02_08: net_margin_warning_threshold', () => {
  const input = {
    ...baseInput,
    quote_price: 140000000,
  };

  const result = calculateFinancial(input);

  assert.equal(result.net_margin_level, 'WARNING');
  assert.ok(result.alerts.some((a) => a.includes('Net margin')));
});

test('test_fin02_09: net_margin_block_threshold', () => {
  const input = {
    ...baseInput,
    quote_price: 131000000, // Net margin ~4.5% < 5% block
  };

  const result = calculateFinancial(input);

  assert.equal(result.net_margin_level, 'BLOCK');
  assert.equal(result.overall_level, 'BLOCK');
});

test('test_fin02_10: overall_level_is_worst_of_margins', () => {
  const input1 = {
    ...baseInput,
    quote_price: 180000000,
    overhead_cost_pct: 20,
  };

  const result1 = calculateFinancial(input1);

  assert.equal(result1.gross_margin_level, 'PASS');
  assert.equal(result1.net_margin_level, 'WARNING');
  assert.equal(result1.overall_level, 'WARNING');

  const input2 = {
    ...baseInput,
    quote_price: 135000000,
  };

  const result2 = calculateFinancial(input2);

  assert.equal(result2.overall_level, 'BLOCK');
});

test('test_fin02_11: zero_battery_cost_handled', () => {
  const input = {
    ...baseInput,
    battery_cost: 0,
  };

  const result = calculateFinancial(input);

  assert.equal(result.total_equipment_cost, 82000000);
});

test('test_fin02_12: undefined_optional_costs_handled', () => {
  const input = {
    ...baseInput,
    battery_cost: undefined,
    combo_box_cost: undefined,
  };

  const result = calculateFinancial(input);

  assert.equal(result.total_equipment_cost, 80000000);
});

test('test_fin02_13: snapshot_has_required_fields', () => {
  const result = calculateFinancial(baseInput);
  const snapshot = createFinancialSnapshot(baseInput, result);

  assert.ok(snapshot.equipment_cost);
  assert.ok(snapshot.labor_cost);
  assert.ok(snapshot.soft_cost);
  assert.ok(snapshot.total_cost);
  assert.ok(typeof snapshot.gross_margin_pct === 'number');
  assert.ok(typeof snapshot.net_margin_pct === 'number');
  assert.ok(['PASS', 'WARNING', 'BLOCK'].includes(snapshot.level));
  assert.ok(snapshot.calculated_at);
});

test('test_fin02_14: snapshot_margins_rounded_to_2_decimals', () => {
  const result = calculateFinancial(baseInput);
  const snapshot = createFinancialSnapshot(baseInput, result);

  const grossStr = snapshot.gross_margin_pct.toString();
  const netStr = snapshot.net_margin_pct.toString();

  const grossDecimals = grossStr.includes('.')
    ? grossStr.split('.')[1].length
    : 0;
  const netDecimals = netStr.includes('.') ? netStr.split('.')[1].length : 0;

  assert.ok(grossDecimals <= 2, 'Gross margin should have max 2 decimals');
  assert.ok(netDecimals <= 2, 'Net margin should have max 2 decimals');
});
