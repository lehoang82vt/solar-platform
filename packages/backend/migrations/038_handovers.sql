-- Handovers (bàn giao) – replaces 010 schema
DROP TABLE IF EXISTS handovers CASCADE;

CREATE TABLE handovers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,

  handover_type VARCHAR(30) NOT NULL,

  handover_date DATE NOT NULL,
  performed_by UUID REFERENCES users(id),
  accepted_by VARCHAR(255),

  checklist JSONB,

  photos TEXT[],

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handovers_org ON handovers(organization_id);
CREATE INDEX idx_handovers_contract ON handovers(contract_id);
CREATE INDEX idx_handovers_type ON handovers(handover_type);

ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY handovers_isolation ON handovers
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY handovers_insert_policy ON handovers
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON handovers TO app_user;

SELECT '038: Handovers table created' AS status;
