-- Project files (documents, photos, etc.)
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  file_type VARCHAR(30) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),

  related_to VARCHAR(30),
  related_id UUID,

  description TEXT,
  uploaded_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_files_org ON project_files(organization_id);
CREATE INDEX idx_project_files_project ON project_files(project_id);
CREATE INDEX idx_project_files_type ON project_files(file_type);
CREATE INDEX idx_project_files_related ON project_files(related_to, related_id);

ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_files_isolation ON project_files
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY project_files_insert_policy ON project_files
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON project_files TO app_user;

SELECT '039: Project files table created' AS status;
