-- Grant app_user SELECT on catalog tables (for RLS verification / cat01_5)
GRANT SELECT ON catalog_pv_modules TO app_user;
GRANT SELECT ON catalog_inverters TO app_user;
GRANT SELECT ON catalog_batteries TO app_user;
GRANT SELECT ON catalog_accessories TO app_user;
SELECT '022: catalog grants to app_user' AS status;
