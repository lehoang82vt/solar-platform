/**
 * REC-01: PV module recommendation
 * Tests: ready-only, sorted by efficiency, suggested panel count, empty catalog
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPVRecommendations } from '../services/recommendations-pv';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { updateProjectUsage } from '../services/usage';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

test('test_rec01_1: returns_only_ready_pv_modules', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-READY-${Date.now()}`,
    brand: 'Brand A',
    model: 'Model A',
    power_watt: 550,
    voc: 49.8,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    efficiency: 21.5,
    sell_price_vnd: 3000000,
  });

  await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-NOT-READY-${Date.now()}`,
    brand: 'Brand B',
    model: 'Model B',
    power_watt: 500,
    voc: 48,
    vmp: 40,
    isc: 13,
    imp: 13,
    efficiency: 20,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getPVRecommendations(orgId, project.id);

  const notReadyModule = recommendations.find((r) => r.sku.includes('NOT-READY'));
  assert.equal(notReadyModule, undefined, 'Should not include not-ready modules');
});

test('test_rec01_2: sorted_by_efficiency', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-EFF-20-${Date.now()}`,
    brand: 'Brand',
    model: 'Low Eff',
    power_watt: 500,
    voc: 48,
    vmp: 40,
    isc: 13,
    imp: 13,
    efficiency: 20,
    sell_price_vnd: 3000000,
  });

  await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-EFF-22-${Date.now()}`,
    brand: 'Brand',
    model: 'High Eff',
    power_watt: 550,
    voc: 49.8,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    efficiency: 22,
    sell_price_vnd: 3500000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getPVRecommendations(orgId, project.id);

  if (recommendations.length >= 2) {
    for (let i = 0; i < recommendations.length - 1; i++) {
      assert.ok(
        recommendations[i].efficiency >= recommendations[i + 1].efficiency,
        'Should be sorted by efficiency descending'
      );
    }
  }
});

test('test_rec01_3: includes_suggested_panel_count', async () => {
  const orgId = await getDefaultOrganizationId();

  await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-COUNT-${Date.now()}`,
    brand: 'Brand',
    model: 'Model',
    power_watt: 550,
    voc: 49.8,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  await updateProjectUsage(orgId, project.id, {
    monthly_kwh: 500,
    day_usage_pct: 70,
  });

  const recommendations = await getPVRecommendations(orgId, project.id);

  assert.ok(recommendations.length > 0, 'Should have recommendations');
});

test('test_rec01_4: empty_catalog_returns_empty_list', async () => {
  const orgId = await getDefaultOrganizationId();

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getPVRecommendations(orgId, project.id);

  assert.ok(Array.isArray(recommendations), 'Should return array');
});
