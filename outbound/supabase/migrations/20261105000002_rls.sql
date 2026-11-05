-- Row-level security.
--
-- Model: one shared truth. Every active user reads every business table.
-- Nobody writes from the browser. All mutations go through server route
-- handlers that check role and ownership in code, write the activity log,
-- and use the service role (which bypasses RLS). See PLAN.md section 2.

create schema if not exists app;

-- The app user behind the current Supabase session, if active.
create or replace function app.current_user_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id from public.users u
  where u.auth_user_id = auth.uid() and u.active
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.active)
$$;

create or replace function app.current_role_is(roles user_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.active and u.role = any (roles)
  )
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Grants: anon gets nothing; authenticated reads only; service_role does writes.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Tokens never leave the server: column-level grant on users excludes them.
revoke select on users from authenticated;
grant select (id, auth_user_id, email, name, role, active, timezone, slack_user_id, avatar_url,
              google_token_status, last_login_at, created_at, updated_at)
  on users to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;

  -- Shared-truth tables: every active user reads everything.
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ('notifications', 'saved_views')
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (app.is_active_user())',
      t || '_read_active', t
    );
  end loop;
end $$;

-- Personal tables: each user reads only their own.
create policy notifications_read_own on notifications for select to authenticated
  using (user_id = app.current_user_id());
create policy saved_views_read_own on saved_views for select to authenticated
  using (user_id = app.current_user_id());
