-- F-02 Rollback: Drop app_user role (and revoke grants)

REVOKE SELECT ON audit_logs FROM app_user;
REVOKE SELECT ON organizations FROM app_user;
REVOKE SELECT ON quotes FROM app_user;
REVOKE SELECT ON customers FROM app_user;
REVOKE SELECT ON projects FROM app_user;
REVOKE USAGE ON SCHEMA public FROM app_user;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    DROP ROLE app_user;
  END IF;
END
$$;

SELECT 'F-02 Rollback: app_user dropped' AS status;
