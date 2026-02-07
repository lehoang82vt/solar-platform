-- Org-from-project: allow app to resolve project.organization_id by project id (bypasses RLS for this read)
CREATE OR REPLACE FUNCTION public.get_project_organization_id(pid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM projects WHERE id = pid LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_organization_id(uuid) TO app_user;

SELECT '012: get_project_organization_id() created' AS status;
