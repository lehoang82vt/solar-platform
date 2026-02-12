-- Quick SQL check for schema
-- Run: psql -U postgres -d solar -f deploy/quick-check-schema.sql

SELECT 'QUOTES TABLE COLUMNS:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'quotes' 
ORDER BY ordinal_position;

SELECT 'HANDOVERS TABLE COLUMNS:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'handovers' 
ORDER BY ordinal_position;

SELECT 'CONTRACTS TABLE COLUMNS:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contracts' 
ORDER BY ordinal_position;
