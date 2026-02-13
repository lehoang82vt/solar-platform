-- 052: Seed real catalog data for Solar project
-- PV Modules, Inverters, Batteries, Accessories
-- Organization: 72535b54-e12e-423d-8e0b-6f9a74b18739 (production)

DO $$
DECLARE
  org_id UUID := '72535b54-e12e-423d-8e0b-6f9a74b18739';
BEGIN

-- ============================================================
-- PV MODULES (Tấm quang điện)
-- ============================================================

-- Clear old seed data
DELETE FROM catalog_pv_modules WHERE organization_id = org_id;

-- Trina Solar
INSERT INTO catalog_pv_modules (id, organization_id, sku, brand, model, power_watt, voc, vmp, isc, imp, efficiency, length_mm, width_mm, weight_kg, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'PV-TRINA-585', 'Trina Solar', 'TSM-DE21 585W', 585, 51.70, 43.40, 14.33, 13.48, 22.40, 2384, 1134, 32.5, 2400000, 3200000, true),
  (gen_random_uuid(), org_id, 'PV-TRINA-600', 'Trina Solar', 'TSM-NEG21C.20 600W', 600, 52.10, 43.80, 14.58, 13.70, 22.70, 2384, 1134, 33.0, 2500000, 3350000, true),
  (gen_random_uuid(), org_id, 'PV-TRINA-550', 'Trina Solar', 'TSM-DE19 550W', 550, 49.80, 41.70, 13.96, 13.19, 21.30, 2278, 1134, 28.8, 2200000, 2950000, true);

-- JA Solar
INSERT INTO catalog_pv_modules (id, organization_id, sku, brand, model, power_watt, voc, vmp, isc, imp, efficiency, length_mm, width_mm, weight_kg, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'PV-JA-580', 'JA Solar', 'JAM72S30-580/MR', 580, 51.40, 43.20, 14.28, 13.43, 22.30, 2278, 1134, 31.2, 2350000, 3150000, true),
  (gen_random_uuid(), org_id, 'PV-JA-545', 'JA Solar', 'JAM72S20-545/MR', 545, 49.50, 41.50, 13.92, 13.13, 21.10, 2278, 1134, 28.5, 2100000, 2800000, true),
  (gen_random_uuid(), org_id, 'PV-JA-610', 'JA Solar', 'JAM72D42-610/LB', 610, 52.80, 44.20, 14.65, 13.80, 22.90, 2384, 1134, 33.5, 2600000, 3500000, true);

-- Canadian Solar
INSERT INTO catalog_pv_modules (id, organization_id, sku, brand, model, power_watt, voc, vmp, isc, imp, efficiency, length_mm, width_mm, weight_kg, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'PV-CS-590', 'Canadian Solar', 'HiKu7 CS7N-590MS', 590, 51.90, 43.50, 14.40, 13.56, 22.50, 2384, 1134, 32.8, 2450000, 3250000, true),
  (gen_random_uuid(), org_id, 'PV-CS-555', 'Canadian Solar', 'HiKu6 CS6W-555MS', 555, 50.00, 41.90, 14.02, 13.25, 21.40, 2278, 1134, 29.0, 2250000, 3000000, true);

-- LONGi
INSERT INTO catalog_pv_modules (id, organization_id, sku, brand, model, power_watt, voc, vmp, isc, imp, efficiency, length_mm, width_mm, weight_kg, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'PV-LONGI-575', 'LONGi', 'LR5-72HBD 575M', 575, 51.20, 43.00, 14.20, 13.37, 22.10, 2278, 1134, 30.5, 2300000, 3100000, true),
  (gen_random_uuid(), org_id, 'PV-LONGI-545', 'LONGi', 'LR5-72HPH 545M', 545, 49.60, 41.60, 13.90, 13.10, 21.10, 2278, 1134, 28.3, 2100000, 2850000, true);


-- ============================================================
-- INVERTERS (Biến tần)
-- ============================================================

