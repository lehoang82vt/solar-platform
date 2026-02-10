-- JOB-02: Projects columns for phone-gate (project_number, cancelled_at, partner_id)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_number VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

CREATE INDEX IF NOT EXISTS idx_projects_partner ON projects(partner_id);
