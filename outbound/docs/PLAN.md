# Outbound Command Center: build plan

Companion to PRD.md, BUILD_BRIEF.md and flo-campaign-engine-SKILL.md. Where this plan and the PRD disagree, the PRD wins unless the decision is listed under "Decisions taken" below.

## 1. Where the app lives

The `spendflo` repo already holds the budget service at the root. The Outbound Command Center is a self-contained Next.js app in `outbound/` with its own `package.json`, migrations and tests. On Vercel, create a new project from this repo with **Root Directory = `outbound`**. Nothing in the budget service is touched.

## 2. Database schema (Supabase Postgres)

All ids are `uuid default gen_random_uuid()`. Every table has `created_at` and `updated_at`. Nothing is hard-deleted: tables that can be removed carry `deleted_at`.

### People and access

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | id, auth_user_id (fk auth.users, null until first login), email (unique), name, role (`admin` / `manager` / `member`), active, timezone (default Asia/Kolkata), slack_user_id, google_refresh_token_enc, google_token_status (`ok` / `expired` / `missing`) | The allowlist. Seeded with the four users. Admins add or deactivate from Settings |
| `user_out_of_office` | user_id, start_date, end_date, note | Feeds the calendar validator |

### Account book

| Table | Key columns | Notes |
| --- | --- | --- |
| `accounts` | sheet_account_id (unique, join key), name, domain, segment, tier (A to D), icp_verdict, owner_id, status, archived, revenue, employees, hq, ownership, coupa_evidence, trigger, trigger_date, signals, disqualifier_flags, outreach_angle, target_contact_notes, do_not_contact, sheet_owner_hint, sheet_deleted_at, last_synced_at, custom_fields jsonb, priority_score, priority_reasons jsonb, priority_computed_at | NO-FIT imports with archived = true |
| `contacts` | account_id, sheet_contact_key, full_name, title, persona, seniority, email, email_status, phone, linkedin_url, country, timezone, linkedin_signals jsonb, notes, engagement_status, exclude, do_not_contact, bounced, changed_flag, sheet_deleted_at | Phone never leaves the server to Claude |
| `do_not_contact` | email, linkedin_url, reason, source_response_id, created_by | Global list. Sync checks it on every run so nothing reactivates |
| `account_pins` | user_id, account_id | Manual pin to Focus Today |

### Campaigns and execution

| Table | Key columns | Notes |
| --- | --- | --- |
| `campaigns` | account_id, owner_id, name, objective, angle, job, icp_profile, rationale, discovery_questions jsonb, review jsonb, review_flags_cleared jsonb, status (draft / active / paused / responded / meeting_booked / closed_no_response / disqualified / recycle), current_version, start_date, paused_at, paused_working_days, recycle_date, closed_reason | Partial unique index: one non-closed campaign per account |
| `campaign_versions` | campaign_id, version_no, created_by, reason (initial / response / manual_edit), scope (campaign / track), change_summary, claude_input jsonb, claude_output jsonb, skill_version_id, model | Full audit of every plan |
| `contact_tracks` | campaign_id, contact_id, persona, track_goal, rationale, start_trigger_type (fixed / after_step / after_reply / manual), trigger_from_contact_id, trigger_step_index, delay_working_days, start_date, assignee_id, status (not_started / active / paused / replied / meeting / completed / stopped), pause_reason, current_step_no, total_steps, last_touch_at, next_step_at | One per contact per campaign |
| `steps` | campaign_id, track_id, version_no, sequence_no, contact_id, assignee_id, channel, scheduled_date, original_date, due_date, moved_from_date, moved_reason, offset_working_days (trigger tracks before they fire), subject, body, original_body, sent_body, call_script, send_window_start, send_window_end, status (upcoming / due / overdue / done / skipped / superseded), skip_reason, completed_at, completed_by, outcome_note, call_outcome, gmail_draft_id, gmail_thread_id, gmail_message_id, linkedin_accepted_at | Unique (step_id) on gmail_draft_id guarantees one draft per step |
| `responses` | campaign_id, track_id, step_id, contact_id, channel, received_at, source (detected / manual), classification, confidence, needs_review, summary, raw_text, return_date, referred_to, suggested_next_step, from_address, gmail_message_id (unique), state (pending / confirmed / dismissed), confirmed_by, confirmed_at | Detected replies wait as `pending` until a human confirms |
| `replan_drafts` | campaign_id, scope, track_id, response_id, claude_output jsonb, state (open / stale / applied / discarded) | A reply arriving while one is open flips it to `stale` |
| `activity_log` | entity_type, entity_id, action, actor_id, before jsonb, after jsonb, at | Written by every mutation |

### Settings and operations

