-- Rollback PUB-04: drop leads
DROP POLICY IF EXISTS leads_isolation ON leads;
DROP POLICY IF EXISTS leads_insert_policy ON leads;

DROP TABLE IF EXISTS leads CASCADE;

SELECT '015 Rollback: leads dropped' AS status;
