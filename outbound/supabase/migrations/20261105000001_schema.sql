-- Outbound Command Center: core schema (PRD section 4, PLAN.md section 2).
-- Nothing is hard-deleted. Every business table has created_at / updated_at.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'manager', 'member');
create type google_token_status as enum ('ok', 'expired', 'missing');
create type account_tier as enum ('A', 'B', 'C', 'D');
create type icp_verdict as enum ('fit', 'maybe', 'no_fit');
create type persona as enum (
  'economic_buyer', 'procurement_leader', 'system_owner', 'contract_manager',
  'legal', 'finance_ap', 'champion', 'other'
);
create type engagement_status as enum ('not_contacted', 'contacted', 'connected', 'replied', 'meeting', 'stopped');
create type campaign_status as enum (
  'draft', 'active', 'paused', 'responded', 'meeting_booked',
  'closed_no_response', 'disqualified', 'recycle'
);
create type version_reason as enum ('initial', 'response', 'manual_edit');
create type plan_scope as enum ('campaign', 'track');
create type start_trigger_type as enum ('fixed', 'after_step', 'after_reply', 'manual');
create type track_status as enum ('not_started', 'active', 'paused', 'replied', 'meeting', 'completed', 'stopped');
create type step_channel as enum ('email', 'linkedin_connect', 'linkedin_message', 'linkedin_inmail', 'call', 'other');
create type step_status as enum ('upcoming', 'due', 'overdue', 'done', 'skipped', 'superseded');
create type call_outcome as enum ('connected', 'voicemail', 'no_answer');
create type response_source as enum ('detected', 'manual');
create type response_class as enum (
  'positive', 'neutral', 'objection', 'not_now', 'referral',
  'wrong_person', 'unsubscribe', 'auto_reply', 'bounce'
);
create type response_state as enum ('pending', 'confirmed', 'dismissed');
create type replan_state as enum ('open', 'stale', 'applied', 'discarded');
create type dq_status as enum ('open', 'resolved', 'ignored');
create type claude_call_type as enum ('generate_campaign', 'replan_campaign', 'classify_reply', 'rewrite');
create type claude_call_status as enum ('queued', 'running', 'ok', 'invalid', 'failed');
create type sync_status as enum ('running', 'ok', 'partial', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email citext not null unique,
  name text not null,
  role user_role not null default 'member',
  active boolean not null default true,
  timezone text not null default 'Asia/Kolkata',
  slack_user_id text,
  avatar_url text,
  google_refresh_token_enc text,
  google_token_status google_token_status not null default 'missing',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_out_of_office (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  start_date date not null,
  end_date date not null,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on user_out_of_office (user_id, start_date);

-- ---------------------------------------------------------------------------
-- Account book (sheet is master for research and contacts)
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  sheet_account_id text not null unique,
  name text not null,
  domain citext,
  segment text,
  tier account_tier,
  icp_verdict icp_verdict,
  owner_id uuid references users (id),
  status text,                                   -- written back to the sheet
  archived boolean not null default false,       -- NO-FIT imports archived
  revenue text,
  employees text,
  hq text,
  ownership text,
  coupa_evidence text,
  trigger text,
  trigger_date date,
  signals text,
  disqualifier_flags text,
  outreach_angle text,
  target_contact_notes text,
  do_not_contact boolean not null default false,
  sheet_owner_hint text,                         -- "Sheet says X" after first import
  sheet_deleted_at timestamptz,                  -- row gone from sheet; never auto-deleted
  last_synced_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  priority_score smallint not null default 0 check (priority_score between 0 and 100),
  priority_reasons jsonb not null default '[]'::jsonb,
  priority_computed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on accounts (owner_id) where deleted_at is null;
create index on accounts (tier, priority_score desc) where deleted_at is null and not archived;

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id),
  sheet_contact_key text not null unique,        -- stable key derived from the sheet row
  full_name text not null,
  title text,
  persona persona,
  seniority text,
  email citext,
  email_status text,
  phone text,                                    -- never sent to Claude
  linkedin_url text,
  country text default 'US',
  timezone text,
  linkedin_signals jsonb not null default '{}'::jsonb,
  notes text,
  engagement_status engagement_status not null default 'not_contacted',
  exclude boolean not null default false,
  do_not_contact boolean not null default false,
  bounced boolean not null default false,
  changed_flag boolean not null default false,   -- title or company changed mid-campaign
  sheet_deleted_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on contacts (account_id) where deleted_at is null;
create index on contacts (email) where email is not null;
create index on contacts (linkedin_url) where linkedin_url is not null;

-- Global do-not-contact. Survives every sheet sync.
create table do_not_contact (
  id uuid primary key default gen_random_uuid(),
  email citext,
  linkedin_url text,
  reason text not null,
  source_response_id uuid,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or linkedin_url is not null)
);
create unique index on do_not_contact (email) where email is not null;
create unique index on do_not_contact (linkedin_url) where linkedin_url is not null;

