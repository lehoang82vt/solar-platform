DROP POLICY IF EXISTS catalog_accessories_isolation ON catalog_accessories;
DROP POLICY IF EXISTS catalog_accessories_insert_policy ON catalog_accessories;
DROP TABLE IF EXISTS catalog_accessories CASCADE;
SELECT '020 Rollback: catalog_accessories dropped' AS status;
