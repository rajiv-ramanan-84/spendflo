-- LinkedIn notification emails the hourly mail scan has handled, and the per-person setup checklist.
create table if not exists linkedin_events (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  kind text not null check (kind in ('accepted', 'message')),
  status text not null check (status in ('applied', 'recorded', 'unmatched', 'ambiguous', 'not_in_campaign')),
  person_name text,
  headline text,
  account_id uuid references accounts (id),
  contact_id uuid references contacts (id),
  inbox text,
  detail text,
  received_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists linkedin_events_recent on linkedin_events (created_at desc);
alter table linkedin_events enable row level security;
alter table linkedin_events force row level security;
drop policy if exists linkedin_events_read on linkedin_events;
create policy linkedin_events_read on linkedin_events for select to authenticated using (app.is_active_user());
grant select on linkedin_events to authenticated;

create table if not exists user_checklist (
  user_id uuid not null references users (id) on delete cascade,
  item_key text not null,
  done_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table user_checklist enable row level security;
alter table user_checklist force row level security;
drop policy if exists user_checklist_own on user_checklist;
create policy user_checklist_own on user_checklist for select to authenticated using (app.is_active_user());
grant select on user_checklist to authenticated;

notify pgrst, 'reload schema';
