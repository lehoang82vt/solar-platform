ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS check_day_usage_pct_range,
  DROP CONSTRAINT IF EXISTS check_monthly_kwh_positive,
  DROP COLUMN IF EXISTS storage_target_kwh,
  DROP COLUMN IF EXISTS night_kwh,
  DROP COLUMN IF EXISTS day_usage_pct,
  DROP COLUMN IF EXISTS monthly_kwh;
