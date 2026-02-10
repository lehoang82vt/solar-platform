/**
 * PRO-02: Profit alerts – alert on WARNING/BLOCK, mode, recipients, financial data, no alert on PASS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfitAlert, shouldSendProfitAlert } from '../services/profit-alert';

test('pro02_1: alert_on_low_profit_warning_block', () => {
  const w = buildProfitAlert('WARNING', { recipients: ['a@x.com'] });
  assert.ok(w !== null);
  assert.equal(w.level, 'WARNING');
  assert.ok(shouldSendProfitAlert('WARNING'));
  const b = buildProfitAlert('BLOCK', { recipients: ['b@x.com'] });
  assert.ok(b !== null);
  assert.equal(b.level, 'BLOCK');
  assert.ok(shouldSendProfitAlert('BLOCK'));
});

test('pro02_2: alert_mode_low_only_vs_always', () => {
  const low = buildProfitAlert('WARNING', { mode: 'low_only', recipients: ['u@x.com'] });
  assert.ok(low !== null);
  assert.equal(low.level, 'WARNING');
  const always = buildProfitAlert('WARNING', { mode: 'always', recipients: ['u@x.com'] });
  assert.ok(always !== null);
  assert.equal(always.level, 'WARNING');
});

test('pro02_3: alert_recipients_emails', () => {
  const alert = buildProfitAlert('BLOCK', {
    recipients: ['admin@co.com', 'finance@co.com'],
  });
  assert.ok(alert !== null);
  assert.equal(alert.to.length, 2);
  assert.ok(alert.to.includes('admin@co.com'));
  assert.ok(alert.to.includes('finance@co.com'));
});

test('pro02_4: alert_contains_financial_data', () => {
  const financialData = { margin_pct: 8.5, total_vnd: 500000000, level: 'WARNING' };
  const alert = buildProfitAlert('WARNING', { financialData, recipients: [] });
  assert.ok(alert !== null);
  assert.equal(alert.financialData.margin_pct, 8.5);
  assert.equal(alert.financialData.total_vnd, 500000000);
  assert.equal(alert.financialData.level, 'WARNING');
});

test('pro02_5: no_alert_on_pass', () => {
  const passLow = buildProfitAlert('PASS', { mode: 'low_only', recipients: ['x@y.com'] });
  assert.equal(passLow, null);
  const passAlways = buildProfitAlert('PASS', { mode: 'always', recipients: ['x@y.com'] });
  assert.equal(passAlways, null);
  assert.equal(shouldSendProfitAlert('PASS'), false);
});
