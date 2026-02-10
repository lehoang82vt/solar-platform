DROP INDEX IF EXISTS idx_projects_partner ON projects;
ALTER TABLE projects DROP COLUMN IF EXISTS partner_id;
ALTER TABLE projects DROP COLUMN IF EXISTS cancelled_at;
ALTER TABLE projects DROP COLUMN IF EXISTS project_number;
