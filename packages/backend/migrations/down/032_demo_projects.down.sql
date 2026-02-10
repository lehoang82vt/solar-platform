DROP INDEX IF EXISTS idx_projects_demo_expiry;

ALTER TABLE projects
  DROP COLUMN IF EXISTS demo_expires_at,
  DROP COLUMN IF EXISTS is_demo;
