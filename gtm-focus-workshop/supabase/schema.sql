-- GTM Focus Workshop schema
-- Source of truth for lib/types.ts. Run this whole file in the Supabase SQL editor
-- (or via `supabase db push` / psql) on a fresh project.
--
-- MVP access model: room access is gated by an invite token in the URL (see
-- participants.invite_token), not Supabase Auth. RLS policies below are therefore
-- permissive and scoped only by workshop_id, using the anon key from the client.
-- TODO(auth-hardening): once magic-link / real auth ships, tighten these policies to
-- check auth.uid() against workshop participants instead of allowing any anon caller
-- who has a workshop_id.

create extension if not exists "pgcrypto";

-- ========== workshops ==========
create table if not exists workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null default '',
  company_context text not null default '',
  active_phase text not null default 'lobby',
  phase_started_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- ========== participants ==========
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  name text not null,
  role text not null default 'participant' check (role in ('facilitator', 'participant')),
  invite_token text not null default encode(gen_random_bytes(9), 'base64'),
  created_at timestamptz not null default now()
);
create index if not exists idx_participants_workshop on participants(workshop_id);

-- ========== phases (static reference data, seeded by app, editable per workshop) ==========
create table if not exists phases (
  id text not null,
  workshop_id uuid not null references workshops(id) on delete cascade,
  index int not null,
  name text not null,
  prompt text not null,
  minutes int not null default 0,
  primary key (workshop_id, id)
);

-- ========== cards ==========
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  phase_id text not null,
  type text not null,
  title text not null,
  body text,
  author_id uuid references participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  color text not null default 'uncertain' check (color in ('proof', 'uncertain', 'risk', 'commitment')),
  evidence_grade text check (evidence_grade in ('A', 'B', 'C', 'D')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  x double precision not null default 0,
  y double precision not null default 0,
  cluster_id uuid,
  thesis_id uuid,
  source_ids uuid[] not null default '{}',
  vote_count int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'accepted', 'rejected')),
  last_edited_by uuid references participants(id) on delete set null
);
create index if not exists idx_cards_workshop on cards(workshop_id);
create index if not exists idx_cards_phase on cards(workshop_id, phase_id);
create index if not exists idx_cards_thesis on cards(thesis_id);

-- ========== evidence ==========
create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  type text not null,
  title text not null,
  excerpt text,
  external_url text,
  source_system text default 'manual' check (source_system in ('manual', 'crm', 'call_recording', 'support', 'product_analytics', 'file')),
  account_name text,
  owner text,
  date date,
  what_it_proves text not null,
  limitations text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_evidence_workshop on evidence(workshop_id);
create index if not exists idx_evidence_card on evidence(card_id);

-- ========== gtm_theses ==========
create table if not exists gtm_theses (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  name text not null,
  segment_card_id uuid references cards(id) on delete set null,
  persona_card_id uuid references cards(id) on delete set null,
  problem_card_id uuid references cards(id) on delete set null,
  capability_card_id uuid references cards(id) on delete set null,
  outcome_card_id uuid references cards(id) on delete set null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_theses_workshop on gtm_theses(workshop_id);

alter table cards
  add constraint cards_thesis_fk foreign key (thesis_id) references gtm_theses(id) on delete set null;

-- ========== thesis_scores ==========
create table if not exists thesis_scores (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references gtm_theses(id) on delete cascade,
  dimension text not null check (dimension in (
    'problem_intensity', 'buyer_clarity', 'value_proof', 'capability_fit',
    'win_repeatability', 'sales_friction', 'expansion_potential'
  )),
  score int not null check (score between 1 and 5),
  rationale text,
  evidence_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (thesis_id, dimension)
);
create index if not exists idx_scores_thesis on thesis_scores(thesis_id);

-- ========== decisions ==========
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  thesis_id uuid not null references gtm_theses(id) on delete cascade,
  type text not null check (type in ('double_down', 'validate_fix', 'stop')),
  rationale text,
  decided_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_decisions_workshop on decisions(workshop_id);
create index if not exists idx_decisions_thesis on decisions(thesis_id);

-- ========== experiments ==========
create table if not exists experiments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  thesis_id uuid not null references gtm_theses(id) on delete cascade,
  hypothesis text not null,
  owner text not null,
  deadline date,
  target_segment_persona text,
  smallest_test text not null,
  evidence_to_collect text not null,
  success_threshold text not null,
  kill_revise_threshold text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_experiments_workshop on experiments(workshop_id);

-- ========== votes ==========
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, participant_id)
);
create index if not exists idx_votes_card on votes(card_id);

-- ========== comments ==========
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  author_id uuid references participants(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_card on comments(card_id);

-- ========== ai_proposals ==========
create table if not exists ai_proposals (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  channel text not null check (channel in ('facilitator', 'evidence_coach')),
  actions jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'edited', 'rejected')),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_proposals_workshop on ai_proposals(workshop_id);

-- ========== chat_messages (facilitator / evidence coach transcript) ==========
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  channel text not null check (channel in ('facilitator', 'evidence_coach')),
  role text not null check (role in ('user', 'assistant')),
  author_name text,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_workshop on chat_messages(workshop_id, channel);

-- ========== audit_log ==========
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_workshop on audit_log(workshop_id);

-- ================= Row Level Security =================
-- MVP: permissive, scoped by workshop_id only (anyone holding a workshop_id / invite
-- link can read+write within that workshop). TODO: scope writes to the participant
-- holding a valid invite token for that workshop once real auth exists.

alter table workshops enable row level security;
alter table participants enable row level security;
alter table phases enable row level security;
alter table cards enable row level security;
alter table evidence enable row level security;
alter table gtm_theses enable row level security;
alter table thesis_scores enable row level security;
alter table decisions enable row level security;
alter table experiments enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;
alter table ai_proposals enable row level security;
alter table chat_messages enable row level security;
alter table audit_log enable row level security;

create policy "workshops_all" on workshops for all using (true) with check (true);
create policy "participants_all" on participants for all using (true) with check (true);
create policy "phases_all" on phases for all using (true) with check (true);
create policy "cards_all" on cards for all using (true) with check (true);
create policy "evidence_all" on evidence for all using (true) with check (true);
create policy "theses_all" on gtm_theses for all using (true) with check (true);
create policy "thesis_scores_all" on thesis_scores for all using (true) with check (true);
create policy "decisions_all" on decisions for all using (true) with check (true);
create policy "experiments_all" on experiments for all using (true) with check (true);
create policy "votes_all" on votes for all using (true) with check (true);
create policy "comments_all" on comments for all using (true) with check (true);
create policy "ai_proposals_all" on ai_proposals for all using (true) with check (true);
create policy "chat_messages_all" on chat_messages for all using (true) with check (true);
create policy "audit_log_all" on audit_log for all using (true) with check (true);

-- Enable realtime on the tables clients subscribe to.
alter publication supabase_realtime add table cards, votes, decisions, participants, comments, gtm_theses, ai_proposals, chat_messages;
