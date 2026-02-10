-- CON-06: Soft delete for project files
ALTER TABLE project_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

SELECT '041: project_files deleted_at added' AS status;
