ALTER TABLE handovers DROP COLUMN IF EXISTS cancelled_at;

SELECT '040 Rollback: handover cancelled_at dropped' AS status;
