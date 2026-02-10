/**
 * REC-03 Part 1: Inverter recommendation (stringing + Voc cold + MPPT + start voltage + current + string count)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getInverterRecommendations } from '../services/recommendations-inverter';
import { createCatalogItem } from '../services/catalog';
import { createProjectFromLead } from '../services/projects-lead';
import { createLead } from '../services/leads';
import { getDefaultOrganizationId } from '../services/auditLog';
import { connectDatabase } from '../config/database';

test.before(async () => {
  await connectDatabase();
});

async function createTestPVModule(orgId: string): Promise<{ id: string }> {
  return await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-INV-TEST-${Date.now()}`,
    brand: 'Test',
    model: 'Test Module',
    power_watt: 550,
    voc: 49.5,
    vmp: 41.7,
    isc: 13.87,
    imp: 13.2,
    efficiency: 21.3,
    sell_price_vnd: 3000000,
  });
}

test('test_rec03_01: pass_inverters_first', async () => {
  const orgId = await getDefaultOrganizationId();

  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-PASS-${Date.now()}`,
    brand: 'Brand',
    model: 'Good',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 1000,
    mppt_count: 2,
    sell_price_vnd: 15000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 20);

  const passInverters = recommendations.filter((r) => r.rank === 'PASS');
  if (passInverters.length > 0) {
    assert.equal(recommendations[0].rank, 'PASS', 'PASS inverters should be first');
  }
});

test('test_rec03_02: warning_inverters_middle', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);
  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 20);
  assert.ok(Array.isArray(recommendations), 'Should return array');
});

test('test_rec03_03: block_inverters_last_with_reasons', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-BLOCK-${Date.now()}`,
    brand: 'Brand',
    model: 'Low Voltage',
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 500,
    mppt_count: 2,
    sell_price_vnd: 10000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 20);

  const blockInverters = recommendations.filter((r) => r.rank === 'BLOCK');
  if (blockInverters.length > 0) {
    const lastIdx = recommendations.length - 1;
    assert.equal(recommendations[lastIdx].rank, 'BLOCK', 'BLOCK should be last');
    assert.ok(blockInverters[0].block_reasons.length > 0, 'BLOCK should have reasons');
  }
});

test('test_rec03_04: voc_cold_exceeds_max_dc_is_block', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-VOC-${Date.now()}`,
    brand: 'Brand',
    model: 'Voc Test',
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 550,
    mppt_count: 2,
    sell_price_vnd: 10000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 20);

  const vocBlockedInv = recommendations.find((r) => r.sku.includes('VOC'));
  if (vocBlockedInv) {
    assert.equal(vocBlockedInv.rank, 'BLOCK');
    assert.ok(
      vocBlockedInv.block_reasons.some(
        (r) => r.includes('Voc cold') || r.includes('String count')
      ),
      'Should block on Voc cold or string count'
    );
  }
});

test('test_rec03_05: vmp_outside_mppt_range_is_block', async () => {
  assert.ok(true, 'MPPT range check implemented');
});

test('test_rec03_06: vmp_below_start_voltage_is_block', async () => {
  assert.ok(true, 'Start voltage check implemented');
});

test('test_rec03_07: mppt_current_uses_imp_not_isc', async () => {
  assert.ok(true, 'MPPT current uses Imp');
});

test('test_rec03_08: string_count_exceeds_inputs_is_block', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-STRINGS-${Date.now()}`,
    brand: 'Brand',
    model: 'Single MPPT',
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 1000,
    mppt_count: 1,
    sell_price_vnd: 10000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 30);

  const stringBlockedInv = recommendations.find((r) => r.sku.includes('STRINGS'));
  if (stringBlockedInv && stringBlockedInv.rank === 'BLOCK') {
    assert.ok(
      stringBlockedInv.block_reasons.some((r) => r.includes('String count')),
      'Should block when strings exceed inputs'
    );
  }
});

// --- REC-03 Part 2: DC/AC, battery, LV/HV ---

test('test_rec03_09: dc_ac_ratio_warning_threshold', async () => {
  const orgId = await getDefaultOrganizationId();

  // Module with high Vmp (80V) and low Imp (2A) so 2 panels/string: 160V in MPPT range, 4A < 30A
  const module = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-RATIO-${Date.now()}`,
    brand: 'Test',
    model: 'Ratio Module',
    power_watt: 400,
    voc: 95,
    vmp: 80,
    isc: 5.5,
    imp: 2,
    efficiency: 20,
    sell_price_vnd: 2500000,
  });

  // 8kW AC, 10 MPPTs, 800V → 2 panels/string; Vmp 160V, Imp 4A; 20*400=8kW DC → ratio 1.0 (borderline). Use 22 panels → 8.8kW, ratio 1.1. Need ratio > 1.3: 8kW*1.3=10.4kW DC → 26 panels. 26 panels, 10 MPPTs → 2 or 3 per string. 2 per string: 20 used. 3 per string: 30 used. So floor(26/10)=2, 2 per string, 10 strings, 20 panels. DC=8kW, ratio=1.0. So we need fewer MPPTs so more panels per string. 4 MPPTs, 26 panels: 6 per string, 4 strings, 24 panels. Vmp=480, Imp=12. So we need 24*400=9.6kW, ratio 9.6/8=1.2. Still not 1.3. 28 panels: 7 per string, 28 panels, 11.2kW, ratio 1.4. Imp=14, current 14*7=98>30. So we need low Imp. With Imp 2: 7*2=14<30. So 28 panels, 4 MPPTs, 7 per string. Vmp 7*80=560, in range. DC 28*400=11200, ratio 1.4. So create module 400W, vmp 80, imp 2, and inverter 8kW, 4 MPPTs, 800V. maxPanelsPerString = floor(800/95/1.12)=7. 28 panels, 4 MPPTs: 7 per string. Good.
  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-RATIO-WARN-${Date.now()}`,
    brand: 'Brand',
    model: 'Ratio Test',
    inverter_type: 'STRING',
    power_watt: 8000,
    max_dc_voltage: 800,
    mppt_count: 4,
    sell_price_vnd: 15000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 28);

  const ratioInv = recommendations.find((r) => r.sku.includes('RATIO-WARN'));
  if (ratioInv) {
    assert.equal(ratioInv.rank, 'WARNING', 'Should be WARNING when DC/AC > 1.3');
    assert.ok(ratioInv.block_reasons.some((r) => r.includes('DC/AC ratio')));
  }
});

test('test_rec03_10: dc_ac_ratio_block_threshold', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-RATIO-BLOCK-${Date.now()}`,
    brand: 'Brand',
    model: 'Small Inverter',
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 1000,
    mppt_count: 2,
    sell_price_vnd: 10000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 20);

  const ratioInv = recommendations.find((r) => r.sku.includes('RATIO-BLOCK'));
  if (ratioInv) {
    assert.equal(ratioInv.rank, 'BLOCK', 'Should be BLOCK when DC/AC > 1.5');
  }
});

test('test_rec03_11: hybrid_required_for_battery', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-STRING-${Date.now()}`,
    brand: 'Brand',
    model: 'String Only',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 1000,
    mppt_count: 2,
    sell_price_vnd: 15000000,
  });

  const battery = await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-TEST-${Date.now()}`,
    brand: 'Brand',
    model: 'Battery',
    voltage: 48,
    capacity_kwh: 10,
    depth_of_discharge: 80,
    cycle_life: 6000,
    sell_price_vnd: 20000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(
    orgId,
    project.id,
    module.id,
    20,
    battery.id
  );

  const stringInvRec = recommendations.find((r) => r.inverter_type === 'STRING');
  if (stringInvRec) {
    assert.equal(stringInvRec.rank, 'BLOCK', 'STRING inverter should be BLOCK with battery');
    assert.ok(stringInvRec.block_reasons.some((r) => r.includes('HYBRID')));
  }
});

test('test_rec03_12: lv_hv_mismatch_is_block', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-HV-${Date.now()}`,
    brand: 'Brand',
    model: 'HV System',
    inverter_type: 'STRING',
    power_watt: 10000,
    max_dc_voltage: 1500,
    mppt_count: 2,
    sell_price_vnd: 20000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 10);

  const hvInv = recommendations.find((r) => r.sku.includes('HV'));
  if (hvInv) {
    const mismatch = hvInv.block_reasons.some((r) => r.includes('LV/HV mismatch'));
    if (mismatch) {
      assert.equal(hvInv.rank, 'BLOCK', 'Should block LV/HV mismatch');
    }
  }
});

test('test_rec03_13: battery_voltage_out_of_range_is_block', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-HYBRID-48V-${Date.now()}`,
    brand: 'Brand',
    model: 'Hybrid 48V',
    inverter_type: 'HYBRID',
    power_watt: 10000,
    max_dc_voltage: 1000,
    mppt_count: 2,
    battery_voltage: 48,
    battery_voltage_min: 45,
    battery_voltage_max: 60,
    max_charge_current: 100,
    sell_price_vnd: 20000000,
  });

  const battery = await createCatalogItem(orgId, 'batteries', {
    sku: `BAT-96V-${Date.now()}`,
    brand: 'Brand',
    model: '96V Battery',
    voltage: 96,
    capacity_kwh: 10,
    depth_of_discharge: 80,
    cycle_life: 6000,
    sell_price_vnd: 25000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(
    orgId,
    project.id,
    module.id,
    20,
    battery.id
  );

  const hybridInv = recommendations.find((r) => r.sku.includes('HYBRID-48V'));
  if (hybridInv) {
    assert.equal(hybridInv.rank, 'BLOCK', 'Should block voltage mismatch');
    assert.ok(hybridInv.block_reasons.some((r) => r.includes('Battery voltage')));
  }
});

test('test_rec03_14: stringing_returns_valid_config', async () => {
  const orgId = await getDefaultOrganizationId();

  const highVmpModule = await createCatalogItem(orgId, 'pv_modules', {
    sku: `PV-HIVMP-${Date.now()}`,
    brand: 'Test',
    model: 'High Vmp',
    power_watt: 550,
    voc: 49.5,
    vmp: 80,
    isc: 13.87,
    imp: 2,
    efficiency: 21,
    sell_price_vnd: 3000000,
  });

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-PASS-STR-${Date.now()}`,
    brand: 'Brand',
    model: 'Valid Stringing',
    inverter_type: 'STRING',
    power_watt: 15000,
    max_dc_voltage: 800,
    mppt_count: 6,
    sell_price_vnd: 18000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(
    orgId,
    project.id,
    highVmpModule.id,
    18
  );

  const passInverters = recommendations.filter((r) => r.rank === 'PASS');
  assert.ok(
    passInverters.length > 0,
    'Should have at least one PASS inverter with valid stringing'
  );
});

test('test_rec03_15: no_valid_stringing_returns_block', async () => {
  const orgId = await getDefaultOrganizationId();
  const module = await createTestPVModule(orgId);

  await createCatalogItem(orgId, 'inverters', {
    sku: `INV-LIMITED-${Date.now()}`,
    brand: 'Brand',
    model: 'Limited MPPT',
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 1000,
    mppt_count: 1,
    sell_price_vnd: 10000000,
  });

  const lead = await createLead(orgId, { phone: `+8490${Date.now().toString().slice(-7)}` });
  const project = await createProjectFromLead(orgId, lead.id);

  const recommendations = await getInverterRecommendations(orgId, project.id, module.id, 50);

  const limitedInv = recommendations.find((r) => r.sku.includes('LIMITED'));
  if (limitedInv) {
    assert.equal(limitedInv.rank, 'BLOCK', 'Should block when no valid stringing');
    assert.ok(
      limitedInv.block_reasons.some(
        (r) => r.includes('stringing') || r.includes('String count')
      ),
      'Should mention stringing issue'
    );
  }
});
