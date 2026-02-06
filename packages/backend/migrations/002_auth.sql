-- F-04: Authentication Schema
-- Adds password_hash and is_active to users table
-- Seeds admin user from environment variables

-- Add password_hash and is_active columns to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Seed admin user from environment variables (idempotent)
INSERT INTO users (email, password_hash, role, is_active)
VALUES (
  current_setting('app.admin_email'),
  crypt(current_setting('app.admin_password'), gen_salt('bf')),
  'admin',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Confirm
SELECT 'F-04: Authentication schema updated' AS status;
