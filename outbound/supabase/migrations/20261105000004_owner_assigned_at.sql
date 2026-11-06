-- When the current owner got the account. Drives the "Not started" priority
-- reason (assigned 2+ working days with no campaign launched).
alter table accounts add column owner_assigned_at timestamptz;
update accounts set owner_assigned_at = created_at where owner_id is not null;

create or replace function set_owner_assigned_at() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    new.owner_assigned_at := case when new.owner_id is null then null else now() end;
  end if;
  return new;
end $$;

create trigger accounts_owner_assigned_at before update of owner_id on accounts
  for each row execute function set_owner_assigned_at();

create or replace function set_owner_assigned_at_insert() returns trigger
language plpgsql as $$
begin
  if new.owner_id is not null and new.owner_assigned_at is null then new.owner_assigned_at := now(); end if;
  return new;
end $$;

create trigger accounts_owner_assigned_at_insert before insert on accounts
  for each row execute function set_owner_assigned_at_insert();
