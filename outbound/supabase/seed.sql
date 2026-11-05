-- Seed: the four launch users and default settings. Safe to re-run.
-- Holidays are loaded in milestone 3 from date-holidays (US) plus the India list.

insert into users (email, name, role) values
  ('rajiv@spendflo.com',        'Rajiv',  'admin'),
  ('siddharth@spendflo.com',    'Sid',    'admin'),
  ('chandramouli@spendflo.com', 'Mouli',  'manager'),
  ('mahasweta@spendflo.com',    'Shweta', 'member')
on conflict (email) do update set role = excluded.role;

insert into app_settings (
  id, caps, priority_weights, default_model, tier_a_model,
  slack_post_times, slack_posts_enabled, quiet_periods
) values (
  true,
  -- PRD section 11 defaults
  '{
    "touches_per_contact_per_day": 1,
    "touches_per_contact_per_week": 3,
    "touches_per_account_per_week": 6,
    "steps_per_person_per_day": 25,
    "linkedin_connects_per_person_per_week": 80,
    "linkedin_connect_warn_ratio": 0.8,
    "email_word_flag": 150,
    "linkedin_connect_max_chars": 300,
    "close_after_last_step_working_days": 5,
    "recycle_after_days": 90
  }'::jsonb,
  -- PRD owner view 1 defaults
  '{
    "reply_waiting": 40,
    "overdue": 20,
    "due_today": 15,
    "tier_a": 30,
    "tier_b": 20,
    "tier_c": 10,
    "warm_accepted": 10,
    "new_trigger": 10,
    "not_started": 10,
    "going_cold": 5
  }'::jsonb,
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  '{"morning": "08:30", "scoreboard": "18:30", "timezone": "Asia/Kolkata"}'::jsonb,
  '{"morning": true, "reply_alert": true, "linkedin_accept": false, "scoreboard": false, "friday_wrap": false}'::jsonb,
  '[{"name": "Year end", "start": "2026-12-24", "end": "2027-01-01", "enabled": false}]'::jsonb
)
on conflict (id) do nothing;
