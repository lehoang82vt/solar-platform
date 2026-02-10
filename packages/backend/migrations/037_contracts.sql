-- CON-01: Contracts table (replaces 008 schema)
DROP TABLE IF EXISTS contracts CASCADE;

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id),

  contract_number VARCHAR(50) UNIQUE NOT NULL,
  version INTEGER DEFAULT 1,

  status VARCHAR(30) DEFAULT 'DRAFT',

  deposit_percentage DECIMAL(5,2) DEFAULT 30.00,
  deposit_vnd BIGINT,
  final_payment_vnd BIGINT,
  total_vnd BIGINT NOT NULL,

  expected_start_date DATE,
  expected_completion_date DATE,
  actual_start_date DATE,
  actual_completion_date DATE,

  warranty_years INTEGER DEFAULT 10,
  warranty_start_date DATE,

  customer_signed_at TIMESTAMPTZ,
  customer_signature_url TEXT,

  company_signed_at TIMESTAMPTZ,
  company_signed_by UUID REFERENCES users(id),

  notes TEXT,
  cancellation_reason TEXT,
  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contracts_org ON contracts(organization_id);
CREATE INDEX idx_contracts_project ON contracts(project_id);
CREATE INDEX idx_contracts_quote ON contracts(quote_id);
CREATE INDEX idx_contracts_number ON contracts(contract_number);
CREATE INDEX idx_contracts_status ON contracts(status);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_isolation ON contracts
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY contracts_insert_policy ON contracts
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON contracts TO app_user;

SELECT '037: Contracts table created' AS status;
