REVOKE SELECT, INSERT, UPDATE, DELETE ON handovers FROM app_user;
DROP POLICY IF EXISTS handovers_insert_policy ON handovers;
DROP POLICY IF EXISTS handovers_isolation ON handovers;
ALTER TABLE handovers DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS handovers;
