-- Sending limits and domain protection.
-- One settings row (per-address daily max, warning level, core domain rule, warm-up, bounce pause),
-- a log of every email sent, Gmail's own sent count per dedicated inbox, and a registry of sending domains.

create table if not exists sending_settings (
  id boolean primary key default true check (id),
  per_address_max int not null default 30 check (per_address_max between 1 and 500),
  warn_at int not null default 25 check (warn_at >= 1),
  protect_core text not null default 'block' check (protect_core in ('off', 'warn', 'block')),
  core_domains text[] not null default '{}',
  warmup_enabled boolean not null default true,
  warmup_steps jsonb not null default '[{"days":7,"max":10},{"days":14,"max":20}]'::jsonb,
  bounce_pause_pct numeric not null default 3 check (bounce_pause_pct > 0 and bounce_pause_pct <= 100),
  bounce_min_sample int not null default 20 check (bounce_min_sample >= 1),
  optout_line text,
  updated_by uuid references users (id),
  updated_at timestamptz not null default now(),
  check (warn_at <= per_address_max)
);
insert into sending_settings (id) values (true) on conflict (id) do nothing;
alter table sending_settings enable row level security;
alter table sending_settings force row level security;
drop policy if exists sending_settings_read on sending_settings;
create policy sending_settings_read on sending_settings for select to authenticated using (app.is_active_user());
revoke all on sending_settings from authenticated;
grant select on sending_settings to authenticated;

-- Mailboxes: warm-up, pause, and who connected them. Mailboxes that already existed are treated as established.
alter table mailboxes add column if not exists paused_at timestamptz;
alter table mailboxes add column if not exists paused_reason text;
alter table mailboxes add column if not exists warmup_started_at timestamptz;
-- Mailboxes that exist today are already in use, so they skip warm-up. Only on the first run, never on a re-run.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mailboxes' and column_name = 'established') then
    alter table mailboxes add column established boolean not null default false;
    update mailboxes set established = true;
  end if;
end $$;
grant select (established, paused_at, paused_reason, warmup_started_at) on mailboxes to authenticated;

-- Steps remember which address they were sent from (and may name a different inbox than the person's default).
alter table steps add column if not exists sent_from citext;
alter table steps add column if not exists send_from_mailbox_id uuid references mailboxes (id) on delete set null;

-- Every email sent, one row per step. The daily count is read from here.
create table if not exists send_log (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null unique references steps (id) on delete cascade,
  from_email citext not null,
  user_id uuid references users (id),
  sent_at timestamptz not null default now(),
  sent_day date not null,
  first_touch boolean not null default false
);
create index if not exists send_log_from_day on send_log (from_email, sent_day);
alter table send_log enable row level security;
alter table send_log force row level security;
drop policy if exists send_log_read on send_log;
create policy send_log_read on send_log for select to authenticated using (app.is_active_user());
revoke all on send_log from authenticated;
grant select on send_log to authenticated;

-- What Gmail says a dedicated inbox sent today (catches mail sent outside the app). Refreshed by the 15 minute check.
create table if not exists gmail_sent_counts (
  email citext not null,
  day date not null,
  sent int not null default 0,
  checked_at timestamptz not null default now(),
  primary key (email, day)
);
alter table gmail_sent_counts enable row level security;
alter table gmail_sent_counts force row level security;
drop policy if exists gmail_sent_counts_read on gmail_sent_counts;
create policy gmail_sent_counts_read on gmail_sent_counts for select to authenticated using (app.is_active_user());
revoke all on gmail_sent_counts from authenticated;
grant select on gmail_sent_counts to authenticated;

-- Domains mail is sent from. Core domains never carry cold first touches; outreach domains do.
create table if not exists sending_domains (
  domain citext primary key,
  kind text not null default 'outreach' check (kind in ('core', 'outreach')),
  spf text,
  dkim text,
  dmarc text,
  checked_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
alter table sending_domains enable row level security;
alter table sending_domains force row level security;
drop policy if exists sending_domains_read on sending_domains;
create policy sending_domains_read on sending_domains for select to authenticated using (app.is_active_user());
revoke all on sending_domains from authenticated;
grant select on sending_domains to authenticated;
