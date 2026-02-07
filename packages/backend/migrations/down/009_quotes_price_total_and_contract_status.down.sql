-- Rollback 009: quotes.price_total, contracts status default

ALTER TABLE contracts ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE quotes DROP COLUMN IF EXISTS price_total;

SELECT '009 Rollback: quotes.price_total dropped, contracts status default reverted' AS status;
