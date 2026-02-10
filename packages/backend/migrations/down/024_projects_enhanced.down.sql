REVOKE SELECT, INSERT, UPDATE ON projects FROM app_user;
DROP POLICY IF EXISTS projects_insert_policy ON projects;
DROP POLICY IF EXISTS projects_isolation ON projects;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS projects;

-- Restore leads.phone NOT NULL if desired (optional - may break phoneless leads)
-- ALTER TABLE leads ALTER COLUMN phone SET NOT NULL;
