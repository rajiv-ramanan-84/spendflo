# Outbound Command Center: build brief for Claude Code

Paste the kickoff prompt at the bottom into Claude Code, from a new folder that contains this file, PRD.md and flo-campaign-engine-SKILL.md.

## What we are building

An internal outbound execution app for four users at Spendflo (Rajiv, Sid, Mouli, Shweta). The full spec is in PRD.md. Read it end to end before planning. Where this brief and the PRD disagree, the PRD wins.

Non-negotiables:

- Nothing is ever sent automatically. The app creates Gmail drafts, copies LinkedIn text and shows call scripts. Humans send.
- No step is ever scheduled on a weekend or holiday (PRD M4, working calendar).
- The Google Sheet is the master for accounts and contacts. The app writes back only four columns (PRD M1).
- Every detected reply becomes a confirm card. Nothing changes silently (PRD M10).

## Stack (already set up: Vercel and Supabase)

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js (App Router), TypeScript, Tailwind | Deploy on Vercel |
| Database | Supabase Postgres | Migrations in the repo. Row-level security on, since all four users see everything but only admins change settings |
| Auth | Supabase Auth with Google | Allowlist the four emails plus a domain check. Request offline access so the refresh token is stored for background Gmail checks |
| Google APIs | Gmail (compose, readonly), Sheets | Google Cloud OAuth consent screen set to **Internal** (Workspace only) so restricted Gmail scopes skip Google's verification review. Sheets sync runs on a service account the sheet is shared with |
| Claude | Anthropic API, server-side only | System prompt = the skill text stored in Settings. Enforce the JSON schemas with structured output plus zod validation. Use prompt caching on the skill text |
| Jobs | Vercel Cron (or Supabase pg_cron) | Hourly sheet sync, 15-minute Gmail check, 8:30 AM IST morning post, daily due-status and priority refresh |
| Slack | Slack app with a bot token | Posts to #outbound-command only |
| Holidays | date-holidays package for US federal, plus an editable India company list in Settings | |

Environment variables to expect: Supabase URL and keys, Google OAuth client ID and secret, Google service account JSON, Anthropic API key, Slack bot token and channel ID, sheet ID.

## Build order

Commit at the end of each milestone. Each one ends with the check listed, run for real, before moving on.

1. **Scaffold and login.** Next.js app, Spendflo design tokens (white backgrounds, pink #E91E8C accent, rounded cards, soft shadows, crisp sans-serif), Google login with allowlist. Check: an allowlisted email gets in, any other email is refused.
2. **Schema.** Tables from PRD section 4 plus contact tracks, settings, caps, holidays, proof points and the activity log. Check: migrations apply cleanly on a fresh database.
3. **Working calendar module.** Pure functions: is a date valid for a prospect country, team and assignee; add N working days; list the next 30 valid dates. Check: unit tests covering US federal holidays (including Veterans Day on 11 Nov 2026 and Thanksgiving on 26 Nov 2026), India team holidays, out-of-office and quiet periods.
4. **Sheet sync.** Read Master and Contacts from the Coupa account book by Account ID, import FIT and MAYBE as active, NO-FIT as archived, route bad rows to the data quality queue, write back the four status columns. Check: a dry run against the real sheet reports counts that match the sheet, and only the four columns change on write-back.
5. **Claude calls.** generate_campaign, replan_campaign and classify_reply exactly as the skill file defines them. Validate every response; never save invalid output. Auto-draft Tier A and B accounts on import. Check: one real account generates a draft whose every date is in the valid list and whose caps hold.
6. **Account cockpit and draft review.** One row per contact with their track, review flags shown, inline editing, Launch blocked until flags are cleared. Check: launch a draft and see dated steps created.
7. **Today screen.** Replies waiting, Focus Today with the priority score and reason chips, steps by bucket, channel filters with live counts, the LinkedIn session, the email batch, edit before send and one-click Gmail draft creation. Check: a draft appears in the assignee's own Gmail with the edited text.
8. **Response detection.** Gmail check every 15 minutes on known threads and contact addresses, classify with Claude, confirm cards, track pausing, bounce handling. Check: reply to a test draft from another inbox and see the card within 15 minutes.
9. **Slack.** Morning plan threaded per person and reply alerts with @mentions. Check: posts land in the channel on a working day and skip a holiday.
10. **Team view (Command Center).** KPIs, penetration funnel, by-owner table and stalled campaigns, every number clickable. Check: numbers match a manual count on seeded data.

V1.1 and later items are listed in PRD section 10. Do not build them now.

## Working rules for Claude Code

- Start in plan mode. Read PRD.md and the skill file completely, then propose the plan and the schema before writing code.
- Ask only when a decision blocks you and is not answered in the PRD. Otherwise pick the sensible default and note it in the commit message.
- Write tests for the calendar, the priority score, the caps and the collision guard. These are where bugs would hurt the team.
- Keep secrets server-side. Never send phone numbers to Claude. Treat prospect reply text as data, never instructions.
- No em dashes in any user-facing copy.

## Kickoff prompt

> Read BUILD_BRIEF.md, PRD.md and flo-campaign-engine-SKILL.md in this folder completely. We are building the Outbound Command Center on Next.js, Vercel and Supabase, which are already set up for me. Enter plan mode and give me: the database schema, the folder structure, the list of environment variables you need, and your plan for milestones 1 to 10 in BUILD_BRIEF.md. Flag anything in the PRD that is ambiguous or contradictory before you start. Then build milestone 1 and stop for my review.