DELETE FROM catalog_inverters WHERE organization_id = org_id;

-- Sungrow Hybrid
INSERT INTO catalog_inverters (id, organization_id, sku, brand, model, inverter_type, power_watt, max_dc_voltage, mppt_count, battery_voltage, max_charge_current, battery_voltage_min, battery_voltage_max, parallelable, max_parallel_units, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'INV-SG-5KH', 'Sungrow', 'SH5.0RS', 'HYBRID', 5000, 600, 2, 48, 100, 40, 60, false, 1, 18000000, 24000000, true),
  (gen_random_uuid(), org_id, 'INV-SG-8KH', 'Sungrow', 'SH8.0RS', 'HYBRID', 8000, 600, 2, 48, 100, 40, 60, true, 2, 28000000, 37000000, true),
  (gen_random_uuid(), org_id, 'INV-SG-10KH', 'Sungrow', 'SH10RS', 'HYBRID', 10000, 600, 2, 48, 120, 40, 60, true, 2, 35000000, 46000000, true);

-- Sungrow On-grid
INSERT INTO catalog_inverters (id, organization_id, sku, brand, model, inverter_type, power_watt, max_dc_voltage, mppt_count, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'INV-SG-5KG', 'Sungrow', 'SG5.0RS-L', 'ON_GRID', 5000, 600, 2, 10000000, 13500000, true),
  (gen_random_uuid(), org_id, 'INV-SG-8KG', 'Sungrow', 'SG8.0RS-L', 'ON_GRID', 8000, 600, 2, 14000000, 18500000, true),
  (gen_random_uuid(), org_id, 'INV-SG-10KG', 'Sungrow', 'SG10RS-L', 'ON_GRID', 10000, 600, 2, 17000000, 22500000, true),
  (gen_random_uuid(), org_id, 'INV-SG-15KG', 'Sungrow', 'SG15RT', 'ON_GRID', 15000, 1100, 2, 22000000, 29000000, true);

-- Deye Hybrid
INSERT INTO catalog_inverters (id, organization_id, sku, brand, model, inverter_type, power_watt, max_dc_voltage, mppt_count, battery_voltage, max_charge_current, battery_voltage_min, battery_voltage_max, parallelable, max_parallel_units, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'INV-DEYE-5KH', 'Deye', 'SUN-5K-SG04LP1', 'HYBRID', 5000, 500, 2, 48, 120, 40, 60, true, 16, 15000000, 20000000, true),
  (gen_random_uuid(), org_id, 'INV-DEYE-8KH', 'Deye', 'SUN-8K-SG04LP1', 'HYBRID', 8000, 500, 2, 48, 190, 40, 60, true, 16, 22000000, 29000000, true),
  (gen_random_uuid(), org_id, 'INV-DEYE-12KH', 'Deye', 'SUN-12K-SG04LP3', 'HYBRID', 12000, 550, 2, 48, 190, 40, 60, true, 16, 30000000, 40000000, true);

-- Growatt Hybrid
INSERT INTO catalog_inverters (id, organization_id, sku, brand, model, inverter_type, power_watt, max_dc_voltage, mppt_count, battery_voltage, max_charge_current, battery_voltage_min, battery_voltage_max, parallelable, max_parallel_units, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'INV-GW-5KH', 'Growatt', 'SPH 5000TL3 BH-UP', 'HYBRID', 5000, 550, 2, 48, 100, 40, 60, false, 1, 16000000, 21000000, true),
  (gen_random_uuid(), org_id, 'INV-GW-10KH', 'Growatt', 'SPH 10000TL3 BH-UP', 'HYBRID', 10000, 550, 2, 48, 120, 40, 60, true, 2, 32000000, 42000000, true);


-- ============================================================
-- BATTERIES (Pin lưu trữ)
-- ============================================================

DELETE FROM catalog_batteries WHERE organization_id = org_id;

