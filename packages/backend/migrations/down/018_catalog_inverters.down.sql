DROP POLICY IF EXISTS catalog_inverters_isolation ON catalog_inverters;
DROP POLICY IF EXISTS catalog_inverters_insert_policy ON catalog_inverters;
DROP TABLE IF EXISTS catalog_inverters CASCADE;
SELECT '018 Rollback: catalog_inverters dropped' AS status;
