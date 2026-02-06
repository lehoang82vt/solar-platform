-- F-03: Foundation Schema
-- Creates 3 core tables: users, projects, audit_events
-- Idempotent: safe to run multiple times

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email varchar(255) NOT NULL UNIQUE,
  role varchar(50) NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name varchar(255) NOT NULL,
  address text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit events table
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor varchar(255) NOT NULL,
  action varchar(100) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at 
  ON audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_created_at 
  ON projects(created_at DESC);

-- Confirmation
SELECT 'F-03: Foundation schema created successfully' AS status;
