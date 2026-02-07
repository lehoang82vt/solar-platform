-- Rollback 010: Drop handovers

ALTER TABLE handovers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS handovers_org_policy ON handovers;
DROP POLICY IF EXISTS handovers_insert_policy ON handovers;
DROP TABLE IF EXISTS handovers;

SELECT '010 Rollback: handovers dropped' AS status;
