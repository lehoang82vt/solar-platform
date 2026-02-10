-- CAT-01: Catalog accessories table
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS catalog_accessories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  sku varchar(100) NOT NULL,
  name varchar(200) NOT NULL,
  category varchar(50),

  cost_price_vnd integer,
  sell_price_vnd integer,
  unit varchar(20) NOT NULL DEFAULT 'piece',

  ready boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_accessory_sku_per_org UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_accessories_org ON catalog_accessories(organization_id);
CREATE INDEX IF NOT EXISTS idx_accessories_ready ON catalog_accessories(ready) WHERE deleted_at IS NULL;

ALTER TABLE catalog_accessories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_accessories_isolation ON catalog_accessories;
DROP POLICY IF EXISTS catalog_accessories_insert_policy ON catalog_accessories;

CREATE POLICY catalog_accessories_isolation ON catalog_accessories
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY catalog_accessories_insert_policy ON catalog_accessories
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'CAT-01: catalog_accessories created' AS status;
