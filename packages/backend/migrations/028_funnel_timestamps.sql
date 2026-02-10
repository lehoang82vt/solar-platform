-- REC-01: Funnel tracking timestamps on projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS surveyed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS contracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

SELECT 'REC-01: funnel timestamps added' AS status;