create table account_pins (
  user_id uuid not null references users (id),
  account_id uuid not null references accounts (id),
  created_at timestamptz not null default now(),
  primary key (user_id, account_id)
);

-- ---------------------------------------------------------------------------
-- Settings and skill (referenced by campaign versions)
-- ---------------------------------------------------------------------------
create table app_settings (
  id boolean primary key default true check (id),   -- singleton row
  sheet_id text,
  caps jsonb not null,
  priority_weights jsonb not null,
  default_model text not null,
  tier_a_model text not null,
  slack_channel_id text,
  slack_post_times jsonb not null,
  slack_posts_enabled jsonb not null,
  quiet_periods jsonb not null default '[]'::jsonb,
  updated_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table skill_versions (
  id uuid primary key default gen_random_uuid(),
  version_no integer not null unique,
  body text not null,
  edited_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table proof_points (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  customer_name text,
  text text not null,
  approved boolean not null default false,
  deleted_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- calendar: 'US' prospect federal, 'IN_TEAM' Spendflo India, or an ISO country code override.
create table holidays (
  id uuid primary key default gen_random_uuid(),
  calendar text not null,
  date date not null,
  name text not null,
  source text not null default 'manual' check (source in ('preloaded', 'manual')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar, date)
);

-- ---------------------------------------------------------------------------
-- Campaigns and execution
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id),
  owner_id uuid not null references users (id),
  name text not null,
  objective text,
  angle text,
  job text,
  icp_profile text,
  rationale text,
  discovery_questions jsonb not null default '[]'::jsonb,
  review jsonb not null default '{}'::jsonb,
  review_flags_cleared jsonb not null default '[]'::jsonb,
  status campaign_status not null default 'draft',
  current_version integer not null default 1,
  start_date date,
  paused_at timestamptz,
  paused_working_days integer not null default 0,
  recycle_date date,
  closed_reason text,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open campaign per account at a time.
create unique index campaigns_one_open_per_account on campaigns (account_id)
  where deleted_at is null
    and status in ('draft', 'active', 'paused', 'responded', 'meeting_booked');
create index on campaigns (owner_id, status);

create table campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id),
  version_no integer not null,
  created_by uuid references users (id),
  reason version_reason not null,
  scope plan_scope not null default 'campaign',
  change_summary text,
  claude_input jsonb,
  claude_output jsonb,
  skill_version_id uuid references skill_versions (id),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, version_no)
);

create table contact_tracks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id),
  contact_id uuid not null references contacts (id),
  persona persona,
  track_goal text,
  rationale text,
  start_trigger_type start_trigger_type not null default 'fixed',
  trigger_from_contact_id uuid references contacts (id),
  trigger_step_index integer,
  delay_working_days integer,
  start_date date,
  assignee_id uuid references users (id),
  status track_status not null default 'not_started',
  pause_reason text,
  current_step_no integer not null default 0,
  total_steps integer not null default 0,
  last_touch_at timestamptz,
  next_step_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id),
  check (start_trigger_type <> 'fixed' or start_date is not null)
);
create index on contact_tracks (status);

