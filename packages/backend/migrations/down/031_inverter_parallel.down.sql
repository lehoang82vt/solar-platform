ALTER TABLE catalog_inverters
  DROP COLUMN IF EXISTS max_parallel_units,
  DROP COLUMN IF EXISTS parallelable;
