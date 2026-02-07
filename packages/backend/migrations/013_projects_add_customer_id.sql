-- F-36: add projects.customer_id to align project-scoped quote flow
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_customer_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_customer_id
  ON projects(customer_id);

SELECT '013: projects.customer_id added' AS status;
