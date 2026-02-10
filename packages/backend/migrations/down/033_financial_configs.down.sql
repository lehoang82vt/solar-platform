REVOKE SELECT, INSERT, UPDATE, DELETE ON financial_configs FROM app_user;
DROP POLICY IF EXISTS financial_configs_insert_policy ON financial_configs;
DROP POLICY IF EXISTS financial_configs_isolation ON financial_configs;
ALTER TABLE financial_configs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS financial_configs;
