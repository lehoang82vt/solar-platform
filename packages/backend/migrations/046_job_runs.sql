-- Job runs tracking table (JOB-01 Job Runner)
-- One RUNNING job per (organization_id, job_name) enforced by partial unique index

CREATE TABLE job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  job_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(50) NOT NULL,

  status VARCHAR(20) DEFAULT 'RUNNING',

  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  duration_ms INTEGER,
  error_message TEXT,

  metadata JSONB
);

CREATE UNIQUE INDEX unique_running_job ON job_runs (organization_id, job_name)
  WHERE status = 'RUNNING';

CREATE INDEX idx_job_runs_org ON job_runs(organization_id);
CREATE INDEX idx_job_runs_status ON job_runs(status);
CREATE INDEX idx_job_runs_started ON job_runs(started_at);

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_runs_isolation ON job_runs
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY job_runs_insert_policy ON job_runs
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE ON job_runs TO app_user;
