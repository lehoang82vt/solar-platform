-- UX-01: Demo projects for quick quote
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_demo_expiry
  ON projects(demo_expires_at)
  WHERE is_demo = true AND demo_expires_at IS NOT NULL;

SELECT 'UX-01: demo projects columns added' AS status;