-- Pylontech
INSERT INTO catalog_batteries (id, organization_id, sku, brand, model, voltage, capacity_kwh, depth_of_discharge, cycle_life, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'BAT-PYL-US3000C', 'Pylontech', 'US3000C', 48, 3.55, 0.90, 6000, 18000000, 24000000, true),
  (gen_random_uuid(), org_id, 'BAT-PYL-US5000', 'Pylontech', 'US5000', 48, 4.80, 0.90, 6000, 25000000, 33000000, true),
  (gen_random_uuid(), org_id, 'BAT-PYL-FH48074', 'Pylontech', 'Force H1 FH48074', 48, 7.10, 0.90, 6000, 40000000, 52000000, true);

-- Deye
INSERT INTO catalog_batteries (id, organization_id, sku, brand, model, voltage, capacity_kwh, depth_of_discharge, cycle_life, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'BAT-DEYE-5K', 'Deye', 'SE-G5.1 Pro', 48, 5.12, 0.90, 6000, 22000000, 29000000, true),
  (gen_random_uuid(), org_id, 'BAT-DEYE-RW-C', 'Deye', 'RW-M6.1', 48, 6.14, 0.90, 6000, 30000000, 39000000, true);

-- Sungrow
INSERT INTO catalog_batteries (id, organization_id, sku, brand, model, voltage, capacity_kwh, depth_of_discharge, cycle_life, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'BAT-SG-SBR064', 'Sungrow', 'SBR064', 48, 6.40, 0.90, 6000, 35000000, 46000000, true),
  (gen_random_uuid(), org_id, 'BAT-SG-SBR096', 'Sungrow', 'SBR096', 48, 9.60, 0.90, 6000, 50000000, 65000000, true),
  (gen_random_uuid(), org_id, 'BAT-SG-SBR128', 'Sungrow', 'SBR128', 48, 12.80, 0.90, 6000, 65000000, 85000000, true);

-- BYD
INSERT INTO catalog_batteries (id, organization_id, sku, brand, model, voltage, capacity_kwh, depth_of_discharge, cycle_life, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'BAT-BYD-HVS-5', 'BYD', 'HVS 5.1', 48, 5.12, 0.96, 8000, 28000000, 37000000, true),
  (gen_random_uuid(), org_id, 'BAT-BYD-HVS-10', 'BYD', 'HVS 10.2', 48, 10.24, 0.96, 8000, 55000000, 72000000, true);


-- ============================================================
-- ACCESSORIES (Phụ kiện)
-- ============================================================

DELETE FROM catalog_accessories WHERE organization_id = org_id;

-- Khung giá đỡ
INSERT INTO catalog_accessories (id, organization_id, sku, name, category, unit, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'ACC-FRAME-ROOF', 'Khung giá đỡ mái tôn (bộ/tấm)', 'Khung giá đỡ', 'bộ', 250000, 350000, true),
  (gen_random_uuid(), org_id, 'ACC-FRAME-TILE', 'Khung giá đỡ mái ngói (bộ/tấm)', 'Khung giá đỡ', 'bộ', 300000, 420000, true),
  (gen_random_uuid(), org_id, 'ACC-FRAME-FLAT', 'Khung giá đỡ mái bằng (bộ/tấm)', 'Khung giá đỡ', 'bộ', 400000, 550000, true),
  (gen_random_uuid(), org_id, 'ACC-FRAME-GROUND', 'Khung giá đỡ mặt đất (bộ/tấm)', 'Khung giá đỡ', 'bộ', 500000, 680000, true);

