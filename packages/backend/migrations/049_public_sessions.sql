-- JOB-04: Public/session table for cleanup (expired sessions)
CREATE TABLE IF NOT EXISTS public_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_public_sessions_expires ON public_sessions(expires_at);
CREATE INDEX idx_public_sessions_org ON public_sessions(organization_id);

ALTER TABLE public_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_sessions_isolation ON public_sessions
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY public_sessions_insert ON public_sessions
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public_sessions TO app_user;
