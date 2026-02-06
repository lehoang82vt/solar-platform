-- F-06b: Quotes draft table
-- Stores draft quotes linked to customers
-- Payload is flexible JSONB for future solar calculations

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for customer lookups
CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);

-- Confirm
SELECT 'F-06b: Quotes table created' AS status;
