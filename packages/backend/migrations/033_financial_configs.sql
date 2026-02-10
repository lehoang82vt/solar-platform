-- FIN-01: Financial configuration per organization
CREATE TABLE IF NOT EXISTS financial_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  target_gross_margin decimal(5,2) DEFAULT 30.00,
  warning_gross_margin decimal(5,2) DEFAULT 25.00,
  block_gross_margin decimal(5,2) DEFAULT 20.00,

  target_net_margin decimal(5,2) DEFAULT 15.00,
  warning_net_margin decimal(5,2) DEFAULT 10.00,
  block_net_margin decimal(5,2) DEFAULT 5.00,

  marketing_cost_pct decimal(5,2) DEFAULT 3.00,
  warranty_cost_pct decimal(5,2) DEFAULT 2.00,
  overhead_cost_pct decimal(5,2) DEFAULT 5.00,

  labor_cost_type varchar(20) DEFAULT 'PER_KWP',
  labor_cost_fixed_vnd bigint,
  labor_cost_per_kwp_vnd bigint DEFAULT 2000000,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT financial_configs_org_unique UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_configs_org ON financial_configs(organization_id);

ALTER TABLE financial_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_configs_isolation ON financial_configs;
DROP POLICY IF EXISTS financial_configs_insert_policy ON financial_configs;

CREATE POLICY financial_configs_isolation ON financial_configs
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY financial_configs_insert_policy ON financial_configs
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON financial_configs TO app_user;

INSERT INTO financial_configs (organization_id)
SELECT id FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM financial_configs fc WHERE fc.organization_id = organizations.id
)
ON CONFLICT (organization_id) DO NOTHING;

SELECT 'FIN-01: financial_configs created' AS status;
