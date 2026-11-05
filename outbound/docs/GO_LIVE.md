# Go live checklist

All 10 milestones are built and tested locally against the real account book. These steps connect the real services. Roughly 60 to 90 minutes for one person.

## 1. Supabase (15 min)

1. Create a project (region: Mumbai or Singapore).
2. SQL editor: run every file in `supabase/migrations` in order, then `supabase/seed.sql`, `seed_holidays.sql` (US federal, which the team follows) and `seed_skill.sql` (the campaign skill plus the outbound reference docs).
3. Copy the URL, anon key and service role key into Vercel.

## 2. Google (25 min)

1. Google Cloud project, OAuth consent screen set to **Internal** (spendflo.com only).
2. OAuth client (web). Scopes: `openid email profile`, `gmail.compose`, `gmail.readonly`. Redirect: the Supabase callback URL.
3. Paste the same client ID and secret into Supabase Auth > Providers > Google.
4. Service account with the Sheets API on. Share **Coupa_Account_Book** with its email as Editor. Paste the JSON key into `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. `TOKEN_ENCRYPTION_KEY`: run `openssl rand -base64 32`.

## 3. Claude (2 min)

`ANTHROPIC_API_KEY` from the Console. Sonnet drafts by default and Opus drafts Tier A, as the PRD specifies.

## 4. Slack (10 min)

1. Create a Slack app, bot scope `chat:write`, install to the workspace. Copy the bot token into `SLACK_BOT_TOKEN`.
2. Create `#outbound-command`, then `/invite` the bot.
3. In the app: Settings > Slack. Paste the channel ID and each person's member ID, then press **Send test post**.

## 5. Vercel (10 min)

1. Import the repo, root directory `outbound`.
2. Add every variable in `.env.example`. `CRON_SECRET`: `openssl rand -hex 32`. `NEXT_PUBLIC_SITE_URL`: the production URL.
3. Deploy.

## 6. Schedules (5 min)

Open `supabase/schedule.sql`, replace `<APP_URL>` and `<CRON_SECRET>`, and run it in the Supabase SQL editor. This works on any Vercel plan.

## 7. First run

1. Everyone signs in once with Google. That connects their Gmail for drafts and reply detection.
2. Run the sheet sync from the Accounts page. Expect 118 accounts: 81 active, 36 archived, 1 duplicate.
3. Pick one Tier A account, generate, review, launch. Check Today the next morning.

## Still needed from the team

| Item | Owner | Why |
| --- | --- | --- |
| Any extra company days off beyond US federal holidays | Rajiv | Loaded as TEAM days so steps and the morning post skip them (one SQL insert until the holidays screen is built) |
| Approved proof points | Rajiv, Sid | Claude only cites what is on this list |
| Clean up 12 duplicate and 15 CHECK rows, and confirm personas | Mouli | Cleaner sync and better track choices |
