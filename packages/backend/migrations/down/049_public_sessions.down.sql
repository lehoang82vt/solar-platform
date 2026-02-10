DROP POLICY IF EXISTS public_sessions_insert ON public_sessions;
DROP POLICY IF EXISTS public_sessions_isolation ON public_sessions;
ALTER TABLE public_sessions DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS public_sessions CASCADE;
