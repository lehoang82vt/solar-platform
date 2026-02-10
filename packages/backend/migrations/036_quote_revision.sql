-- QUO-06: Parent quote tracking for revisions
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES quotes(id),
ADD COLUMN IF NOT EXISTS superseded BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_quotes_parent ON quotes(parent_quote_id);

SELECT '036: quote revision columns added' AS status;
