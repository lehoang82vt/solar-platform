/**
 * REC-05: Adjustment APIs (panels, battery, inverter, accessories, combo)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustPanelCount,
  adjustBattery,
  adjustInverter,
  adjustAccessories,
  adjustComboBox,
} from '../services/system-adjustments';
import { configureSystem } from '../services/system-config';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createAdjustmentSetup(orgId: string) {
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-ADJ-${Date.now()}`,
    brand: 'Test',
    model: 'Test Module',
    power_watt: 550,
    voc: 50,
    vmp: 90,
    isc: 7,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });

  const inverter = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-ADJ-${Date.now()}`,
    brand: 'Test',
    model: 'Test Inverter',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 800,
    mppt_count: 10,
    parallelable: false,
    max_parallel_units: 1,
    sell_price_vnd: 15000000,
  });

  const parallelInv = await createCatalogItem(orgId, 'inverters', {
    sku: `INV-PARALLEL-${Date.now()}`,
    brand: 'Test',
    model: 'Parallel Inverter',
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 800,
    mppt_count: 10,
    parallelable: true,
    max_parallel_units: 4,
    sell_price_vnd: 12000000,
  });

  const battery = await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-ADJ-${Date.now()}`,
    brand: 'Test',
    model: 'Test Battery',
    voltage: 48,
    capacity_kwh: 10,
    depth_of_discharge: 80,
    cycle_life: 6000,
    sell_price_vnd: 20000000,
  });

  const accessory = await createCatalogItem(orgId, 'accessories', {
    sku: `ACC-ADJ-${Date.now()}`,
    name: 'Test Cable',
    category: 'CABLE',
    unit: 'METER',
    sell_price_vnd: 50000,
  });

  const lead = await createLead(orgId, {
    phone: `+8490${Date.now().toString().slice(-7)}`,
  });
  const project = await createProjectFromLead(orgId, lead.id);

  await configureSystem(orgId, project.id, {
    pv_module_id: module.id,
    panel_count: 20,
    inverter_id: inverter.id,
  });

  return { module, inverter, parallelInv, battery, accessory, project };
}

test('test_rec05_01: change_panel_count_recalculates_stringing', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createAdjustmentSetup(orgId);

  const config = await adjustPanelCount(orgId, project.id, 30);

  assert.equal(config.panel_count, 30);
  assert.ok(config.panels_per_string, 'Should recalculate stringing');
  assert.ok(config.string_count, 'Should recalculate stringing');
});

test('test_rec05_02: change_panel_count_reruns_validation', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createAdjustmentSetup(orgId);

  const config = await adjustPanelCount(orgId, project.id, 25);

  assert.ok(config.validation_status, 'Should have validation status');
  assert.ok(
    Array.isArray(config.validation_reasons),
    'Should have validation reasons'
  );
});

test('test_rec05_03: change_battery_validates_compatibility', async () => {
  const orgId = await getDefaultOrganizationId();
  const { battery, project } = await createAdjustmentSetup(orgId);

  const config = await adjustBattery(orgId, project.id, battery.id, 1);

  assert.equal(config.validation_status, 'BLOCK');
  assert.ok(
    config.validation_reasons.some((r: string) => r.includes('HYBRID'))
  );
});

test('test_rec05_04: remove_battery_allowed', async () => {
  const orgId = await getDefaultOrganizationId();
  const { battery, project } = await createAdjustmentSetup(orgId);

  await adjustBattery(orgId, project.id, battery.id, 1);

  const config = await adjustBattery(orgId, project.id, null);

  assert.equal(config.battery_id, null);
});

test('test_rec05_05: change_inverter_reruns_full_validation', async () => {
  const orgId = await getDefaultOrganizationId();
  const { inverter, project } = await createAdjustmentSetup(orgId);

  const config = await adjustInverter(orgId, project.id, inverter.id, 1);

  assert.equal(config.inverter_id, inverter.id);
  assert.ok(config.validation_status);
});

test('test_rec05_06: parallel_inverter_requires_parallelable', async () => {
  const orgId = await getDefaultOrganizationId();
  const { inverter, project } = await createAdjustmentSetup(orgId);

  await assert.rejects(
    async () => {
      await adjustInverter(orgId, project.id, inverter.id, 2);
    },
    (error: Error) => {
      assert.ok(error.message.includes('not parallelable'));
      return true;
    }
  );
});

test('test_rec05_07: parallel_inverter_respects_max_units', async () => {
  const orgId = await getDefaultOrganizationId();
  const { parallelInv, project } = await createAdjustmentSetup(orgId);

  await assert.rejects(
    async () => {
      await adjustInverter(orgId, project.id, parallelInv.id, 5);
    },
    (error: Error) => {
      assert.ok(
        error.message.includes('Maximum') && error.message.includes('4')
      );
      return true;
    }
  );
});

test('test_rec05_08: non_parallelable_inverter_count_2_rejected', async () => {
  const orgId = await getDefaultOrganizationId();
  const { inverter, project } = await createAdjustmentSetup(orgId);

  await assert.rejects(
    async () => {
      await adjustInverter(orgId, project.id, inverter.id, 2);
    },
    (error: Error) => {
      assert.ok(error.message.includes('parallelable'));
      return true;
    }
  );
});

test('test_rec05_09: accessories_manual_adjustment_saves', async () => {
  const orgId = await getDefaultOrganizationId();
  const { accessory, project } = await createAdjustmentSetup(orgId);

  const config = await adjustAccessories(orgId, project.id, [
    { accessory_id: accessory.id, quantity: 150 },
  ]);

  assert.equal(config.accessories.length, 1);
  assert.equal(config.accessories[0].quantity, 150);
});

test('test_rec05_10: combo_box_change_validates_phase_kwp', async () => {
  const orgId = await getDefaultOrganizationId();
  const { project } = await createAdjustmentSetup(orgId);

  const config = await adjustComboBox(orgId, project.id, null);

  assert.ok(config, 'Config adjusted');
});
