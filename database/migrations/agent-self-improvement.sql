-- =============================================================================
-- AGENT SELF-IMPROVEMENT LOOP — correction capture, versioned instructions,
-- regression tests, and the weekly review changelog.
-- =============================================================================
-- Implements the "Self-Improving Workflow" pattern (workflow.md / runlog /
-- review.md / changelog.md / testcases) on top of Marqq's existing per-agent,
-- per-workspace roster instead of flat files:
--
--   agent_instructions  <- workflow.md (versioned, FROZEN block enforced)
--   draft_corrections   <- runlog.jsonl (one row per human decision)
--   agent_testcases     <- testcases/ (regression set)
--   agent_review_log    <- changelog.md (weekly audit trail)
--
-- Learning is per-workspace (matches agent_os_by_workspace isolation) — one
-- workspace's corrections never influence another workspace's agent.
--
-- Generated/consumed by:
--   server/services/agentInstructions.js   (bootstrap + versioned read/write)
--   server/services/agentSelfReview.js     (weekly review pass)
--   server/services/agentSelfReviewScheduler.js
--   src/views/ApprovalsQueue.jsx           (writes draft_corrections)
--   src/views/AgentsHub.jsx                (reads the report card)
--
-- After running: enable Realtime on agent_review_log if you want the report
-- card to update live (Database -> Replication -> Supabase Realtime).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- agent_instructions — versioned "workflow.md" per (workspace, agent)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_instructions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name     TEXT        NOT NULL,
  version        INTEGER     NOT NULL DEFAULT 1,
  content        TEXT        NOT NULL,        -- full markdown, including FROZEN block
  frozen_block   TEXT        NOT NULL,        -- extracted verbatim, for byte-diff enforcement
  rule_count     INTEGER     NOT NULL DEFAULT 0,
  active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by     TEXT        NOT NULL DEFAULT 'system', -- 'system' | 'weekly_review' | a human user id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, agent_name, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_instructions_active
  ON agent_instructions (workspace_id, agent_name) WHERE active = TRUE;

-- ----------------------------------------------------------------------------
-- draft_corrections — the runlog: one row per human decision on a draft
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_corrections (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_name     TEXT        NOT NULL,
  deployment_id  TEXT,                        -- agent_deployments.id (local JSON id, not a hard FK)
  approval_id    TEXT,
  action         TEXT        NOT NULL CHECK (action IN ('approved_as_is', 'edited', 'rejected')),
  edit_type      TEXT        CHECK (edit_type IN (
                    'missing_rule', 'wrong_field', 'should_have_escalated',
                    'stylistic', 'out_of_scope', 'other'
                  )),
  note           TEXT,
  confidence     TEXT        CHECK (confidence IN ('high', 'medium', 'low')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_corrections_workspace_agent_created
  ON draft_corrections (workspace_id, agent_name, created_at DESC);

-- ----------------------------------------------------------------------------
-- agent_testcases — regression set, one row per case
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_testcases (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name      TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  why_it_exists   TEXT        NOT NULL,
  input_example   TEXT        NOT NULL,
  must_remain_true TEXT       NOT NULL,       -- the invariant a rule edit may never break
  source_correction_id UUID   REFERENCES draft_corrections(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_testcases_workspace_agent
  ON agent_testcases (workspace_id, agent_name);

-- ----------------------------------------------------------------------------
-- agent_review_log — the weekly changelog table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_review_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name        TEXT        NOT NULL,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  runs              INTEGER     NOT NULL DEFAULT 0,
  edit_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 0-100
  escalation_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 0-100
  what_changed      TEXT        NOT NULL DEFAULT 'No change — insufficient signal or no pattern found.',
  what_stayed       TEXT,                              -- "what I deliberately did not change, and why"
  tests_added       INTEGER     NOT NULL DEFAULT 0,
  reverted          BOOLEAN     NOT NULL DEFAULT FALSE, -- true if a proposed edit broke a testcase or touched FROZEN
  revert_reason     TEXT,
  new_version       INTEGER,                            -- agent_instructions.version after this pass, if changed
  human_decision_needed TEXT,                            -- "one decision a human needs to make"
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_review_log_workspace_agent_created
  ON agent_review_log (workspace_id, agent_name, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (workspace-member scoped, mirrors cofounder-digest.sql)
-- ============================================================================

ALTER TABLE agent_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_corrections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_testcases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_review_log   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_instructions_workspace_members" ON agent_instructions
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "draft_corrections_workspace_members" ON draft_corrections
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "agent_testcases_workspace_members" ON agent_testcases
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "agent_review_log_workspace_members" ON agent_review_log
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Service role (Node scheduler + API server) bypasses RLS — no extra policy needed.
