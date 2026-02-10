-- JOB-03: Partner commissions (released after handover >7 days)
CREATE TABLE IF NOT EXISTS partner_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  amount_vnd BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id)
);

CREATE INDEX idx_partner_commissions_org ON partner_commissions(organization_id);
CREATE INDEX idx_partner_commissions_partner ON partner_commissions(partner_id);
CREATE INDEX idx_partner_commissions_contract ON partner_commissions(contract_id);

ALTER TABLE partner_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_commissions_isolation ON partner_commissions
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY partner_commissions_insert_policy ON partner_commissions
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE ON partner_commissions TO app_user;
