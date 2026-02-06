-- F-05: Audit Logs Foundation
-- Creates audit_logs table with org isolation and metadata support
-- Idempotent: safe to run multiple times

-- Create organizations table (minimal, single org initially)
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create audit_logs table (Blueprint canonical)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created 
  ON audit_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
  ON audit_logs(action, created_at DESC);

-- Seed default organization if none exists
INSERT INTO organizations (name) 
SELECT 'Default Organization' 
WHERE NOT EXISTS (SELECT 1 FROM organizations);

-- Confirmation
SELECT 'F-05: Audit logs foundation created successfully' AS status;
