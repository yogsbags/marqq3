-- Workspace-scoped webhook credentials. Plaintext secrets are never stored.
create table if not exists public.workspace_webhook_endpoints (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  connected_account_id text not null default '',
  secret_ciphertext text not null,
  secret_hash text not null,
  events jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (workspace_id, provider, connected_account_id)
);

create index if not exists workspace_webhook_endpoints_workspace_idx
  on public.workspace_webhook_endpoints (workspace_id, provider, active);

create table if not exists public.workspace_webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id text not null references public.workspace_webhook_endpoints(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_key)
);

create index if not exists workspace_webhook_events_workspace_idx
  on public.workspace_webhook_events (workspace_id, created_at desc);

alter table public.workspace_webhook_endpoints enable row level security;
alter table public.workspace_webhook_events enable row level security;

drop policy if exists workspace_webhook_endpoints_workspace_members on public.workspace_webhook_endpoints;
create policy workspace_webhook_endpoints_workspace_members on public.workspace_webhook_endpoints
  for all using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()))
  with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

drop policy if exists workspace_webhook_events_workspace_members on public.workspace_webhook_events;
create policy workspace_webhook_events_workspace_members on public.workspace_webhook_events
  for all using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()))
  with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
