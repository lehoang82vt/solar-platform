-- Rollback F-36: remove projects.customer_id
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;

DROP INDEX IF EXISTS idx_projects_customer_id;

ALTER TABLE projects
  DROP COLUMN IF EXISTS customer_id;

SELECT '013 Rollback: projects.customer_id removed' AS status;
