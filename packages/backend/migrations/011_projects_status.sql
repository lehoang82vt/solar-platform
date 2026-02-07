-- F-29: Project lifecycle status (NEW, QUOTED, CONTRACTED, INSTALLED, HANDOVER, COMPLETED, CANCELLED)
-- Idempotent: safe to run multiple times

ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'NEW';

UPDATE projects SET status = 'NEW' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(organization_id, status);

SELECT '011: projects.status added' AS status;
