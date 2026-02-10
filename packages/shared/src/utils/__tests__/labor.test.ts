import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLaborCost } from '../labor.ts';

test('test_fin03_1: fixed_labor_cost', () => {
  const result = calculateLaborCost({
    labor_cost_type: 'FIXED',
    labor_cost_fixed_vnd: 10000000,
  });

  assert.equal(result, 10000000);
});

test('test_fin03_2: per_kwp_labor_cost', () => {
  const result = calculateLaborCost({
    labor_cost_type: 'PER_KWP',
    labor_cost_per_kwp_vnd: 2000000,
    system_size_kwp: 5.5,
  });

  // 2M × 5.5 = 11M
  assert.equal(result, 11000000);
});

test('test_fin03_3: manual_labor_cost', () => {
  const result = calculateLaborCost({
    labor_cost_type: 'MANUAL',
    labor_cost_manual_vnd: 15000000,
  });

  assert.equal(result, 15000000);
});
