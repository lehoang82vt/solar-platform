-- Rollback PTN-01: drop partners
DROP POLICY IF EXISTS partners_isolation ON partners;
DROP POLICY IF EXISTS partners_insert_policy ON partners;

DROP TABLE IF EXISTS partners CASCADE;

SELECT '016 Rollback: partners dropped' AS status;
