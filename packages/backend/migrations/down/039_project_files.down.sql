REVOKE SELECT, INSERT, UPDATE, DELETE ON project_files FROM app_user;
DROP POLICY IF EXISTS project_files_insert_policy ON project_files;
DROP POLICY IF EXISTS project_files_isolation ON project_files;
ALTER TABLE project_files DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS project_files;
