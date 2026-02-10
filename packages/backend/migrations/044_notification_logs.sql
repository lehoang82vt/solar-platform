-- NTF-01: Notification logs (sent history, status, error)
-- Requires: notification_templates, organizations

CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  recipient VARCHAR(255) NOT NULL,

  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  payload JSONB,

  status VARCHAR(20) DEFAULT 'PENDING',
  error_message TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_org ON notification_logs(organization_id);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_created ON notification_logs(created_at);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_logs_isolation ON notification_logs
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE ON notification_logs TO app_user;
