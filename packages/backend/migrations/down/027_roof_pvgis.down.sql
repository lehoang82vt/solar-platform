ALTER TABLE project_roofs
  DROP COLUMN IF EXISTS pvgis_fetched_at,
  DROP COLUMN IF EXISTS pvgis_min_month,
  DROP COLUMN IF EXISTS pvgis_avg,
  DROP COLUMN IF EXISTS pvgis_monthly;
