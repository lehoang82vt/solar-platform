-- 054: Add latitude/longitude to projects for map pinning
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);

CREATE INDEX IF NOT EXISTS idx_projects_coords
  ON projects(latitude, longitude)
  WHERE latitude IS NOT NULL;
