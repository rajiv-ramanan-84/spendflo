-- Assistant phase A: rules per mailbox, people who run a mailbox, attached files (as redacted text), saved prompts.

-- A writing rule can now belong to one mailbox (voice and signature for mail sent from it).
alter table writing_rules drop constraint if exists writing_rules_scope_check;
alter table writing_rules add constraint writing_rules_scope_check check (scope in ('team', 'persona', 'sender', 'mailbox'));

-- Besides the person set in "Sends as", an admin can name more people who run a mailbox.
create table if not exists mailbox_operators (
  mailbox_id uuid not null references mailboxes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mailbox_id, user_id)
);
alter table mailbox_operators enable row level security;

-- Files people attach in the assistant. Only the redacted text is kept: the original never leaves the browser.
-- After 30 days a file is archived: it stays in the library and can be attached again, it just leaves the recent list.
create table if not exists agent_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  mime text,
  size_bytes bigint not null default 0,
  pages integer,
  chars integer not null default 0,
  tokens_est integer not null default 0,
  content text not null,
  phones_removed integer not null default 0,
  emails_removed integer not null default 0,
  truncated boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  archived_at timestamptz
);
create index if not exists agent_files_user on agent_files (user_id, created_at desc);
alter table agent_files enable row level security;

create table if not exists agent_saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_saved_prompts_user on agent_saved_prompts (user_id, created_at desc);
alter table agent_saved_prompts enable row level security;

-- What a message carried: the accounts picked as context and the files attached.
alter table agent_messages add column if not exists meta jsonb;

notify pgrst, 'reload schema';
