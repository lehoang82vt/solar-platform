-- F-02: RLS Organization Isolation
-- Enables Row Level Security on org-scoped tables
-- Idempotent: safe to run multiple times

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS audit_logs_org_policy ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs;

-- Create policy for SELECT/UPDATE/DELETE (filter by organization_id)
CREATE POLICY audit_logs_org_policy ON audit_logs
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Create policy for INSERT (enforce organization_id)
CREATE POLICY audit_logs_insert_policy ON audit_logs
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Enable RLS on customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS customers_org_policy ON customers;
DROP POLICY IF EXISTS customers_insert_policy ON customers;

-- Add organization_id column to customers if not exists
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Create policy for SELECT/UPDATE/DELETE
CREATE POLICY customers_org_policy ON customers
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Create policy for INSERT
CREATE POLICY customers_insert_policy ON customers
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS projects_org_policy ON projects;
DROP POLICY IF EXISTS projects_insert_policy ON projects;

-- Add organization_id column to projects if not exists
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Create policy for SELECT/UPDATE/DELETE
CREATE POLICY projects_org_policy ON projects
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Create policy for INSERT
CREATE POLICY projects_insert_policy ON projects
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Enable RLS on quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS quotes_org_policy ON quotes;
DROP POLICY IF EXISTS quotes_insert_policy ON quotes;

-- Add organization_id column to quotes if not exists
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Create policy for SELECT/UPDATE/DELETE
CREATE POLICY quotes_org_policy ON quotes
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Create policy for INSERT
CREATE POLICY quotes_insert_policy ON quotes
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Confirmation
SELECT 'F-02: RLS organization isolation enabled' AS status;
