-- NTF-01: Notification templates (event_type, channel, body, variables)
-- Requires: organizations

CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,

  template_id VARCHAR(100),
  subject TEXT,
  body TEXT NOT NULL,
  variables JSONB,

  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, event_type, channel)
);

CREATE INDEX idx_notification_templates_org ON notification_templates(organization_id);
CREATE INDEX idx_notification_templates_event ON notification_templates(event_type);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_templates_isolation ON notification_templates
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO app_user;
