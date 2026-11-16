-- The assistant harness: threads, runs and traces, proposed actions and approvals,
-- integrations (MCP) with per-tool permission levels, a spend ledger, and versioned config.
-- All access is through the app's server code (service role). Browsers never read these tables.

create table if not exists agent_config (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version_no integer not null,
  value jsonb not null,
  edited_by uuid references users (id),
  created_at timestamptz not null default now(),
  unique (key, version_no)
);

create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  title text not null default 'New chat',
  context jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_threads_user on agent_threads (user_id, updated_at desc);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads (id) on delete cascade,
  user_id uuid not null references users (id),
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'stopped', 'budget')),
  model text,
  claude_usd numeric(10, 4) not null default 0,
  tapistro_credits numeric(10, 2) not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  summary text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_recent on agent_runs (started_at desc);
create index if not exists agent_runs_thread on agent_runs (thread_id, started_at);

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_thread on agent_messages (thread_id, created_at);

-- One row per thing the harness did inside a run: a model call, a tool call, an approval, an error.
create table if not exists agent_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references agent_runs (id) on delete cascade,
  seq integer not null,
  kind text not null check (kind in ('model', 'tool', 'approval', 'action', 'guard', 'error')),
  name text not null,
  status text not null default 'ok' check (status in ('ok', 'error', 'blocked', 'pending')),
  input jsonb,
  output jsonb,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(10, 4),
  credits numeric(10, 2),
  duration_ms integer,
  error text,
  at timestamptz not null default now()
);
create index if not exists agent_steps_run on agent_steps (run_id, seq);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  preset text,
  url text not null,
  token_enc text,
  enabled boolean not null default false,
  status text not null default 'untested' check (status in ('untested', 'ok', 'error')),
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integration_tools (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations (id) on delete cascade,
  name text not null,
  description text,
  input_schema jsonb,
  schema_hash text not null,
  level text not null default 'blocked' check (level in ('read', 'approve', 'blocked')),
  credits_estimate numeric(10, 2) not null default 0,
  needs_review boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (integration_id, name)
);

-- What the assistant proposed to change, and what a person decided.
create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs (id) on delete set null,
  thread_id uuid references agent_threads (id) on delete cascade,
  proposed_by uuid not null references users (id),
  kind text not null default 'mcp_tool',
  integration_id uuid references integrations (id) on delete set null,
  tool text not null,
  title text not null,
  args jsonb not null default '{}'::jsonb,
  est_credits numeric(10, 2) not null default 0,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed')),
  decided_by uuid references users (id),
  decided_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists agent_actions_thread on agent_actions (thread_id, created_at);
create index if not exists agent_actions_open on agent_actions (status) where status = 'proposed';

-- Money and credits the assistant spent. The monthly caps read from here.
create table if not exists spend_ledger (
  id bigint generated always as identity primary key,
  run_id uuid references agent_runs (id) on delete set null,
  kind text not null check (kind in ('claude_usd', 'tapistro_credits')),
  amount numeric(12, 4) not null,
  note text,
  at timestamptz not null default now()
);
create index if not exists spend_ledger_month on spend_ledger (kind, at desc);

alter table agent_config enable row level security;
alter table agent_threads enable row level security;
alter table agent_runs enable row level security;
alter table agent_messages enable row level security;
alter table agent_steps enable row level security;
alter table integrations enable row level security;
alter table integration_tools enable row level security;
alter table agent_actions enable row level security;
alter table spend_ledger enable row level security;

notify pgrst, 'reload schema';
