-- Quote line items
CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,

  -- Item info
  item_type VARCHAR(30) NOT NULL, -- PV_MODULE, INVERTER, BATTERY, ACCESSORY, LABOR, etc.
  catalog_item_id UUID, -- Reference to catalog (nullable for custom items)

  -- Description
  description TEXT NOT NULL,
  sku VARCHAR(100),

  -- Quantity and pricing
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(20),
  unit_price_vnd BIGINT NOT NULL,
  total_price_vnd BIGINT NOT NULL,

  -- Order
  line_order INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_line_items_org ON quote_line_items(organization_id);
CREATE INDEX idx_quote_line_items_quote ON quote_line_items(quote_id);

-- RLS
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_line_items_isolation ON quote_line_items
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY quote_line_items_insert_policy ON quote_line_items
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON quote_line_items TO app_user;

SELECT '035: Quote line items table created' AS status;
