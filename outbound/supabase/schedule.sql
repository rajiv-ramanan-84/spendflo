-- Scheduled jobs (PRD section 14). Run once in the Supabase SQL editor after
-- deploy. Uses pg_cron + pg_net so it works on any Vercel plan.
-- Replace <APP_URL> and <CRON_SECRET> first. Times are UTC (IST = UTC+5:30).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app_call(path text) returns void language sql as $$
  select net.http_post(
    url := '<APP_URL>' || path,
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$;

-- Daily due-status and priority refresh: 00:35 IST
select cron.schedule('occ-daily', '5 19 * * *', $$select app_call('/api/cron/daily')$$);
-- Hourly sheet sync
select cron.schedule('occ-sheet-sync', '7 * * * *', $$select app_call('/api/cron/sheet-sync')$$);
-- Gmail sent and reply check: every 15 minutes, 7 AM to 11 PM IST, Mon to Fri
select cron.schedule('occ-gmail-check', '*/15 1-17 * * 1-5', $$select app_call('/api/cron/gmail-check')$$);
-- Morning plan: the route waits for the post time set in Settings (8:30 IST
-- by default), skips weekends and team holidays, and posts once a day.
-- Calling every 15 minutes from 8:30 to 10:00 IST lets a missed run catch up.
select cron.schedule('occ-morning-post', '0,15,30,45 3-4 * * 1-5', $$select app_call('/api/cron/morning-post')$$);
-- Claude queue (bulk generation)
select cron.schedule('occ-claude-queue', '*/5 * * * *', $$select app_call('/api/cron/claude-queue')$$);
