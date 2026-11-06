-- Shared sending mailboxes (e.g. sid@spendflo.com run by Mouli, written as Sid).
-- A mailbox is not a person and cannot sign in. People sign in as themselves;
-- users.send_mailbox_id says which mailbox their accounts' emails go out from
-- (null = their own Gmail). writes_as_user_id is whose name and voice the copy uses.
create table if not exists mailboxes (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  writes_as_user_id uuid not null references users (id),
  google_refresh_token_enc text,
  google_token_status google_token_status not null default 'missing',
  connected_by uuid references users (id),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table mailboxes enable row level security;
alter table mailboxes force row level security;
create policy mailboxes_read_active on mailboxes for select to authenticated using (app.is_active_user());
-- The token never leaves the server: authenticated users see every column but the token.
revoke all on mailboxes from authenticated;
grant select (id, email, writes_as_user_id, google_token_status, connected_by, connected_at, created_at, updated_at) on mailboxes to authenticated;
create trigger mailboxes_updated_at before update on mailboxes for each row execute function set_updated_at();

alter table users add column if not exists send_mailbox_id uuid references mailboxes (id) on delete set null;

-- Every step on an account is now sent by the account owner (from their mailbox).
-- Move open steps and tracks that were assigned to someone else onto the owner.
update steps s set assignee_id = c.owner_id
from campaigns c
where s.campaign_id = c.id and s.status in ('upcoming', 'due', 'overdue') and s.assignee_id is distinct from c.owner_id;
update contact_tracks t set assignee_id = c.owner_id
from campaigns c
where t.campaign_id = c.id and t.status in ('not_started', 'active', 'paused') and t.assignee_id is distinct from c.owner_id;
