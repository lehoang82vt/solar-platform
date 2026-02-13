-- Electricity tariff management (biểu giá điện)
-- Supports both TIERED (bậc thang EVN) and FLAT (điện 1 giá) pricing

CREATE TABLE electricity_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(100) NOT NULL,
  tariff_type varchar(20) NOT NULL CHECK (tariff_type IN ('TIERED', 'FLAT')),
  effective_from date NOT NULL,
  effective_to date,
  is_default boolean DEFAULT false,
  flat_rate_vnd integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE electricity_tariff_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id uuid NOT NULL REFERENCES electricity_tariffs(id) ON DELETE CASCADE,
  tier_number integer NOT NULL,
  from_kwh integer NOT NULL,
  to_kwh integer,
  price_vnd integer NOT NULL,
  UNIQUE(tariff_id, tier_number)
);

CREATE INDEX idx_tariffs_org ON electricity_tariffs(organization_id);
CREATE INDEX idx_tariffs_default ON electricity_tariffs(organization_id, is_default) WHERE is_default = true;
CREATE INDEX idx_tariff_tiers ON electricity_tariff_tiers(tariff_id);

-- RLS
ALTER TABLE electricity_tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tariffs_isolation ON electricity_tariffs
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY tariffs_insert ON electricity_tariffs
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
