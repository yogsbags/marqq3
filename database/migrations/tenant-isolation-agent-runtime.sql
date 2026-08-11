-- Tenant isolation for durable agent runtime data.
-- Run after agent-runtime.sql and after workspace_members exists.

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_deployments', 'agent_runs', 'agent_run_steps', 'agent_events',
    'agent_action_receipts', 'agent_mail_threads', 'agent_mail_events'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_workspace_members', table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())) WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))',
        table_name || '_workspace_members', table_name
      );
    END IF;
  END LOOP;
END $$;

-- agent_artifacts stores both workspace-scoped artifacts and a small number of
-- legacy rows. Workspace-scoped rows must be member-readable; service role
-- workers continue to bypass RLS.
DO $$
BEGIN
  IF to_regclass('public.agent_artifacts') IS NOT NULL THEN
    ALTER TABLE public.agent_artifacts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS agent_artifacts_workspace_members ON public.agent_artifacts;
    CREATE POLICY agent_artifacts_workspace_members ON public.agent_artifacts
      FOR ALL
      USING (company_id IN (SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()))
      WITH CHECK (company_id IN (SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()));
  END IF;
END $$;
