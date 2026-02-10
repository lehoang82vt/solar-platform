-- SRV-02: Projects table (lead-based, state machine)
-- Replaces legacy projects schema with lead_id, assigned_to, status, expiry
-- Idempotent: drop and recreate

-- Allow phoneless leads for expiry logic
ALTER TABLE leads ALTER COLUMN phone DROP NOT NULL;

DROP TABLE IF EXISTS projects CASCADE;

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  lead_id uuid REFERENCES leads(id),
  assigned_to uuid REFERENCES users(id),

  customer_name varchar(255),
  customer_phone varchar(20),
  customer_email varchar(255),
  customer_address text,

  status varchar(50) NOT NULL DEFAULT 'SURVEY_PENDING',
  expires_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_lead ON projects(lead_id);
CREATE INDEX idx_projects_assigned ON projects(assigned_to);
CREATE INDEX idx_projects_status ON projects(status);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_isolation ON projects;
DROP POLICY IF EXISTS projects_insert_policy ON projects;

CREATE POLICY projects_isolation ON projects
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY projects_insert_policy ON projects
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE ON projects TO app_user;

SELECT 'SRV-02: projects table created' AS status;
