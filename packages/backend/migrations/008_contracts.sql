-- Contract lifecycle: contracts table + per-org yearly sequence for contract_number
-- contract_number format: HD-{YYYY}-{sequence_3_digits}, reset each year per org
-- Idempotent: safe to run multiple times

-- Sequence table for contract numbers (organization_id, year, last_seq)
CREATE TABLE IF NOT EXISTS contract_number_sequences (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, year)
);

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  contract_number text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  contract_value numeric NOT NULL,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  system_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  financial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  warranty_terms text,
  construction_days int,
  signed_at timestamptz,
  signed_by text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_number)
);

CREATE INDEX IF NOT EXISTS idx_contracts_org_created ON contracts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_quote_id ON contracts(quote_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- RLS for contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_org_policy ON contracts;
DROP POLICY IF EXISTS contracts_insert_policy ON contracts;
CREATE POLICY contracts_org_policy ON contracts
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY contracts_insert_policy ON contracts
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- RLS for contract_number_sequences (org-scoped)
ALTER TABLE contract_number_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_number_sequences_org_policy ON contract_number_sequences;
CREATE POLICY contract_number_sequences_org_policy ON contract_number_sequences
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT '008: Contracts table and contract_number_sequences created' AS status;
