DROP POLICY IF EXISTS catalog_batteries_isolation ON catalog_batteries;
DROP POLICY IF EXISTS catalog_batteries_insert_policy ON catalog_batteries;
DROP TABLE IF EXISTS catalog_batteries CASCADE;
SELECT '019 Rollback: catalog_batteries dropped' AS status;
