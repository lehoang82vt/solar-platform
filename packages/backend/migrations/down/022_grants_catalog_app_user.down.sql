REVOKE SELECT ON catalog_pv_modules FROM app_user;
REVOKE SELECT ON catalog_inverters FROM app_user;
REVOKE SELECT ON catalog_batteries FROM app_user;
REVOKE SELECT ON catalog_accessories FROM app_user;
SELECT '022 Rollback: catalog grants revoked' AS status;
