-- Scheduled jobs. Generated copy for go-live: go-live/02-schedules.sql.
-- Uses pg_cron + pg_net so it works on any Vercel plan.
-- Replace __APP_URL__ and __CRON_SECRET__ first. Times are UTC (IST = UTC+5:30).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app_call(path text) returns void language sql as $$
  select net.http_post(
    url := '__APP_URL__' || path,
    headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$;

-- Daily due-status and priority refresh: 00:35 IST
select cron.schedule('occ-daily', '5 19 * * *', $$select app_call('/api/cron/daily')$$);
-- Hourly sheet sync
select cron.schedule('occ-sheet-sync', '7 * * * *', $$select app_call('/api/cron/sheet-sync')$$);
-- Gmail sent and reply check: every 15 minutes, around the clock (US prospects reply overnight IST)
select cron.schedule('occ-gmail-check', '*/15 * * * *', $$select app_call('/api/cron/gmail-check')$$);
-- Morning plan: the route waits for the post time in Settings (8:30 IST),
-- skips weekends and US holidays, and posts once. Runs 8:30 to 10:00 IST to catch up if missed.
select cron.schedule('occ-morning-post', '0,15,30,45 3-4 * * 1-5', $$select app_call('/api/cron/morning-post')$$);
-- Drafts: every 5 minutes, send queued drafts to Claude as one half-price
-- batch and save any finished ones. A Generate click sends at once; this
-- also picks up drafts queued by the sheet sync, so they are ready within ~15 minutes.
select cron.schedule('occ-drafts', '*/5 * * * *', $$select app_call('/api/cron/claude-batch')$$);
