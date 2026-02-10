import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPVModuleReady,
  checkInverterReady,
  checkBatteryReady,
  type PVModule,
  type Inverter,
  type Battery,
} from '../utils/ready-gate';

test('test_cat02_1: pv_with_all_fields_ready_true', () => {
  const pv: PVModule = {
    power_watt: 550,
    voc: 49.8,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    efficiency: 21.5,
    cost_price_vnd: 2500000,
    sell_price_vnd: 3000000,
  };

  assert.equal(checkPVModuleReady(pv), true);
});

test('test_cat02_2: pv_missing_voc_ready_false', () => {
  const pv: PVModule = {
    power_watt: 550,
    voc: null,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    sell_price_vnd: 3000000,
  };

  assert.equal(checkPVModuleReady(pv), false);
});

test('test_cat02_3: pv_missing_sell_price_ready_false', () => {
  const pv: PVModule = {
    power_watt: 550,
    voc: 49.8,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    sell_price_vnd: null,
  };

  assert.equal(checkPVModuleReady(pv), false);
});

test('test_cat02_4: inverter_hybrid_missing_battery_voltage_ready_false', () => {
  const inverter: Inverter = {
    inverter_type: 'HYBRID',
    power_watt: 5000,
    max_dc_voltage: 550,
    mppt_count: 2,
    battery_voltage: null,
    max_charge_current: 100,
    sell_price_vnd: 10000000,
  };

  assert.equal(checkInverterReady(inverter), false);
});

test('test_cat02_5: inverter_string_without_battery_fields_ready_true', () => {
  const inverter: Inverter = {
    inverter_type: 'STRING',
    power_watt: 5000,
    max_dc_voltage: 550,
    mppt_count: 2,
    battery_voltage: null,
    max_charge_current: null,
    sell_price_vnd: 10000000,
  };

  assert.equal(checkInverterReady(inverter), true);
});

test('test_cat02_6: battery_missing_capacity_ready_false', () => {
  const battery: Battery = {
    voltage: 48,
    capacity_kwh: null,
    depth_of_discharge: 90,
    cycle_life: 6000,
    sell_price_vnd: 18000000,
  };

  assert.equal(checkBatteryReady(battery), false);
});

test('test_cat02_7: update_fill_missing_field_ready_becomes_true', () => {
  const pv: PVModule = {
    power_watt: 550,
    voc: 49.8,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    sell_price_vnd: null,
  };

  assert.equal(checkPVModuleReady(pv), false);

  pv.sell_price_vnd = 3000000;

  assert.equal(checkPVModuleReady(pv), true);
});

test('test_cat02_8: cannot_manually_set_ready_true_if_fields_missing', () => {
  const pv: PVModule = {
    power_watt: 550,
    voc: null,
    vmp: 41.2,
    isc: 13.8,
    imp: 13.35,
    sell_price_vnd: 3000000,
  };

  const isReady = checkPVModuleReady(pv);
  assert.equal(isReady, false, 'Ready gate must enforce field requirements');
});
