-- PUB-03: OTP challenges table for request/verify flow
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone varchar(20) NOT NULL,
  otp_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_challenges(phone, verified, expires_at);

ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS otp_challenges_org_policy ON otp_challenges;
DROP POLICY IF EXISTS otp_challenges_insert_policy ON otp_challenges;

CREATE POLICY otp_challenges_org_policy ON otp_challenges
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY otp_challenges_insert_policy ON otp_challenges
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT 'PUB-03: otp_challenges table created' AS status;
