REVOKE SELECT, INSERT, UPDATE, DELETE ON project_roofs FROM app_user;
DROP POLICY IF EXISTS project_roofs_insert_policy ON project_roofs;
DROP POLICY IF EXISTS project_roofs_isolation ON project_roofs;
ALTER TABLE project_roofs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS project_roofs;
