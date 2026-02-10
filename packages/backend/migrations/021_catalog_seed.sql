-- CAT-01: Catalog seed data (idempotent)
INSERT INTO catalog_pv_modules (organization_id, sku, brand, model, power_watt, voc, vmp, isc, imp, efficiency, cost_price_vnd, sell_price_vnd, ready)
SELECT
  id,
  'PV-SAMPLE-550W',
  'Sample Brand',
  'SB-550-M10',
  550,
  49.8,
  41.2,
  13.8,
  13.35,
  21.5,
  2500000,
  3000000,
  true
FROM organizations
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (organization_id, sku) DO NOTHING;

INSERT INTO catalog_inverters (organization_id, sku, brand, model, inverter_type, power_watt, max_dc_voltage, mppt_count, cost_price_vnd, sell_price_vnd, ready)
SELECT
  id,
  'INV-SAMPLE-5K',
  'Sample Inverter',
  'SI-5000',
  'STRING',
  5000,
  550,
  2,
  8000000,
  10000000,
  true
FROM organizations
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (organization_id, sku) DO NOTHING;

INSERT INTO catalog_batteries (organization_id, sku, brand, model, voltage, capacity_kwh, depth_of_discharge, cycle_life, cost_price_vnd, sell_price_vnd, ready)
SELECT
  id,
  'BAT-SAMPLE-5KWH',
  'Sample Battery',
  'SB-5.0',
  48,
  5.0,
  90.0,
  6000,
  15000000,
  18000000,
  true
FROM organizations
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (organization_id, sku) DO NOTHING;

SELECT 'CAT-01: catalog seed applied' AS status;
