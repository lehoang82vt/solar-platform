-- SRV-03: Electricity usage columns on projects
-- monthly_kwh, day_usage_pct (client); night_kwh, storage_target_kwh (server-calculated)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS monthly_kwh integer,
  ADD COLUMN IF NOT EXISTS day_usage_pct decimal(5,2),
  ADD COLUMN IF NOT EXISTS night_kwh decimal(10,2),
  ADD COLUMN IF NOT EXISTS storage_target_kwh decimal(10,2);

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS check_monthly_kwh_positive,
  DROP CONSTRAINT IF EXISTS check_day_usage_pct_range;

ALTER TABLE projects
  ADD CONSTRAINT check_monthly_kwh_positive
    CHECK (monthly_kwh IS NULL OR monthly_kwh > 0),
  ADD CONSTRAINT check_day_usage_pct_range
    CHECK (day_usage_pct IS NULL OR (day_usage_pct >= 0 AND day_usage_pct <= 100));

SELECT 'SRV-03: project usage columns added' AS status;
