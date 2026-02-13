-- 053: Seed EVN electricity tariffs (2024)
-- Biểu giá điện bậc thang + điện 1 giá
-- Organization: 72535b54-e12e-423d-8e0b-6f9a74b18739 (production)

DO $$
DECLARE
  org_id UUID := '72535b54-e12e-423d-8e0b-6f9a74b18739';
  tariff_tiered_id UUID;
  tariff_flat_id UUID;
BEGIN

-- ============================================================
-- Biểu giá điện bậc thang EVN 2024 (Quyết định 1062/QĐ-BCT)
-- ============================================================

tariff_tiered_id := gen_random_uuid();

INSERT INTO electricity_tariffs (id, organization_id, name, tariff_type, effective_from, is_default, flat_rate_vnd)
VALUES (tariff_tiered_id, org_id, 'Biểu giá EVN bậc thang 2024', 'TIERED', '2024-11-09', true, NULL);

INSERT INTO electricity_tariff_tiers (id, tariff_id, tier_number, from_kwh, to_kwh, price_vnd)
VALUES
  (gen_random_uuid(), tariff_tiered_id, 1, 0, 50, 1893),
  (gen_random_uuid(), tariff_tiered_id, 2, 51, 100, 1956),
  (gen_random_uuid(), tariff_tiered_id, 3, 101, 200, 2271),
  (gen_random_uuid(), tariff_tiered_id, 4, 201, 300, 2860),
  (gen_random_uuid(), tariff_tiered_id, 5, 301, 400, 3197),
  (gen_random_uuid(), tariff_tiered_id, 6, 401, NULL, 3302);

-- ============================================================
-- Biểu giá điện 1 giá (Flat rate)
-- Theo TT16/2014: Giá bán lẻ bình quân x 1.0
-- ============================================================

tariff_flat_id := gen_random_uuid();

INSERT INTO electricity_tariffs (id, organization_id, name, tariff_type, effective_from, is_default, flat_rate_vnd)
VALUES (tariff_flat_id, org_id, 'Điện 1 giá 2024', 'FLAT', '2024-11-09', false, 2768);

-- Flat rate không cần tiers
-- Giá = 145% giá bán lẻ bình quân (1928.1đ x 1.4353 ≈ 2768đ)

RAISE NOTICE 'EVN tariffs seeded: 1 tiered (6 tiers) + 1 flat rate';

END $$;
