DROP INDEX IF EXISTS idx_quotes_parent;

ALTER TABLE quotes
DROP COLUMN IF EXISTS superseded,
DROP COLUMN IF EXISTS parent_quote_id;
