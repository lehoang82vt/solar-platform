ALTER TABLE catalog_inverters
  DROP COLUMN IF EXISTS battery_voltage_max,
  DROP COLUMN IF EXISTS battery_voltage_min;
