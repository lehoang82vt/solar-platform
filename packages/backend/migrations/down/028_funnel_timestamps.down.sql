ALTER TABLE projects
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS contracted_at,
  DROP COLUMN IF EXISTS quoted_at,
  DROP COLUMN IF EXISTS surveyed_at,
  DROP COLUMN IF EXISTS contacted_at;
