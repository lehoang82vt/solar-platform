-- Rollback 011: drop projects.status

DROP INDEX IF EXISTS idx_projects_org_status;
ALTER TABLE projects DROP COLUMN IF EXISTS status;

SELECT '011 Rollback: projects.status dropped' AS status;
