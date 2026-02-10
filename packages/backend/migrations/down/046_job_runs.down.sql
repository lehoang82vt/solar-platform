DROP POLICY IF EXISTS job_runs_insert_policy ON job_runs;
DROP POLICY IF EXISTS job_runs_isolation ON job_runs;
ALTER TABLE job_runs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS job_runs CASCADE;
