REVOKE SELECT, INSERT, UPDATE, DELETE ON system_configs FROM app_user;
DROP POLICY IF EXISTS system_configs_insert_policy ON system_configs;
DROP POLICY IF EXISTS system_configs_isolation ON system_configs;
ALTER TABLE system_configs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS system_configs;
