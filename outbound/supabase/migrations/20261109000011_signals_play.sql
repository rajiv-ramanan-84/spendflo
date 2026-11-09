-- Dated signals from the Master row, and the play and level each account matches.
-- The Signals cell holds one line per signal: ID | date | evidence | link | confidence.
-- The sync keeps this table equal to the cell; the gate reads it.

create table if not exists account_signals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  signal_id text not null,                 -- A1.S1, E2, NEW or UNTAGGED
  seen_on date,                            -- null = undated, never counts
  evidence text not null default '',
  source_url text,
  confidence text check (confidence in ('confirmed', 'likely')),
  expired boolean not null default false,
  legacy boolean not null default false,   -- free text from before the agreed format
  line_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, line_key)
);
create index if not exists account_signals_account_idx on account_signals (account_id, seen_on desc);
drop trigger if exists account_signals_updated_at on account_signals;
create trigger account_signals_updated_at before update on account_signals for each row execute function set_updated_at();

alter table account_signals enable row level security;
alter table account_signals force row level security;
drop policy if exists account_signals_read_active on account_signals;
create policy account_signals_read_active on account_signals for select to authenticated using (app.is_active_user());

alter table accounts
  add column if not exists play text check (play in ('A1', 'A2', 'A3')),
  add column if not exists play_level text check (play_level in ('hot', 'warm', 'nurture', 'not_fit')),
  add column if not exists play_points_to text check (play_points_to in ('A1', 'A2', 'A3')),
  add column if not exists play_reasons jsonb not null default '[]'::jsonb,
  add column if not exists play_signal_count smallint not null default 0,
  add column if not exists last_signal_on date,
  add column if not exists play_computed_at timestamptz;
create index if not exists accounts_play_level_idx on accounts (play_level) where deleted_at is null;

-- The play and level a draft was written for, so the page can show what earned it.
alter table campaigns
  add column if not exists play text check (play in ('A1', 'A2', 'A3')),
  add column if not exists play_level text check (play_level in ('hot', 'warm', 'nurture', 'not_fit'));
