-- SRV-01 rollback: drop users table
REVOKE SELECT, INSERT, UPDATE ON users FROM app_user;
DROP POLICY IF EXISTS users_insert_policy ON users;
DROP POLICY IF EXISTS users_isolation ON users;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS users;
