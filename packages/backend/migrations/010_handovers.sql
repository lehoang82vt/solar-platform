-- F-28: Handover/Acceptance lifecycle
-- Handovers linked to project + optional contract. State: DRAFT -> SIGNED -> COMPLETED.
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS handovers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_id uuid NULL REFERENCES contracts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  acceptance_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_at timestamptz,
  signed_by text,
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handovers_org_created ON handovers(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handovers_project_id ON handovers(project_id);
CREATE INDEX IF NOT EXISTS idx_handovers_contract_id ON handovers(contract_id);
CREATE INDEX IF NOT EXISTS idx_handovers_status ON handovers(status);

ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS handovers_org_policy ON handovers;
DROP POLICY IF EXISTS handovers_insert_policy ON handovers;
CREATE POLICY handovers_org_policy ON handovers
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY handovers_insert_policy ON handovers
  FOR INSERT
  WITH CHECK (organization_id = (current_setting('app.current_org_id', true))::uuid);

SELECT '010: Handovers table created' AS status;
