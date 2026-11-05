-- The team follows the US federal calendar, not the India list.
-- calendar values: 'US' federal (prospects and team), 'TEAM' extra company
-- days, or an ISO country code override for prospects elsewhere.
update holidays set deleted_at = now() where calendar = 'IN_TEAM' and deleted_at is null;
comment on column holidays.calendar is 'US federal (prospects and team), TEAM extra company days, or an ISO country code';
