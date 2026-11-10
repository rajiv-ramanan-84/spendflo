-- Vendor signals: a data vendor writes events into a separate feed sheet, the app validates them
-- under hard limits, writes a status back to the sheet and feeds accepted ones into the same gate
-- as every other signal. Safe to run more than once.

alter table accounts
  add column if not exists vendor_signals text,
  add column if not exists signals_changed_at timestamptz,
  add column if not exists signals_reviewed_at timestamptz;

alter table account_signals
  add column if not exists source text not null default 'master',
  add column if not exists vendor_ref text,
  add column if not exists ingested_at timestamptz not null default now();
alter table account_signals drop constraint if exists account_signals_source_check;
alter table account_signals add constraint account_signals_source_check check (source in ('master', 'vendor'));

-- One row per feed row the app has decided about. vendor_ref is the vendor's own ID for the row.
create table if not exists signal_feed_rows (
  id uuid primary key default gen_random_uuid(),
  vendor_ref text not null unique,
  account_id uuid references accounts (id) on delete set null,
  sheet_account_id text,
  signal_id text,
  status text not null check (status in ('accepted', 'duplicate', 'rejected', 'deferred', 'superseded')),
  reason text,
  effect text,
  row_hash text not null,
  sheet_row integer,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists signal_feed_rows_day on signal_feed_rows (decided_at) where status = 'accepted';
create index if not exists signal_feed_rows_account on signal_feed_rows (account_id, decided_at) where status = 'accepted';

create table if not exists signal_feed_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_read integer not null default 0,
  accepted integer not null default 0,
  duplicates integer not null default 0,
  rejected integer not null default 0,
  deferred integer not null default 0,
  accounts_touched integer not null default 0,
  error text
);

alter table signal_feed_rows enable row level security;
alter table signal_feed_rows force row level security;
alter table signal_feed_runs enable row level security;
alter table signal_feed_runs force row level security;
drop policy if exists signal_feed_rows_read_active on signal_feed_rows;
create policy signal_feed_rows_read_active on signal_feed_rows for select to authenticated using (app.is_active_user());
drop policy if exists signal_feed_runs_read_active on signal_feed_runs;
create policy signal_feed_runs_read_active on signal_feed_runs for select to authenticated using (app.is_active_user());
grant select on signal_feed_rows, signal_feed_runs to authenticated;

notify pgrst, 'reload schema';
