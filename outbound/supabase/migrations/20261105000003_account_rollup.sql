-- One row per account with the values written back to the sheet and used by
-- lists and the Command Center. Read-only; recomputed on every query.

create or replace view account_rollup
with (security_invoker = true) as
with current_campaign as (
  -- The open campaign if there is one, else the most recent.
  select distinct on (c.account_id)
    c.account_id, c.id as campaign_id, c.status
  from campaigns c
  where c.deleted_at is null
  order by c.account_id,
    (c.status in ('draft', 'active', 'paused', 'responded', 'meeting_booked')) desc,
    c.created_at desc
),
touches as (
  select s.campaign_id,
    max(s.completed_at)::date as last_touch,
    min(s.due_date) filter (where s.status in ('upcoming', 'due', 'overdue')) as next_step_date
  from steps s
  where s.deleted_at is null
  group by s.campaign_id
),
people as (
  select ct.account_id,
    count(*) filter (where not ct.exclude and not ct.do_not_contact and ct.sheet_deleted_at is null) as contacts_total,
    count(*) filter (where ct.engagement_status in ('replied', 'meeting')) as contacts_engaged
  from contacts ct
  where ct.deleted_at is null
  group by ct.account_id
)
select
  a.id as account_id,
  a.sheet_account_id,
  cc.campaign_id,
  cc.status as campaign_status,
  t.last_touch,
  t.next_step_date,
  coalesce(p.contacts_engaged, 0)::int as contacts_engaged,
  coalesce(p.contacts_total, 0)::int as contacts_total
from accounts a
left join current_campaign cc on cc.account_id = a.id
left join touches t on t.campaign_id = cc.campaign_id
left join people p on p.account_id = a.id
where a.deleted_at is null;

grant select on account_rollup to authenticated;
