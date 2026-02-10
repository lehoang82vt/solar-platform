-- SRV-01: Internal users table (Sales/Admin)
-- Replaces legacy users schema with organization_id, full_name, status
-- Idempotent: drop and recreate for clean schema

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  email varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,

  full_name varchar(255) NOT NULL,
  role varchar(20) NOT NULL, -- ADMIN, SALES

  status varchar(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, INACTIVE

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_isolation ON users;
DROP POLICY IF EXISTS users_insert_policy ON users;

CREATE POLICY users_isolation ON users
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY users_insert_policy ON users
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Grant app_user
GRANT SELECT, INSERT, UPDATE ON users TO app_user;

SELECT 'SRV-01: users table created' AS status;
