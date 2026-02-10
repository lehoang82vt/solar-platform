-- REC-03 Part 2: Inverter battery voltage range for compatibility check
ALTER TABLE catalog_inverters
  ADD COLUMN IF NOT EXISTS battery_voltage_min integer,
  ADD COLUMN IF NOT EXISTS battery_voltage_max integer;

SELECT 'REC-03: inverter battery voltage range columns added' AS status;
