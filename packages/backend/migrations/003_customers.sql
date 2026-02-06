-- F-06a: Customers table
-- Stores customer information for solar projects

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Confirm
SELECT 'F-06a: Customers table created' AS status;
