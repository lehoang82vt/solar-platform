-- SRV-05: PVGIS result columns on project_roofs
ALTER TABLE project_roofs
  ADD COLUMN IF NOT EXISTS pvgis_monthly jsonb,
  ADD COLUMN IF NOT EXISTS pvgis_avg decimal(10,2),
  ADD COLUMN IF NOT EXISTS pvgis_min_month integer,
  ADD COLUMN IF NOT EXISTS pvgis_fetched_at timestamptz;

SELECT 'SRV-05: roof PVGIS columns added' AS status;
