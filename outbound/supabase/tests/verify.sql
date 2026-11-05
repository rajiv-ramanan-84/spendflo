-- Assertions run after migrations + seed on a fresh database. Any failure raises.
\set ON_ERROR_STOP on

-- Fixtures (as superuser)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rajiv@spendflo.com'),
  ('22222222-2222-2222-2222-222222222222', 'mahasweta@spendflo.com'),
  ('99999999-9999-9999-9999-999999999999', 'stranger@spendflo.com');
update users set auth_user_id = '11111111-1111-1111-1111-111111111111', google_refresh_token_enc = 'secret' where email = 'rajiv@spendflo.com';
update users set auth_user_id = '22222222-2222-2222-2222-222222222222', active = false where email = 'mahasweta@spendflo.com';

insert into accounts (id, sheet_account_id, name, tier, icp_verdict, owner_id)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'ACC-001', 'Cortland', 'A', 'fit', id from users where email = 'rajiv@spendflo.com';
insert into contacts (id, account_id, sheet_contact_key, full_name, persona, email)
  values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ACC-001:priya', 'Priya Shah', 'procurement_leader', 'priya@cortland.com');
insert into campaigns (id, account_id, owner_id, name)
  select 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', id, 'Cortland | Redlining' from users where email = 'rajiv@spendflo.com';
insert into contact_tracks (id, campaign_id, contact_id, start_trigger_type, start_date)
  values ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'fixed', '2026-11-06');
insert into steps (campaign_id, track_id, version_no, sequence_no, contact_id, channel, scheduled_date, due_date, gmail_draft_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1, 1, 'cccccccc-0000-0000-0000-000000000001', 'email', '2026-11-06', '2026-11-06', 'draft-1');

do $$
declare n int;
begin
  -- Seed
  select count(*) into n from users; assert n = 4, 'seed: 4 users';
  select count(*) into n from users where role = 'admin'; assert n = 2, 'seed: 2 admins';
  select count(*) into n from app_settings; assert n = 1, 'seed: settings singleton';

  -- One open campaign per account
  begin
    insert into campaigns (account_id, owner_id, name)
      select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'dup' from users limit 1;
    raise exception 'FAIL: second open campaign allowed';
  exception when unique_violation then null;
  end;
  -- ...but a closed one is fine
  insert into campaigns (account_id, owner_id, name, status)
    select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'old', 'closed_no_response' from users limit 1;

  -- One Gmail draft per step
  begin
    insert into steps (campaign_id, track_id, version_no, sequence_no, contact_id, channel, scheduled_date, gmail_draft_id)
      values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1, 2, 'cccccccc-0000-0000-0000-000000000001', 'email', '2026-11-10', 'draft-1');
    raise exception 'FAIL: duplicate gmail draft allowed';
  exception when unique_violation then null;
  end;

  -- A step needs a date or a trigger offset
  begin
    insert into steps (campaign_id, track_id, version_no, sequence_no, contact_id, channel)
      values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1, 3, 'cccccccc-0000-0000-0000-000000000001', 'call');
    raise exception 'FAIL: undated step allowed';
  exception when check_violation then null;
  end;

  -- Done needs completed_at
  begin
    update steps set status = 'done' where gmail_draft_id = 'draft-1';
    raise exception 'FAIL: done without completed_at';
  exception when check_violation then null;
  end;

  -- Global DNC is unique per email
  insert into do_not_contact (email, reason) values ('Priya@Cortland.com', 'unsubscribe');
  begin
    insert into do_not_contact (email, reason) values ('priya@cortland.com', 'again');
    raise exception 'FAIL: duplicate DNC email (case-insensitive) allowed';
  exception when unique_violation then null;
  end;

  -- updated_at trigger fires
  update accounts set name = 'Cortland Inc' where sheet_account_id = 'ACC-001';
  select count(*) into n from accounts where sheet_account_id = 'ACC-001' and updated_at > created_at;
  assert n = 1, 'updated_at trigger';
end $$;

-- RLS: active user reads everything
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  select count(*) into n from accounts; assert n = 1, 'active user reads accounts';
  select count(*) into n from users; assert n = 4, 'active user reads team';
  select count(*) into n from steps; assert n = 1, 'active user reads steps';
  begin
    insert into accounts (sheet_account_id, name) values ('ACC-X', 'x');
    raise exception 'FAIL: browser write allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform google_refresh_token_enc from users;
    raise exception 'FAIL: token column readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- RLS: deactivated user reads nothing
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare n int;
begin
  select count(*) into n from accounts; assert n = 0, 'deactivated user reads no accounts';
  select count(*) into n from steps; assert n = 0, 'deactivated user reads no steps';
end $$;

-- RLS: signed in but not on the team
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
declare n int;
begin
  select count(*) into n from accounts; assert n = 0, 'stranger reads nothing';
end $$;

-- anon gets nothing at all
reset request.jwt.claim.sub;
set role anon;
do $$
begin
  perform 1 from accounts;
  raise exception 'FAIL: anon can read accounts';
exception when insufficient_privilege then null;
end $$;
reset role;

\echo 'ALL SCHEMA CHECKS PASSED'
