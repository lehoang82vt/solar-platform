-- REC-04: System configuration per project
CREATE TABLE IF NOT EXISTS system_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  pv_module_id uuid REFERENCES catalog_pv_modules(id),
  panel_count integer,

  inverter_id uuid REFERENCES catalog_inverters(id),
  inverter_count integer DEFAULT 1,

  battery_id uuid REFERENCES catalog_batteries(id),
  battery_count integer,

  combo_box_id uuid REFERENCES catalog_accessories(id),

  accessories jsonb DEFAULT '[]'::jsonb,

  validation_status varchar(20),
  validation_reasons jsonb DEFAULT '[]'::jsonb,

  panels_per_string integer,
  string_count integer,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT system_configs_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_system_configs_org ON system_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_configs_project ON system_configs(project_id);

ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_configs_isolation ON system_configs;
DROP POLICY IF EXISTS system_configs_insert_policy ON system_configs;

CREATE POLICY system_configs_isolation ON system_configs
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY system_configs_insert_policy ON system_configs
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON system_configs TO app_user;

SELECT 'REC-04: system_configs created' AS status;
