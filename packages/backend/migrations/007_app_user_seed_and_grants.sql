-- F-02: App user + grants + seed for RLS proof (non-superuser)
-- Creates a non-superuser role `app_user` for RLS verification
-- Seeds exactly 1 row in audit_logs for the default org (if none)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user';
  END IF;
END
$$;

-- Ensure role does NOT bypass RLS and is NOT superuser (defensive)
ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- Minimal grants for verification queries
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT ON organizations TO app_user;
GRANT SELECT ON audit_logs TO app_user;
GRANT SELECT ON quotes TO app_user;
GRANT SELECT ON customers TO app_user;
GRANT SELECT ON projects TO app_user;

-- Seed a deterministic audit_logs row for default org (only if empty)
INSERT INTO audit_logs (organization_id, actor, action, entity_type, entity_id, metadata)
SELECT
  (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1),
  'seed@app.local',
  'seed.audit_logs',
  'audit_log',
  NULL,
  '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM audit_logs);

SELECT 'F-02: app_user created + grants + audit_logs seed' AS status;
