REVOKE SELECT, INSERT, UPDATE, DELETE ON contracts FROM app_user;
DROP POLICY IF EXISTS contracts_insert_policy ON contracts;
DROP POLICY IF EXISTS contracts_isolation ON contracts;
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS contracts;