| Table | Key columns | Notes |
| --- | --- | --- |
| `app_settings` | singleton row: sheet_id, caps jsonb, priority_weights jsonb, default_model, tier_a_model, slack_channel_id, slack_post_times jsonb, slack_posts_enabled jsonb, quiet_periods jsonb | Admin-only write |
| `skill_versions` | version_no, body, edited_by | Current skill = highest version |
| `proof_points` | label, customer_name, text, approved | Only approved rows reach Claude |
| `holidays` | calendar (`US` / `IN_TEAM` / ISO country), date, name, source (preloaded / manual) | US preloaded from date-holidays for 2026 and 2027 |
| `data_quality_issues` | sheet_tab, sheet_row, sheet_key, issue_type, details, status (open / resolved / ignored) | The review queue |
| `sync_runs` | started_at, finished_at, status, counts jsonb, error | Header shows the latest |
| `claude_calls` | call_type, account_id, campaign_id, model, skill_version_id, status (queued / running / ok / invalid / failed), attempts, input_tokens, output_tokens, cost_usd, error, raw_output | Retry, bulk queue and monthly spend |
| `notifications` | user_id, type, entity_type, entity_id, read_at | In-app badges |
| `saved_views` | user_id, name, filters jsonb, last_used | Today filters |
| `slack_posts` | post_type, for_date, channel_ts | Idempotency so a cron retry never double-posts |

### Row-level security

- Read: any authenticated user whose `users.active = true` can read every business table (shared truth).
- Write: all mutations go through server route handlers and server actions that check role and ownership in code, write the activity log in the same transaction, then use the service role. RLS denies direct client writes. This keeps permission logic and logging in one place.
- `app_settings`, `skill_versions`, `proof_points`, `holidays`: admin only.
- Token columns (`google_refresh_token_enc`) are never selectable by the client.

## 3. Folder structure

```
outbound/
  docs/                      PRD, brief, skill, this plan
  supabase/
    migrations/              SQL migrations, applied in order
    seed.sql                 four users, settings defaults, holidays
  src/
    proxy.ts                 session refresh and auth redirect (Next 16)
    app/
      login/                 Google sign-in
      auth/callback/         code exchange, allowlist gate, token capture
      auth/signout/
      (app)/                 signed-in shell with nav
        today/
        accounts/
        accounts/[id]/       account cockpit
        accounts/[id]/campaign/  builder, draft review, re-plan diff
        team/                Command Center
        settings/            users, claude, calendar, caps, slack, data
      api/
        cron/                sheet-sync, gmail-check, morning-post, daily-refresh
        steps/ campaigns/ responses/ ...
    lib/
      auth/                  allowlist, session, roles
      supabase/              server, browser and admin clients
      calendar/              pure working-day functions
      priority/              pure scoring
      caps/                  pure cap and collision guard
      claude/                client, zod schemas, payload builders
      google/                gmail, sheets
      sheet-sync/
      slack/
      activity/
    components/
      ui/                    button, card, chip, avatar, channel icon
  tests/                     vitest for calendar, priority, caps, collisions, allowlist
```

## 4. Environment variables

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server auth client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only writes, cron jobs |
| `NEXT_PUBLIC_SITE_URL` | OAuth redirect base |
| `ALLOWED_EMAILS` | Comma list. Bootstrap allowlist until the `users` table exists (M2) |
| `ALLOWED_DOMAIN` | `spendflo.com` |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Refreshing user Gmail tokens server-side (also set inside Supabase Auth) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sheet sync and write-back |
| `GOOGLE_SHEET_ID` | Coupa_Account_Book (Settings can override) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM for stored Google refresh tokens |
| `ANTHROPIC_API_KEY` | Claude calls |
| `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` | #outbound-command |
| `CRON_SECRET` | Authenticates cron calls |

## 5. Milestones

Each milestone ends with a commit and its check run for real.

