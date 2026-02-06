-- F-02 Rollback: Drop extensions (keep schema_migrations for tracking)

DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";

SELECT 'F-02 Rollback: extensions removed (schema_migrations preserved)' AS status;
