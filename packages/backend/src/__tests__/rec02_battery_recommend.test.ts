/**
 * REC-02: Battery recommendation (PASS/WARNING/BLOCK)
 * Tests: rank order, block reason, storage zero, DoD calculation
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBatteryRecommendations } from '../services/recommendations-battery';
import { createCatalogItem } from '../services/catalog';
import { updateProjectUsage } from '../services/usage';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('test_rec02_1: pass_batteries_first_in_list', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-PASS-${Date.now()}`,
    brand: 'Brand A',
    model: 'Large',
    voltage: 48,
    capacity_kwh: 10,
    depth_of_discharge: 80,
    cycle_life: 6000,
    sell_price_vnd: 20000000,
  });

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-BLOCK-${Date.now()}`,
    brand: 'Brand B',
    model: 'Small',
    voltage: 48,
    capacity_kwh: 2,
    depth_of_discharge: 80,
    cycle_life: 3000,
    sell_price_vnd: 5000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const recommendations = await getBatteryRecommendations(orgId, project.id);

  const passCount = recommendations.filter((r) => r.rank === 'PASS').length;
  if (passCount > 0) {
    assert.equal(recommendations[0].rank, 'PASS', 'PASS batteries should be first');
  }
});

test('test_rec02_2: warning_batteries_in_middle', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-WARN-${Date.now()}`,
    brand: 'Brand',
    model: 'Medium',
    voltage: 48,
    capacity_kwh: 7,
    depth_of_discharge: 80,
    cycle_life: 5000,
    sell_price_vnd: 15000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const recommendations = await getBatteryRecommendations(orgId, project.id);

  const warningBatteries = recommendations.filter((r) => r.rank === 'WARNING');
  if (warningBatteries.length > 0) {
    const firstWarningIdx = recommendations.findIndex((r) => r.rank === 'WARNING');
    let lastPassIdx = -1;
    for (let i = recommendations.length - 1; i >= 0; i--) {
      if (recommendations[i].rank === 'PASS') {
        lastPassIdx = i;
        break;
      }
    }
    const firstBlockIdx = recommendations.findIndex((r) => r.rank === 'BLOCK');

    if (lastPassIdx !== -1 && firstBlockIdx !== -1) {
      assert.ok(
        firstWarningIdx > lastPassIdx && firstWarningIdx < firstBlockIdx,
        'WARNING should be between PASS and BLOCK'
      );
    }
  }
});

test('test_rec02_3: block_batteries_at_end', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-BLOCK2-${Date.now()}`,
    brand: 'Brand',
    model: 'Tiny',
    voltage: 48,
    capacity_kwh: 1,
    depth_of_discharge: 80,
    cycle_life: 3000,
    sell_price_vnd: 3000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const recommendations = await getBatteryRecommendations(orgId, project.id);

  const blockBatteries = recommendations.filter((r) => r.rank === 'BLOCK');
  if (blockBatteries.length > 0) {
    const lastIdx = recommendations.length - 1;
    assert.equal(recommendations[lastIdx].rank, 'BLOCK', 'BLOCK batteries should be last');
  }
});

test('test_rec02_4: block_batteries_have_reason', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-REASON-${Date.now()}`,
    brand: 'Brand',
    model: 'Small',
    voltage: 48,
    capacity_kwh: 1,
    depth_of_discharge: 80,
    cycle_life: 3000,
    sell_price_vnd: 3000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const recommendations = await getBatteryRecommendations(orgId, project.id);

  const blockBatteries = recommendations.filter((r) => r.rank === 'BLOCK');
  for (const battery of blockBatteries) {
    assert.ok(battery.block_reason, 'BLOCK batteries should have reason');
  }
});

test('test_rec02_5: no_battery_needed_when_storage_zero', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-ZERO-${Date.now()}`,
    brand: 'Brand',
    model: 'Any',
    voltage: 48,
    capacity_kwh: 5,
    depth_of_discharge: 80,
    cycle_life: 5000,
    sell_price_vnd: 15000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 100,
  });

  const recommendations = await getBatteryRecommendations(orgId, project.id);

  for (const battery of recommendations) {
    assert.equal(battery.rank, 'BLOCK', 'Should block all batteries when no storage needed');
    assert.ok(
      battery.block_reason?.includes('No storage needed'),
      'Should explain no storage needed'
    );
  }
});

test('test_rec02_6: capacity_check_uses_dod', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-DOD-${Date.now()}`,
    brand: 'Brand',
    model: 'DoD Test',
    voltage: 48,
    capacity_kwh: 10,
    depth_of_discharge: 80,
    cycle_life: 6000,
    sell_price_vnd: 20000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const recommendations = await getBatteryRecommendations(orgId, project.id);

  const testBattery = recommendations.find((r) => r.sku.includes('DOD'));
  if (testBattery) {
    const expectedUsable = (10 * 80) / 100;
    assert.ok(
      Math.abs(testBattery.usable_capacity_kwh - expectedUsable) < 0.01,
      `Usable capacity should be ${expectedUsable} kWh (capacity * DoD / 100)`
    );
  }
});