| # | Milestone | What gets built | Check |
| --- | --- | --- | --- |
| 1 | Scaffold and login | Next.js 16, Tailwind 4, Spendflo tokens, app shell (Today, Accounts, Team, Settings), Supabase Google login, allowlist plus domain gate in callback and on every request | Allowlist unit tests pass; non-allowlisted session is signed out and refused; build passes. Live Google test once Supabase keys are in |
| 2 | Schema | All tables above, enums, indexes, RLS, seed. Allowlist moves from env to `users` | `supabase db reset` on a fresh database applies cleanly |
| 3 | Working calendar | `isValidDate`, `addWorkingDays`, `nextValidDate`, `listValidDates(30)`, pause and resume shifts | Unit tests: Veterans Day 11 Nov 2026, Thanksgiving 26 Nov 2026, India team holidays, OOO, quiet periods |
| 4 | Sheet sync | Read Master and Contacts by Account ID, FIT and MAYBE active, NO-FIT archived, data quality queue, DNC protection, four-column write-back, dry-run mode | Dry run counts match the sheet; write-back diff shows only four columns |
| 5 | Claude calls | `generate_campaign`, `replan_campaign`, `classify_reply` with zod validation, one auto-retry, date re-check, caps check, prompt caching, auto-draft Tier A and B | One real account drafts with every date valid and caps holding |
| 6 | Cockpit and draft review | Contact rows with tracks, review flags, inline edit, Launch gated on flags | Launching creates dated steps |
| 7 | Today | Replies, Focus Today with priority score, buckets, filter chips with counts, LinkedIn session, email batch, edit before send, Gmail drafts | Draft appears in the assignee's Gmail with edited text |
| 8 | Response detection | 15-minute Gmail check, classify, confirm cards, track pausing, bounce and OOO handling | Reply from another inbox shows a card within 15 minutes |
| 9 | Slack | Morning plan threaded per person, reply alerts with @mentions, calendar-aware | Posts on a working day, skips a holiday |
| 10 | Command Center | KPI strip, funnel, by-owner table, campaigns in motion, stalled, drill-down | Numbers match a manual count on seeded data |

Tests are mandatory for calendar, priority score, caps and the collision guard.

## 6. Ambiguities and contradictions found

These are flagged with the default I will use. Anything marked **Need from you** blocks a later milestone, not milestone 1.

1. **Repo location.** Brief says "new folder". This repo already has the budget service. Default: `outbound/` subfolder, separate Vercel project.
2. **Cron frequency on Vercel.** The 15-minute Gmail check and hourly sync need Vercel Pro (Hobby is daily only, which this repo already hit). Default: Supabase `pg_cron` plus `pg_net` calling our `/api/cron/*` routes with `CRON_SECRET`. Works on any Vercel plan.
3. **Function timeouts.** Claude generation can take up to 60 seconds and bulk runs longer. Default: `maxDuration = 300` on Claude routes and a `claude_calls` queue drained by cron, so the request never waits on a bulk run.
4. **Email length.** PRD says flag above 150 words; skill says write under 100. Default: Claude aims for 100, the app flags above 150, never blocks.
5. **Output schema.** PRD example lacks `job`, `icp_profile`, `discovery_questions`, `review` and `offset_working_days`. Brief says follow the skill file exactly. Default: skill schema is the contract.
6. **Persona list.** PRD has 7 personas; skill adds `contract_manager`. Default: skill list (superset) everywhere.
7. **Contact status scale.** Section 4 lists 5 states; cockpit and Section 12 add Stopped. Default: 6 states including Stopped.
8. **Which replies pause a track.** PRD says positive and objection auto-pause. Default: not_now and referral also pause; neutral does not; auto_reply only shifts dates; unsubscribe and wrong_person stop.
9. **Sheet access.** M1 says admin's Google login; brief and Section 11 say service account. Default: service account.
10. **"Today" time zone.** Steps are dated for the prospect but worked from India. Default: Due and Overdue are computed on the assignee's time zone (default IST), the send window shows prospect local time.
11. **Week for caps.** Default: Monday to Sunday calendar week in the prospect's calendar.
12. **valid_working_dates per call.** Validity depends on contact country and assignee OOO, but the skill takes one list. Default: send dates valid on US prospect plus India team calendars, plus each user's OOO dates in `team`; the app re-validates per step on import and rolls forward with a "moved from" note.
13. **Gmail scope "limited to known contacts".** Google cannot narrow `gmail.readonly`. Default: the app only queries threads it created and `from:` known contact addresses or LinkedIn senders. That is a code guarantee, not a scope guarantee. Worth saying plainly to the team.
14. **Manager and Settings.** Mouli cannot edit admin settings but uses the Data queue inside Settings. Default: Settings shows the Data tab to managers, everything else admin only.
15. **Google refresh token.** Supabase returns it only at sign-in. Default: request offline access with consent each login, capture it in the callback, encrypt and store it (from milestone 2, once the table exists). Gmail scopes are requested from day one so nobody has to re-consent later.
16. **Need from you: emails for Sid, Mouli and Shweta.** I have rajiv@spendflo.com. Default in `.env.example`: sid@, mouli@, shweta@spendflo.com.
17. **Need from you: India company holiday list** for 2026 and 2027 (milestone 3).
18. **Need from you: sheet shared with the service account** and Mouli's cleanup (Account ID, Persona) done before milestone 4's real dry run.
19. **Need from you: Anthropic key and the approved proof points** before milestone 5. Defaults: Sonnet for all tiers, Opus for Tier A.
20. **Penetration definition** stays as written (reply or meeting, not a LinkedIn accept) until you say otherwise.
