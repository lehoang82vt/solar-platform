-- CAT-01: Catalog batteries table
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS catalog_batteries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  sku varchar(100) NOT NULL,
  brand varchar(100) NOT NULL,
  model varchar(100) NOT NULL,

  voltage integer NOT NULL,
  capacity_kwh decimal(6,2) NOT NULL,
  depth_of_discharge decimal(5,2),
  cycle_life integer,

  cost_price_vnd integer,
  sell_price_vnd integer,

  ready boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_battery_sku_per_org UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_batteries_org ON catalog_batteries(organization_id);
CREATE INDEX IF NOT EXISTS idx_batteries_ready ON catalog_batteries(ready) WHERE deleted_at IS NULL;

ALTER TABLE catalog_batteries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_batteries_isolation ON catalog_batteries;
DROP POLICY IF EXISTS catalog_batteries_insert_policy ON catalog_batteries;

CREATE POLICY catalog_batteries_isolation ON catalog_batteries
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY catalog_batteries_insert_policy ON catalog_batteries
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'CAT-01: catalog_batteries created' AS status;
