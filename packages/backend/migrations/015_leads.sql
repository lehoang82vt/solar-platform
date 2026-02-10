-- PUB-04: Leads table with first-touch partner attribution
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone varchar(20) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'RECEIVED',
  partner_code varchar(50) NULL,
  first_touch_partner varchar(50) NULL,
  utm_source varchar(100) NULL,
  utm_medium varchar(100) NULL,
  utm_campaign varchar(100) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_org_phone ON leads(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_partner ON leads(partner_code);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_isolation ON leads;
DROP POLICY IF EXISTS leads_insert_policy ON leads;

CREATE POLICY leads_isolation ON leads
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY leads_insert_policy ON leads
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'PUB-04: leads table created' AS status;
