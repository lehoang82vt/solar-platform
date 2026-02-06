-- F-06b Rollback: Drop quotes table

DROP TABLE IF EXISTS quotes CASCADE;

SELECT 'F-06b Rollback: quotes table dropped' AS status;
