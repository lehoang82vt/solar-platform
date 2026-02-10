ALTER TABLE project_files DROP COLUMN IF EXISTS deleted_at;

SELECT '041 Rollback: project_files deleted_at dropped' AS status;
