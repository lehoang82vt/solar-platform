-- F-05 Rollback: Drop audit_logs and organizations

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

SELECT 'F-05 Rollback: audit_logs and organizations dropped' AS status;
