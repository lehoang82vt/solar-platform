-- SRV-04: Project roofs table (multi-roof survey)
CREATE TABLE IF NOT EXISTS project_roofs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  roof_index integer NOT NULL DEFAULT 1,

  azimuth integer NOT NULL,
  tilt integer NOT NULL,
  area decimal(10,2) NOT NULL,
  usable_pct decimal(5,2) NOT NULL DEFAULT 100.0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_roof_index_per_project UNIQUE (project_id, roof_index),
  CONSTRAINT check_azimuth_range CHECK (azimuth >= 0 AND azimuth <= 360),
  CONSTRAINT check_tilt_range CHECK (tilt >= 0 AND tilt <= 90),
  CONSTRAINT check_area_positive CHECK (area > 0),
  CONSTRAINT check_usable_pct_range CHECK (usable_pct > 0 AND usable_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_project_roofs_org ON project_roofs(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_roofs_project ON project_roofs(project_id);

ALTER TABLE project_roofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_roofs_isolation ON project_roofs;
DROP POLICY IF EXISTS project_roofs_insert_policy ON project_roofs;

CREATE POLICY project_roofs_isolation ON project_roofs
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY project_roofs_insert_policy ON project_roofs
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON project_roofs TO app_user;

SELECT 'SRV-04: project_roofs table created' AS status;
