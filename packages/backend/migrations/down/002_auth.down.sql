-- F-04 Rollback: Remove auth columns from users

ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;

SELECT 'F-04 Rollback: auth columns removed from users' AS status;
