-- database/migrations/credit-wallets.sql
-- Workspace credit wallets + usage ledger (Marqq-test / marqq3).
-- Apply on the shared Marqq Supabase project (service role writes).

CREATE TABLE IF NOT EXISTS public.credit_wallets (
  workspace_id        UUID        PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan                TEXT        NOT NULL DEFAULT 'workspace'
                                  CHECK (plan IN ('workspace', 'growth', 'scale', 'agency')),
  credits_total       INTEGER     NOT NULL DEFAULT 99999,
  credits_remaining   INTEGER     NOT NULL DEFAULT 99999,
  credits_reserved    INTEGER     NOT NULL DEFAULT 0,
  credits_reset_at    TIMESTAMPTZ,
  lifetime_spent      INTEGER     NOT NULL DEFAULT 0,
  lifetime_usd        NUMERIC(14, 6) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload             JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_credit_wallets_plan
  ON public.credit_wallets (plan);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id                  TEXT        PRIMARY KEY,
  workspace_id        UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  feature             TEXT,
  provider            TEXT,
  model               TEXT,
  status              TEXT        NOT NULL DEFAULT 'ok',
  estimated_credits   INTEGER,
  actual_credits      INTEGER,
  delta_credits       INTEGER,
  actual_usd          NUMERIC(14, 6),
  reservation_id      TEXT,
  payload             JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace_at
  ON public.credit_ledger (workspace_id, at DESC);

-- Updated-at trigger for wallets
CREATE OR REPLACE FUNCTION public.credit_wallets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_wallets_updated_at ON public.credit_wallets;
CREATE TRIGGER credit_wallets_updated_at
  BEFORE UPDATE ON public.credit_wallets
  FOR EACH ROW EXECUTE FUNCTION public.credit_wallets_set_updated_at();

-- RLS
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_credit_wallets" ON public.credit_wallets;
CREATE POLICY "service_role_all_credit_wallets" ON public.credit_wallets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_credit_ledger" ON public.credit_ledger;
CREATE POLICY "service_role_all_credit_ledger" ON public.credit_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Members can read their workspace wallet / ledger
DROP POLICY IF EXISTS "members_select_credit_wallets" ON public.credit_wallets;
CREATE POLICY "members_select_credit_wallets" ON public.credit_wallets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = credit_wallets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members_select_credit_ledger" ON public.credit_ledger;
CREATE POLICY "members_select_credit_ledger" ON public.credit_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = credit_ledger.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
