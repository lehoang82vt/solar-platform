-- CAT-01: Catalog inverters table
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS catalog_inverters (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  sku varchar(100) NOT NULL,
  brand varchar(100) NOT NULL,
  model varchar(100) NOT NULL,

  inverter_type varchar(20) NOT NULL,

  power_watt integer NOT NULL,
  max_dc_voltage integer,
  mppt_count integer,

  battery_voltage integer,
  max_charge_current integer,

  cost_price_vnd integer,
  sell_price_vnd integer,

  ready boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_inverter_sku_per_org UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_inverters_org ON catalog_inverters(organization_id);
CREATE INDEX IF NOT EXISTS idx_inverters_ready ON catalog_inverters(ready) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inverters_type ON catalog_inverters(inverter_type);

ALTER TABLE catalog_inverters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_inverters_isolation ON catalog_inverters;
DROP POLICY IF EXISTS catalog_inverters_insert_policy ON catalog_inverters;

CREATE POLICY catalog_inverters_isolation ON catalog_inverters
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY catalog_inverters_insert_policy ON catalog_inverters
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'CAT-01: catalog_inverters created' AS status;
