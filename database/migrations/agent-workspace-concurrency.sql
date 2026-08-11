-- Per-workspace concurrency guard for the durable agent worker.
-- Default: at most 2 non-expired running deployments per workspace.

CREATE OR REPLACE FUNCTION claim_agent_deployments(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 300,
  p_workspace_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_force BOOLEAN DEFAULT FALSE,
  p_workspace_concurrency INTEGER DEFAULT 2
)
RETURNS SETOF agent_deployments
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH running AS (
    SELECT d.workspace_id, COUNT(*)::INTEGER AS active_count
    FROM agent_deployments d
    WHERE d.status = 'running'
      AND d.lease_expires_at IS NOT NULL
      AND d.lease_expires_at >= NOW()
    GROUP BY d.workspace_id
  ), eligible AS (
    SELECT d.*,
      ROW_NUMBER() OVER (
        PARTITION BY d.workspace_id
        ORDER BY d.scheduled_for NULLS FIRST, d.created_at
      ) AS workspace_rank,
      COALESCE(r.active_count, 0) AS active_count
    FROM agent_deployments d
    LEFT JOIN running r ON r.workspace_id = d.workspace_id
    WHERE (p_workspace_id IS NULL OR d.workspace_id = p_workspace_id)
      AND (
        (d.status IN ('pending', 'active') AND (p_force OR d.scheduled_for IS NULL OR d.scheduled_for <= NOW()))
        OR (d.status = 'running' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at < NOW())
      )
  ), candidates AS (
    SELECT e.id
    FROM eligible e
    JOIN agent_deployments lock_row ON lock_row.id = e.id
    WHERE e.workspace_rank <= GREATEST(0, COALESCE(p_workspace_concurrency, 2) - e.active_count)
    ORDER BY e.scheduled_for NULLS FIRST, e.created_at
    FOR UPDATE OF lock_row SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
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
