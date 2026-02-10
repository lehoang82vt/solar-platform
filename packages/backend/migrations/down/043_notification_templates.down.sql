-- NTF-01: Drop notification_templates (logs must be dropped first or FK)
DROP POLICY IF EXISTS notification_templates_isolation ON notification_templates;
ALTER TABLE notification_templates DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS notification_templates;
