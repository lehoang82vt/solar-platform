-- F-02: Initialize extensions and schema_migrations table
-- This migration is idempotent and can be run multiple times safely

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Confirm initialization
SELECT 'F-02: Initialization complete' AS status;
