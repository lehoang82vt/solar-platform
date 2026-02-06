-- F-06a Rollback: Drop customers table

DROP TABLE IF EXISTS customers CASCADE;

SELECT 'F-06a Rollback: customers table dropped' AS status;
