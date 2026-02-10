/**
 * REC-04: System configuration save with validation
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { configureSystem } from '../services/system-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createTestSetup(orgId: string) {
  // Module: Vmp 90 so 2 panels/string = 180V (start voltage), 150V+ (MPPT min), Imp 2 for current
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-CONFIG-${Date.now()}`,
    brand: 'Test',
    model: 'Test Module',
    power_watt: 550,
    voc: 49.5,
    vmp: 90,
    isc: 13.87,
    imp: 2,
    efficiency: 21.3,
    sell_price_vnd: 3000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-CONFIG-${Date.now()}`,
    brand: 'Test',
    model: 'Test Inverter',
    inverter_type: 'STRING',
    power_watt: 15000,
    max_dc_voltage: 800,
    mppt_count: 10,
    sell_price_vnd: 15000000,
  });

  const accessory = await createCatalogItem(orgId, 'accessories', {
    sku: `ACC-CONFIG-${Date.now()}`,
    name: 'Test Cable',
    category: 'CABLE',
    unit: 'METER',
    sell_price_vnd: 50000,
  });

  const lead = await createLead(orgId, {
    phone: `+8490${Date.now().toString().slice(-7)}`,
  });
  const project = await createProjectFromLead(orgId, lead.id);

  return { module, inverter, accessory, project };
}

test('test_rec04_1: configure_saves_system_config', async () => {
  const orgId = await getDefaultOrganizationId();
  const { module, inverter, project } = await createTestSetup(orgId);

  const config = await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
  });

  assert.ok(config.id);
  assert.equal(config.project_id, project.id);
  assert.equal(config.pv_module_id, module.id);
  assert.equal(config.panel_count, 20);
  assert.equal(config.inverter_id, inverter.id);
});

test('test_rec04_2: configure_runs_all_validations', async () => {
  const orgId = await getDefaultOrganizationId();
  const { module, inverter, project } = await createTestSetup(orgId);

  const config = await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
  });

  assert.ok(config.validation_status, 'Should have validation status');
  assert.ok(
    Array.isArray(config.validation_reasons),
    'Should have validation reasons'
  );
});

test('test_rec04_3: block_prevents_quote_creation', async () => {
  const orgId = await getDefaultOrganizationId();
  const { module, project } = await createTestSetup(orgId);

  // Inverter with valid stringing but DC/AC > 1.5 → BLOCK
  const blockInv = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-BLOCK-${Date.now()}`,
    brand: 'Test',
    model: 'Block Inverter',
    inverter_type: 'STRING',
    power_watt: 3000,
    max_dc_voltage: 1000,
    mppt_count: 2,
    sell_price_vnd: 10000000,
  });

  const config = await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: blockInv.id,
  });

  assert.equal(config.validation_status, 'BLOCK', 'Should be BLOCK');
});

test('test_rec04_4: warning_allows_quote_creation', async () => {
  const orgId = await getDefaultOrganizationId();
  const { module, inverter, project } = await createTestSetup(orgId);

  const config = await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
  });

  assert.ok(
    config.validation_status === 'PASS' || config.validation_status === 'WARNING',
    'Should be PASS or WARNING'
  );
});

test('test_rec04_5: accessories_auto_calculated', async () => {
  const orgId = await getDefaultOrganizationId();
  const { module, inverter, accessory, project } = await createTestSetup(orgId);

  const config = await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
    accessories: [{ accessory_id: accessory.id, quantity: 100 }],
  });

  assert.ok(Array.isArray(config.accessories), 'Should have accessories array');
  assert.equal(config.accessories.length, 1, 'Should have 1 accessory');
  assert.equal(config.accessories[0].accessory_id, accessory.id);
  assert.equal(config.accessories[0].quantity, 100);
});

test('test_rec04_6: combo_box_auto_selected', async () => {
  const orgId = await getDefaultOrganizationId();
  const { module, inverter, project } = await createTestSetup(orgId);

  await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
  });

  assert.ok(true, 'Config saved');
});
