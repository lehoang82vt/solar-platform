-- REC-06: Inverter MPPT specifications for per-inverter validation
-- Adds MPPT min/max voltage, start voltage, and max current columns
-- These replace hardcoded values in the inverter recommendation engine

ALTER TABLE catalog_inverters
  ADD COLUMN IF NOT EXISTS mppt_min_voltage integer,
  ADD COLUMN IF NOT EXISTS mppt_max_voltage integer,
  ADD COLUMN IF NOT EXISTS start_voltage integer,
  ADD COLUMN IF NOT EXISTS mppt_max_current numeric(5,2);

-- Set default values for existing records (backward compatibility)
-- These match the previous hardcoded values in recommendations-inverter.ts
UPDATE catalog_inverters
SET 
  mppt_min_voltage = COALESCE(mppt_min_voltage, 150),
  mppt_max_voltage = COALESCE(mppt_max_voltage, 850),
  start_voltage = COALESCE(start_voltage, 180),
  mppt_max_current = COALESCE(mppt_max_current, 30.00)
WHERE mppt_min_voltage IS NULL 
   OR mppt_max_voltage IS NULL 
   OR start_voltage IS NULL 
   OR mppt_max_current IS NULL;

SELECT 'REC-06: inverter MPPT specs columns added' AS status;