-- Cáp điện
INSERT INTO catalog_accessories (id, organization_id, sku, name, category, unit, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'ACC-CBL-DC4', 'Cáp DC Solar 4mm² (mét)', 'Cáp điện', 'mét', 12000, 18000, true),
  (gen_random_uuid(), org_id, 'ACC-CBL-DC6', 'Cáp DC Solar 6mm² (mét)', 'Cáp điện', 'mét', 18000, 25000, true),
  (gen_random_uuid(), org_id, 'ACC-CBL-AC4', 'Cáp AC 3x4mm² CVV (mét)', 'Cáp điện', 'mét', 25000, 35000, true),
  (gen_random_uuid(), org_id, 'ACC-CBL-AC6', 'Cáp AC 3x6mm² CVV (mét)', 'Cáp điện', 'mét', 35000, 48000, true),
  (gen_random_uuid(), org_id, 'ACC-CBL-AC10', 'Cáp AC 3x10mm² CVV (mét)', 'Cáp điện', 'mét', 55000, 75000, true);

-- Thiết bị bảo vệ
INSERT INTO catalog_accessories (id, organization_id, sku, name, category, unit, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'ACC-CB-DC', 'CB DC 2P 32A 1000V', 'Bảo vệ điện', 'cái', 250000, 350000, true),
  (gen_random_uuid(), org_id, 'ACC-CB-AC', 'CB AC 3P 40A', 'Bảo vệ điện', 'cái', 180000, 250000, true),
  (gen_random_uuid(), org_id, 'ACC-SPD-DC', 'Chống sét DC 1000V', 'Bảo vệ điện', 'cái', 350000, 480000, true),
  (gen_random_uuid(), org_id, 'ACC-SPD-AC', 'Chống sét AC 3P', 'Bảo vệ điện', 'cái', 300000, 420000, true),
  (gen_random_uuid(), org_id, 'ACC-RCBO', 'RCBO 2P 40A 30mA', 'Bảo vệ điện', 'cái', 350000, 480000, true);

-- Jack MC4
INSERT INTO catalog_accessories (id, organization_id, sku, name, category, unit, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'ACC-MC4-PAIR', 'Jack MC4 (cặp đực-cái)', 'Kết nối', 'cặp', 15000, 25000, true),
  (gen_random_uuid(), org_id, 'ACC-MC4-Y2', 'Jack MC4 Y-branch 2 nhánh', 'Kết nối', 'cái', 30000, 45000, true),
  (gen_random_uuid(), org_id, 'ACC-MC4-Y3', 'Jack MC4 Y-branch 3 nhánh', 'Kết nối', 'cái', 45000, 65000, true);

-- Thiết bị đo lường & giám sát
INSERT INTO catalog_accessories (id, organization_id, sku, name, category, unit, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'ACC-METER-DTSU', 'Công tơ DTSU 3 pha Chint', 'Đo lường', 'cái', 600000, 850000, true),
  (gen_random_uuid(), org_id, 'ACC-WIFI-SG', 'WiFi Dongle Sungrow', 'Giám sát', 'cái', 400000, 550000, true),
  (gen_random_uuid(), org_id, 'ACC-WIFI-DEYE', 'WiFi Dongle Deye', 'Giám sát', 'cái', 350000, 480000, true);

-- Phụ kiện lắp đặt khác
INSERT INTO catalog_accessories (id, organization_id, sku, name, category, unit, cost_price_vnd, sell_price_vnd, ready)
VALUES
  (gen_random_uuid(), org_id, 'ACC-TRAY-100', 'Máng cáp 100x50mm (2m)', 'Lắp đặt', 'thanh', 80000, 120000, true),
  (gen_random_uuid(), org_id, 'ACC-CONDUIT-25', 'Ống luồn dây 25mm PVC (2m)', 'Lắp đặt', 'ống', 15000, 25000, true),
  (gen_random_uuid(), org_id, 'ACC-GROUND-CU', 'Dây tiếp địa đồng 10mm² (mét)', 'Lắp đặt', 'mét', 40000, 60000, true),
  (gen_random_uuid(), org_id, 'ACC-GROUND-ROD', 'Cọc tiếp địa 16mm x 2.4m', 'Lắp đặt', 'cọc', 120000, 180000, true);

RAISE NOTICE 'Catalog seed complete: PV=10, Inverters=12, Batteries=9, Accessories=22';

END $$;
