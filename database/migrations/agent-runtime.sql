-- =============================================================================
-- AGENT RUNTIME — durable deployments, runs, steps, events, and leases
-- =============================================================================
-- The existing agent_deployments table remains the public queue record. This
-- migration adds database-backed claiming and an execution journal so workers
-- can resume after a restart and multiple worker processes cannot claim the
-- same deployment at the same time.

ALTER TABLE agent_deployments
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS run_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agent_deployments_claimable
  ON agent_deployments (status, scheduled_for, next_retry_at, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_agent_deployments_workspace_status
  ON agent_deployments (workspace_id, status, scheduled_for);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'waiting_for_approval', 'completed', 'failed', 'cancelled')),
  trigger TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_status
  ON agent_runs (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting_for_approval', 'completed', 'failed', 'skipped')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run_order
  ON agent_run_steps (run_id, step_index);

CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  deployment_id TEXT,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  step_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_run_created
  ON agent_events (run_id, created_at);

CREATE TABLE IF NOT EXISTS agent_action_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'completed', 'skipped', 'failed')),
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_action_receipts_run
  ON agent_action_receipts (run_id, created_at);

CREATE OR REPLACE FUNCTION claim_agent_action(
  p_workspace_id UUID,
  p_run_id TEXT,
  p_step_key TEXT,
  p_action_key TEXT,
  p_action_type TEXT,
  p_request JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  INSERT INTO agent_action_receipts
    (workspace_id, run_id, step_key, action_key, action_type, request)
  VALUES
    (p_workspace_id, p_run_id, p_step_key, p_action_key, p_action_type, p_request)
  ON CONFLICT (workspace_id, action_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

-- Atomic claim function. Expired leases are eligible for retry. The function
-- intentionally returns the full deployment row so the worker can execute the
-- payload without a second race-prone read.
CREATE OR REPLACE FUNCTION claim_agent_deployments(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 300,
  p_workspace_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS SETOF agent_deployments
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM agent_deployments d
    WHERE (p_workspace_id IS NULL OR d.workspace_id = p_workspace_id)
      AND (
        (d.status IN ('pending', 'active') AND (p_force OR d.scheduled_for IS NULL OR d.scheduled_for <= NOW()))
        OR (d.status = 'running' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at < NOW())
      )
    ORDER BY d.scheduled_for NULLS FIRST, d.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE agent_deployments d
  SET status = 'running',
      worker_id = p_worker_id,
      claimed_at = NOW(),
      lease_expires_at = NOW() + make_interval(secs => GREATEST(30, p_lease_seconds)),
      heartbeat_at = NOW(),
      attempt_count = COALESCE(d.attempt_count, 0) + 1,
      max_attempts = GREATEST(1, COALESCE(d.max_attempts, 3)),
      next_retry_at = NULL,
      started_at = COALESCE(d.started_at, NOW()),
      last_error = NULL,
      updated_at = NOW()
  FROM candidates c
  WHERE d.id = c.id
  RETURNING d.*;
END;
$$;
