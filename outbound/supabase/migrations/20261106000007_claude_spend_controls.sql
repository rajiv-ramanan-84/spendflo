-- Claude spend controls.
-- auto_draft: which new accounts a sheet sync drafts on its own.
--   'off' = only when someone clicks Generate (default), 'a' = Tier A, 'ab' = Tier A and B.
-- claude_monthly_budget_usd: drafts and re-plans pause once this month's
--   Claude spend reaches it. Reply sorting keeps running.
alter table app_settings add column if not exists auto_draft text not null default 'off' check (auto_draft in ('off', 'a', 'ab'));
alter table app_settings add column if not exists claude_monthly_budget_usd numeric(10, 2) not null default 50 check (claude_monthly_budget_usd >= 0);
