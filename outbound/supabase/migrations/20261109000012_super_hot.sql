-- Four levels: super hot (2 signals within 90 days, start within 24 hours), hot (2 within 180 days,
-- start within 48 hours), warm (1 within 90 days) and nurture. Each account remembers when it
-- reached its level and the date its first activity is due.

alter table accounts drop constraint if exists accounts_play_level_check;
alter table accounts add constraint accounts_play_level_check check (play_level in ('super_hot', 'hot', 'warm', 'nurture', 'not_fit'));
alter table campaigns drop constraint if exists campaigns_play_level_check;
alter table campaigns add constraint campaigns_play_level_check check (play_level in ('super_hot', 'hot', 'warm', 'nurture', 'not_fit'));

alter table accounts
  add column if not exists level_since timestamptz,
  add column if not exists start_by date,
  add column if not exists play_cooling boolean not null default false;
