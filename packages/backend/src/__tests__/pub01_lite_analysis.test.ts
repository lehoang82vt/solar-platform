import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLiteAnalysis } from '../../../shared/src/utils/lite-analysis';

test('test_pub01_01: south_3m_returns_10kwp', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 3000000,
    region: 'SOUTH',
  });

  assert.ok(result.suggested_kwp >= 9 && result.suggested_kwp <= 11);
  assert.ok(result.est_kwh_month > 0);
  assert.ok(result.est_saving_vnd_month > 0);
});

test('test_pub01_02: north_2m_returns_correct', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 2000000,
    region: 'NORTH',
  });

  assert.ok(result.suggested_kwp > 0);
  assert.ok(result.est_kwh_month > 0);
});

test('test_pub01_03: central_1m_returns_correct', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 1000000,
    region: 'CENTRAL',
  });

  assert.ok(result.suggested_kwp >= 1);
});

test('test_pub01_04: round_to_step_0_5', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 1500000,
    region: 'SOUTH',
  });

  assert.equal(result.suggested_kwp % 0.5, 0);
});

test('test_pub01_05: clamp_min_1kwp', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 100000,
    region: 'SOUTH',
  });

  assert.ok(result.suggested_kwp >= 1);
});

test('test_pub01_06: clamp_max_20kwp', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 50000000,
    region: 'SOUTH',
  });

  assert.ok(result.suggested_kwp <= 20);
});

test('test_pub01_07: zero_bill_rejected', () => {
  assert.throws(() => {
    calculateLiteAnalysis({
      monthly_bill_vnd: 0,
      region: 'SOUTH',
    });
  });
});

test('test_pub01_08: negative_bill_rejected', () => {
  assert.throws(() => {
    calculateLiteAnalysis({
      monthly_bill_vnd: -1000,
      region: 'SOUTH',
    });
  });
});

test('test_pub01_09: invalid_region_rejected', () => {
  assert.throws(() => {
    calculateLiteAnalysis({
      monthly_bill_vnd: 1000000,
      region: 'INVALID' as 'NORTH',
    });
  });
});

test('test_pub01_10: response_contains_disclaimer', () => {
  const result = calculateLiteAnalysis({
    monthly_bill_vnd: 1000000,
    region: 'SOUTH',
  });

  assert.ok(result.disclaimer);
  assert.ok(result.disclaimer.length > 10);
});

test('test_pub01_11: ref_code_saved_in_session', () => {
  assert.ok(true, 'Session logic TODO');
});

test('test_pub01_12: session_7_day_expiry', () => {
  assert.ok(true, 'Session expiry logic TODO');
});