create table steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id),
  track_id uuid not null references contact_tracks (id),
  version_no integer not null,
  sequence_no integer not null,
  contact_id uuid not null references contacts (id),
  assignee_id uuid references users (id),
  channel step_channel not null,
  scheduled_date date,                           -- null only while a trigger track waits
  original_date date,                            -- as Claude proposed
  due_date date,
  moved_from_date date,
  moved_reason text,
  offset_working_days integer,                   -- trigger tracks, before the trigger fires
  subject text,
  body text,
  original_body text,
  sent_body text,
  call_script text,
  send_window_start time,
  send_window_end time,
  status step_status not null default 'upcoming',
  skip_reason text,
  snooze_count integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references users (id),
  outcome_note text,
  call_outcome call_outcome,
  gmail_draft_id text,
  gmail_thread_id text,
  gmail_message_id text,
  linkedin_accepted_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, version_no, sequence_no),
  check (scheduled_date is not null or offset_working_days is not null),
  check (status <> 'done' or completed_at is not null)
);
create index steps_today_idx on steps (assignee_id, due_date) where status in ('upcoming', 'due', 'overdue') and deleted_at is null;
create index on steps (contact_id, scheduled_date);
create index on steps (campaign_id, status);
-- One Gmail draft per step, always.
create unique index steps_one_draft on steps (gmail_draft_id) where gmail_draft_id is not null;
create index on steps (gmail_thread_id) where gmail_thread_id is not null;

create table responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns (id),
  track_id uuid references contact_tracks (id),
  step_id uuid references steps (id),
  account_id uuid references accounts (id),
  contact_id uuid references contacts (id),      -- null for an unknown sender at the account domain
  channel step_channel not null,
  received_at timestamptz not null,
  source response_source not null,
  classification response_class,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  needs_review boolean not null default false,
  summary text,
  raw_text text,
  return_date date,
  referred_to text,
  suggested_next_step text,
  owner_next_step text,
  from_address citext,
  gmail_message_id text unique,
  state response_state not null default 'pending',
  confirmed_by uuid references users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on responses (state, received_at desc);
create index on responses (campaign_id);

alter table do_not_contact
  add constraint do_not_contact_source_response_fk foreign key (source_response_id) references responses (id);

create table replan_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id),
  scope plan_scope not null,
  track_id uuid references contact_tracks (id),
  response_id uuid references responses (id),
  claude_output jsonb,
  state replan_state not null default 'open',
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index replan_one_open on replan_drafts (campaign_id) where state = 'open';

create table activity_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references users (id),          -- null = system job
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index on activity_log (entity_type, entity_id, at desc);
create index on activity_log (actor_id, at desc);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create table data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  sheet_tab text not null,
  sheet_row integer,
  sheet_key text,
  issue_type text not null,
  details text,
  status dq_status not null default 'open',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dq_one_open_issue on data_quality_issues (sheet_tab, coalesce(sheet_key, ''), issue_type) where status = 'open';

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'sheet',
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status sync_status not null default 'running',
  counts jsonb not null default '{}'::jsonb,
  error text,
  triggered_by uuid references users (id)
);
create index on sync_runs (started_at desc);

create table claude_calls (
  id uuid primary key default gen_random_uuid(),
  call_type claude_call_type not null,
  account_id uuid references accounts (id),
  campaign_id uuid references campaigns (id),
  response_id uuid references responses (id),
  model text,
  skill_version_id uuid references skill_versions (id),
  status claude_call_status not null default 'queued',
  attempts integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cost_usd numeric(10, 4),
  error text,
  raw_output text,
  duration_ms integer,
  requested_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on claude_calls (status, created_at) where status in ('queued', 'running');
create index on claude_calls (created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  type text not null,
  entity_type text,
  entity_id uuid,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc) where read_at is null;

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  name text not null,
  filters jsonb not null,
  is_last_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index saved_views_one_last_used on saved_views (user_id) where is_last_used;

create table slack_posts (
  id uuid primary key default gen_random_uuid(),
  post_type text not null,
  for_date date not null,
  user_id uuid references users (id),            -- thread reply per person, null for the parent
  dedupe_key text not null default '',            -- e.g. response id for reply alerts
  channel_ts text,
  created_at timestamptz not null default now()
);
create unique index slack_posts_once on slack_posts (post_type, for_date, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key);

-- ---------------------------------------------------------------------------
-- updated_at triggers on every table that has the column
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;
