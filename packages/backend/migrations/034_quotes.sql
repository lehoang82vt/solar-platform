-- QUO-01: Quotes table (state machine, project-linked)
-- Replaces legacy quotes (004) with organization_id, project_id, quote_number, line items support

DROP TABLE IF EXISTS quotes CASCADE;

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Quote metadata
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  version INTEGER DEFAULT 1,

  -- State machine
  status VARCHAR(30) DEFAULT 'DRAFT',

  -- Customer info (snapshot)
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  customer_address TEXT,

  -- System info (snapshot)
  system_size_kwp DECIMAL(10,2),
  panel_count INTEGER,

  -- Pricing
  subtotal_vnd BIGINT,
  discount_vnd BIGINT DEFAULT 0,
  tax_vnd BIGINT DEFAULT 0,
  total_vnd BIGINT,

  -- Financial snapshot (JSONB)
  financial_snapshot JSONB,

  -- Validity
  valid_until DATE,

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_org ON quotes(organization_id);
CREATE INDEX idx_quotes_project ON quotes(project_id);
CREATE INDEX idx_quotes_number ON quotes(quote_number);
CREATE INDEX idx_quotes_status ON quotes(status);

-- RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_isolation ON quotes
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY quotes_insert_policy ON quotes
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON quotes TO app_user;

SELECT '034: Quotes table created' AS status;
