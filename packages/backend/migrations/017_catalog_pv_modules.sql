-- CAT-01: Catalog PV modules table
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS catalog_pv_modules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  sku varchar(100) NOT NULL,
  brand varchar(100) NOT NULL,
  model varchar(100) NOT NULL,

  power_watt integer NOT NULL,
  voc decimal(6,2),
  vmp decimal(6,2),
  isc decimal(6,2),
  imp decimal(6,2),
  efficiency decimal(5,2),

  length_mm integer,
  width_mm integer,
  weight_kg decimal(6,2),

  cost_price_vnd integer,
  sell_price_vnd integer,

  ready boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_sku_per_org UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_pv_modules_org ON catalog_pv_modules(organization_id);
CREATE INDEX IF NOT EXISTS idx_pv_modules_ready ON catalog_pv_modules(ready) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pv_modules_brand ON catalog_pv_modules(brand);

ALTER TABLE catalog_pv_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_pv_modules_isolation ON catalog_pv_modules;
DROP POLICY IF EXISTS catalog_pv_modules_insert_policy ON catalog_pv_modules;

CREATE POLICY catalog_pv_modules_isolation ON catalog_pv_modules
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY catalog_pv_modules_insert_policy ON catalog_pv_modules
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'CAT-01: catalog_pv_modules created' AS status;
