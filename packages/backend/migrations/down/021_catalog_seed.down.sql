-- Remove seed rows (by sku)
DELETE FROM catalog_pv_modules WHERE sku = 'PV-SAMPLE-550W';
DELETE FROM catalog_inverters WHERE sku = 'INV-SAMPLE-5K';
DELETE FROM catalog_batteries WHERE sku = 'BAT-SAMPLE-5KWH';
SELECT '021 Rollback: catalog seed removed' AS status;
