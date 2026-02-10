DROP POLICY IF EXISTS backup_jobs_insert ON backup_jobs;
DROP POLICY IF EXISTS backup_jobs_isolation ON backup_jobs;
ALTER TABLE backup_jobs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS backup_jobs CASCADE;
