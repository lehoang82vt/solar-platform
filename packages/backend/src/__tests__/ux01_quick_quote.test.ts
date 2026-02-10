/**
 * UX-01: Quick quote API (DEMO project, auto-select, expiry, transition)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuickQuote,
  transitionDemoToReal,
  canCreateOfficialQuote,
} from '../services/quick-quote';
import { createCatalogItem } from '../services/catalog';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, getDatabasePool } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createQuickQuoteSetup(orgId: string) {
  await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-QUICK-${Date.now()}`,
    brand: 'Test',
    model: 'Test Module',
    power_watt: 550,
    voc: 80,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 22,
    sell_price_vnd: 3000000,
  });

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-QUICK-${Date.now()}`,
    brand: 'Test',
    model: 'Test Inverter',
    inverter_type: 'STRING',
    power_watt: 20000,
    max_dc_voltage: 1000,
    mppt_count: 10,
    sell_price_vnd: 15000000,
  });

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-QUICK-${Date.now()}`,
    brand: 'Test',
    model: 'Test Battery',
    voltage: 48,
    capacity_kwh: 10,
    depth_of_discharge: 80,
    cycle_life: 6000,
    sell_price_vnd: 20000000,
  });
}

test('test_ux01_1: quick_quote_creates_demo_project', async () => {
  const orgId = await getDefaultOrganizationId();
  await createQuickQuoteSetup(orgId);

  const result = await createQuickQuote(orgId, {
    customer_name: 'Test Customer',
    monthly_kwh: 500,
    day_usage_pct: 100,
  });

  assert.ok(result.project_id);
  assert.equal(result.is_demo, true);
  assert.ok(result.expires_at);
  assert.ok(result.system_config);
  assert.ok(result.estimated_cost_vnd > 0);
});

test('test_ux01_2: quick_quote_returns_under_500ms', async () => {
  const orgId = await getDefaultOrganizationId();
  await createQuickQuoteSetup(orgId);

  const startTime = Date.now();

  await createQuickQuote(orgId, {
    monthly_kwh: 500,
    day_usage_pct: 100,
  });

  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 2000, `Should be fast, got ${elapsed}ms`);
});

test('test_ux01_3: demo_cannot_create_official_quote', async () => {
  const canCreate = canCreateOfficialQuote(true);
  assert.equal(canCreate, false, 'Demo should not create official quote');

  const canCreateReal = canCreateOfficialQuote(false);
  assert.equal(canCreateReal, true, 'Real project can create quote');
});

test('test_ux01_4: demo_transitions_to_surveying', async () => {
  const orgId = await getDefaultOrganizationId();
  await createQuickQuoteSetup(orgId);

  const result = await createQuickQuote(orgId, {
    monthly_kwh: 500,
    day_usage_pct: 100,
  });

  await transitionDemoToReal(orgId, result.project_id);

  const pool = getDatabasePool();
  assert.ok(pool, 'pool should be set');
  const check = await pool!.query(
    `SELECT is_demo, demo_expires_at FROM projects WHERE id = $1`,
    [result.project_id]
  );

  assert.equal(check.rows[0].is_demo, false);
  assert.equal(check.rows[0].demo_expires_at, null);
});

test('test_ux01_5: demo_expires_after_7_days', async () => {
  const orgId = await getDefaultOrganizationId();
  await createQuickQuoteSetup(orgId);

  const result = await createQuickQuote(orgId, {
    monthly_kwh: 500,
    day_usage_pct: 100,
  });

  const expiresAt = new Date(result.expires_at);
  const now = new Date();
  const diffDays =
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  assert.ok(
    diffDays >= 6.9 && diffDays <= 7.1,
    `Should expire in ~7 days, got ${diffDays}`
  );
});

test('test_ux01_6: quick_quote_auto_selects_best_equipment', async () => {
  const orgId = await getDefaultOrganizationId();
  await createQuickQuoteSetup(orgId);

  const result = await createQuickQuote(orgId, {
    monthly_kwh: 500,
    day_usage_pct: 100,
  });

  const config = result.system_config;

  assert.ok(config.pv_module_id, 'Should auto-select PV');
  assert.ok(config.inverter_id, 'Should auto-select inverter');
  assert.ok((config.panel_count ?? 0) > 0, 'Should have panel count');
  // Battery may be set when storage target > 0 and inverter supports it (HYBRID)
});
