DROP POLICY IF EXISTS catalog_pv_modules_isolation ON catalog_pv_modules;
DROP POLICY IF EXISTS catalog_pv_modules_insert_policy ON catalog_pv_modules;
DROP TABLE IF EXISTS catalog_pv_modules CASCADE;
SELECT '017 Rollback: catalog_pv_modules dropped' AS status;
