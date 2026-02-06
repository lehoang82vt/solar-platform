-- F-03 Rollback: Drop foundation tables

DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

SELECT 'F-03 Rollback: foundation tables dropped' AS status;
