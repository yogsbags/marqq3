# Supabase persistence (Marqq2 table reuse)

Marqq-test (marqq3) now persists core product state to the **same Supabase project and tables** as Marqq2.

## Env

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | client + server | Project URL |
| `VITE_SUPABASE_ANON_KEY` | client (+ server fallback) | Auth / anon |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Workspace / GTM / outreach / agent writes |
| `USE_SUPABASE_PERSISTENCE` | server | `1` force on, `0` force off; default = on when service role present |

Set `SUPABASE_SERVICE_ROLE_KEY` on Railway (never expose via `VITE_`).

## Tables used

| Table | Used for |
|-------|----------|
| `workspaces`, `workspace_members` | Per-user workspace UUID (replaces `marqq-ws-1`) |
| `gtm_modules` | GTM wizard + locked strategy |
| `companies`, `workspace_context` | Brand DNA profile |
| `company_artifacts` | Optional brand file metadata |
| `outreach_runs`, `outreach_prospects` | Outreach Studio durability |
| `agent_deployments`, `agent_artifacts`, `draft_approvals` | Agent OS + deployments |
| `conversations`, `messages` | Ask Marqq chat history (per channel · survives logout/login) |
| `credit_wallets`, `credit_ledger` | Workspace credit balance + usage ledger (UUID workspaces) |

Isolation: new signups get a **new** workspace; Elevate/Nouriva rows are never auto-attached.

## Client flow

1. Sign in → `ensureUserWorkspace()` → `GET /api/workspaces` (auto-provisions)
2. Active UUID cached in `localStorage` (`marqq_workspace_id`)
3. `window.fetch` patches Bearer onto `/api/*`
4. GTM dual-writes sessionStorage + `gtm_modules`
5. Brand DNA dual-writes filesystem + `companies`
6. Ask Marqq appends turns to `conversations`/`messages` (FS fallback for non-UUID workspaces)

## Rollback

```bash
USE_SUPABASE_PERSISTENCE=0
```

App falls back to sessionStorage / `marqq-db.json` / in-memory maps / `server/data/ask-marqq-chats.json`.

## Out of scope (still Marqq2-only)

Library, competitor intel, full content_drafts mapping.
