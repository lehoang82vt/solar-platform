-- 055: Add power phase to projects and inverters
ALTER TABLE projects ADD COLUMN IF NOT EXISTS power_phase INTEGER DEFAULT 1 CHECK (power_phase IN (1, 3));
ALTER TABLE catalog_inverters ADD COLUMN IF NOT EXISTS phase INTEGER DEFAULT 1 CHECK (phase IN (1, 3));

-- Seed phase for existing inverters based on power rating
-- Sungrow: 5K/8K = 1 pha, 10K+/15K = 3 pha
-- Deye: 5K = 1 pha, 8K/12K = 3 pha (LP3 = 3 pha)
-- Growatt: 5K = 1 pha, 10K = 3 pha (TL3 = 3 pha)
UPDATE catalog_inverters SET phase = 3 WHERE model ILIKE '%TL3%' OR model ILIKE '%LP3%' OR model ILIKE '%RT%';
UPDATE catalog_inverters SET phase = 3 WHERE power_watt >= 10000 AND phase = 1;
