-- BKP-01: Backup job tracking (path, type, retention)
CREATE TABLE IF NOT EXISTS backup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  backup_type VARCHAR(20) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  size_bytes BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backup_jobs_org ON backup_jobs(organization_id);
CREATE INDEX idx_backup_jobs_created ON backup_jobs(created_at);
CREATE INDEX idx_backup_jobs_type ON backup_jobs(backup_type);

ALTER TABLE backup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY backup_jobs_isolation ON backup_jobs
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY backup_jobs_insert ON backup_jobs
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON backup_jobs TO app_user;
