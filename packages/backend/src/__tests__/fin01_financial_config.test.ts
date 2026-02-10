/**
 * FIN-01: Financial config CRUD (margins, costs, labor)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFinancialConfig,
  updateFinancialConfig,
  validateFinancialConfig,
} from '../services/financial-config';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase, withOrgContext } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('test_fin01_1: get_creates_default_config', async () => {
  const orgId = await getDefaultOrganizationId();

  await withOrgContext(orgId, async (client) => {
    await client.query(
      `DELETE FROM financial_configs WHERE organization_id = $1`,
      [orgId]
    );
  });

  const config = await getFinancialConfig(orgId);

  assert.ok(config.id);
  assert.equal(config.organization_id, orgId);
  assert.equal(config.target_gross_margin, 30);
  assert.equal(config.labor_cost_type, 'PER_KWP');
});

test('test_fin01_2: update_config_saves', async () => {
  const orgId = await getDefaultOrganizationId();

  const config = await updateFinancialConfig(orgId, {
    target_gross_margin: 35,
    marketing_cost_pct: 5,
  });

  assert.equal(config.target_gross_margin, 35);
  assert.equal(config.marketing_cost_pct, 5);
});

test('test_fin01_3: validation_rejects_negative_margin', async () => {
  const errors = validateFinancialConfig({
    target_gross_margin: -10,
  });

  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('non-negative')));
});

test('test_fin01_4: validation_rejects_warning_below_block', async () => {
  const errors = validateFinancialConfig({
    warning_gross_margin: 15,
    block_gross_margin: 20,
  });

  assert.ok(errors.length > 0);
  assert.ok(
    errors.some((e) => e.includes('Warning') && e.includes('block'))
  );
});

test('test_fin01_5: labor_fixed_requires_amount', async () => {
  const errors = validateFinancialConfig({
    labor_cost_type: 'FIXED',
  });

  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('Fixed labor cost required')));
});

test('test_fin01_6: labor_per_kwp_requires_amount', async () => {
  const errors = validateFinancialConfig({
    labor_cost_type: 'PER_KWP',
    labor_cost_per_kwp_vnd: undefined,
  });

  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('Per kWp')));
});

test('test_fin01_7: config_isolated_by_organization', async () => {
  const orgId = await getDefaultOrganizationId();

  const config = await getFinancialConfig(orgId);

  assert.equal(config.organization_id, orgId);
});
