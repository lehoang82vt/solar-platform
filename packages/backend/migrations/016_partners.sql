-- PTN-01: Partners table for partner portal auth
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  referral_code varchar(50) NOT NULL,
  name varchar(255) NOT NULL,
  phone varchar(20) NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  commission_rate decimal(5,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email),
  UNIQUE(referral_code)
);

CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(email);
CREATE INDEX IF NOT EXISTS idx_partners_referral ON partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_org ON partners(organization_id);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_isolation ON partners;
DROP POLICY IF EXISTS partners_insert_policy ON partners;

CREATE POLICY partners_isolation ON partners
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY partners_insert_policy ON partners
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'PTN-01: partners table created' AS status;
