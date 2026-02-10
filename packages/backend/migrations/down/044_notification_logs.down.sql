-- NTF-01: Drop notification_logs
DROP POLICY IF EXISTS notification_logs_isolation ON notification_logs;
ALTER TABLE notification_logs DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS notification_logs;
