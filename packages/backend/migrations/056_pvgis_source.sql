-- Add source tracking and min_value to project_roofs PVGIS data
ALTER TABLE project_roofs ADD COLUMN IF NOT EXISTS pvgis_source VARCHAR(20);
ALTER TABLE project_roofs ADD COLUMN IF NOT EXISTS pvgis_min_value DECIMAL;
