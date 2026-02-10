-- REC-05: Inverter parallel support
ALTER TABLE catalog_inverters
  ADD COLUMN IF NOT EXISTS parallelable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_parallel_units integer DEFAULT 1;

UPDATE catalog_inverters
SET parallelable = COALESCE(parallelable, false),
    max_parallel_units = COALESCE(max_parallel_units, 1)
WHERE parallelable IS NULL OR max_parallel_units IS NULL;

SELECT 'REC-05: inverter parallel columns added' AS status;
