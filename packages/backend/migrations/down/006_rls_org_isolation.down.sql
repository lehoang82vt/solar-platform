-- F-02 Rollback: Disable RLS organization isolation

-- Disable RLS on audit_logs
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_org_policy ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs;

-- Disable RLS on customers
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_org_policy ON customers;
DROP POLICY IF EXISTS customers_insert_policy ON customers;
ALTER TABLE customers DROP COLUMN IF EXISTS organization_id;

-- Disable RLS on projects
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_org_policy ON projects;
DROP POLICY IF EXISTS projects_insert_policy ON projects;
ALTER TABLE projects DROP COLUMN IF EXISTS organization_id;

-- Disable RLS on quotes
ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotes_org_policy ON quotes;
DROP POLICY IF EXISTS quotes_insert_policy ON quotes;
ALTER TABLE quotes DROP COLUMN IF EXISTS organization_id;

SELECT 'F-02 Rollback: RLS organization isolation disabled' AS status;
