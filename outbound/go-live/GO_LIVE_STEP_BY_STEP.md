# Go live: step by step

About 2 hours, start to finish. Everything runs on free plans except Claude. Do it in order: later steps use values from earlier ones.

Keep a scratch note open (1Password secure note is ideal). Every time a step says **Save**, paste the value there.

## The files

| File | Used in | What it is |
| --- | --- | --- |
| `01-database.sql` | Step 1.4 | Creates the whole database: tables, security, the 4 of you, US holidays, the skill |
| `vercel-environment-variables.env` | Steps 1 to 6 | Your settings for Vercel. Two secrets are already generated. Private. |
| `02-schedules-READY.sql` | Step 7 | Turns on the timed jobs (Gmail check, sync, morning post, drafts). Private. |
| `slack-app-manifest.yaml` | Step 3.1 | Creates the Slack bot in one paste |

The two private files were sent to you directly and are not in GitHub. Do not post them in Slack or email.

## What it costs per month

| Service | Plan | Cost |
| --- | --- | --- |
| Vercel (hosting) | Hobby (free) | $0 |
| Supabase (database) | Free | $0 |
| Google Cloud (sign-in, Gmail, Sheets) | Free | $0 |
| Slack | Your current plan, free works | $0 |
| GitHub | Your current plan | $0 |
| Claude | Pay as you go, $150 cap | About $15 to $40. Claude has no free API plan. |

### What free means in practice

- **Vercel Hobby** allows each request up to 5 minutes. The app is built to stay well inside that: drafts are written in the background, so no request waits on Claude for long. One thing to know: Vercel's terms say Hobby is for personal, non-commercial use. An internal tool for Spendflo may count as commercial. If Vercel ever asks, moving to Pro ($20/month) is one click and needs no change to the app.
- **Supabase Free** pauses a project after 7 days with no activity. The app's 15-minute Gmail check keeps it active, so this should not happen. If it ever does, open Supabase and click **Restore project**; no data is lost.
- **Supabase Free has no backups.** Accounts and contacts can always be re-synced from the sheet. Campaigns, replies and history live only in the database, so download a backup once a month (step 8.8).
- **Slack free** keeps 90 days of channel history. Old alerts disappear from Slack; everything stays in the app.

---

## Step 1. Supabase, the database (15 min)

1.1 Go to **supabase.com** and sign in (use Google with your spendflo.com account).

1.2 Click **New project**.
- Organization: Spendflo (create it if asked)
- Name: `spendflo-outbound`
- Database password: click **Generate a password**. **Save** it.
- Region: **East US (North Virginia)**. This sits next to Vercel's servers, which keeps the app fast.
- Click **Create new project** and wait about 2 minutes until the dashboard loads.

1.3 Stay on the **Free** plan. Nothing to change here.

1.4 Create the database.
- Left menu: **SQL Editor**, then **New query** (the + button).
- Open `01-database.sql` in any text editor (TextEdit, Notepad, VS Code). Select all, copy.
- Paste into the query box and click **Run** (bottom right).
- You should see **Success. No rows returned**. If you see an error, stop and send me a screenshot.

1.5 Check it worked: left menu **Table Editor > users**. You should see 4 rows: Rajiv, Sid, Mouli, Shweta.

1.6 Copy the keys: left menu **Project Settings** (gear) **> API Keys**. If you see two tabs, open **Legacy API keys**.
- **Project URL** (on the **Data API** page if it is not shown here): put it in the env file as `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role secret** key (click Reveal): `SUPABASE_SERVICE_ROLE_KEY`. Treat this like a password.

1.7 Get the sign-in callback address: left menu **Authentication > Sign In / Providers > Google**. Copy the **Callback URL** (it looks like `https://abcdxyz.supabase.co/auth/v1/callback`). **Save** it. Do not turn Google on yet; close the panel.

---

## Step 2. Google Cloud: sign-in, Gmail and the sheet (25 min)

Do this signed in as a spendflo.com Google Workspace admin, or someone allowed to create Google Cloud projects.

2.1 Go to **console.cloud.google.com**. Top bar: click the project picker, then **New project**.
- Name: `spendflo-outbound`. Organization: spendflo.com. Click **Create**.
- When it finishes, make sure the project picker shows `spendflo-outbound`.

2.2 Turn on the two APIs. Search bar at the top: type **Gmail API**, open it, click **Enable**. Then search **Google Sheets API** and click **Enable**.

2.3 Set up the sign-in screen. Search **Google Auth Platform** (or go to **APIs & Services > OAuth consent screen**) and click **Get started**.
- App name: `Outbound Command Center`
- User support email: your email
- Audience: **Internal**. This matters: it limits sign-in to spendflo.com and avoids Google's review.
- Contact email: your email. Accept and click **Create**.

2.4 Allow Gmail access. In Google Auth Platform, open **Data Access > Add or remove scopes**. Scroll to **Manually add scopes** and paste these two lines:

```
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.readonly
```

Click **Add to table**, then **Update**, then **Save**. The app only ever creates drafts and reads replies. It never sends.

2.5 Create the sign-in client. Open **Clients > Create client**.
- Application type: **Web application**. Name: `Outbound app`
- **Authorized JavaScript origins > Add URI**: `https://spendflo-outbound.vercel.app`
- **Authorized redirect URIs > Add URI**: the Supabase Callback URL from step 1.7
- Click **Create**. Copy the **Client ID** into `GOOGLE_OAUTH_CLIENT_ID` and the **Client secret** into `GOOGLE_OAUTH_CLIENT_SECRET`.

2.6 Create the robot account that reads the sheet. Search **Service Accounts** and click **Create service account**.
- Name: `outbound-sheet-sync`. Click **Create and continue**, skip the roles, click **Done**.
- Click the new account, then the **Keys** tab, then **Add key > Create new key > JSON > Create**. A `.json` file downloads. **Save** it in 1Password and keep the file for step 6.4.
- Copy the account's email (ends in `@spendflo-outbound.iam.gserviceaccount.com`).
- If you see "Service account key creation is disabled", your Google admin needs to allow it for this one project: **IAM & Admin > Organization policies > Disable service account key creation > Manage policy > Override > Off**.

2.7 Share the sheet with it. Open **Coupa_Account_Book** in Google Sheets and click **Share**. Paste the service account email, choose **Editor**, untick **Notify people**, then **Share**. Editor is needed because the app writes back the IDs and the four status columns.

2.8 Turn on Google sign-in in Supabase. Back in Supabase: **Authentication > Sign In / Providers > Google**. Switch it on, paste the Client ID and Client secret from 2.5, and click **Save**.

2.9 Tell Supabase where the app lives. **Authentication > URL Configuration**.
- Site URL: `https://spendflo-outbound.vercel.app`
- Redirect URLs > **Add URL**: `https://spendflo-outbound.vercel.app/**`
- Click **Save**.

---

## Step 3. Slack (10 min)

3.1 Go to **api.slack.com/apps** and click **Create New App > From a manifest**. Pick the Spendflo workspace, choose **YAML**, paste the contents of `slack-app-manifest.yaml`, then **Next > Create**.

3.2 Left menu **Install App > Install to Workspace > Allow**. If it says admin approval is needed, ask your Slack admin to approve it.

3.3 Left menu **OAuth & Permissions**. Copy the **Bot User OAuth Token** (starts with `xoxb-`) into `SLACK_BOT_TOKEN`.

3.4 In Slack, create a channel called `#outbound-command` and add the team. In the channel, type `/invite @Outbound Command Center` and press Enter. Then click the channel name at the top; at the bottom of the **About** tab, copy the **Channel ID** (starts with `C`) into `SLACK_CHANNEL_ID`.

3.5 For each of the 4 of you: click their name in Slack, then **⋯ > Copy member ID**. **Save** these four. You paste them into the app in step 8.

---

## Step 4. Claude key (5 min)

4.1 Ask finance for a fresh key named `outbound-prod` (the Slack message I wrote earlier). Put it in `ANTHROPIC_API_KEY`.

4.2 Revoke the key you pasted in our chat: at **platform.claude.com > API keys**, find it and choose **Delete** or **Disable**. It has been in a chat transcript, so treat it as used.

---

## Step 5. Put the app on the main branch (2 min)

The app is on the branch `outbound-command-center`. Vercel deploys `main`.

5.1 Open: **https://github.com/rajiv-ramanan-84/spendflo/compare/main...outbound-command-center**

5.2 Click **Create pull request**, then **Create pull request** again, then **Merge pull request > Confirm merge**. It merges cleanly: nothing on `main` conflicts. The app lives in its own `outbound` folder and does not touch anything else in the repo.

Or just tell me "merge it" and I'll do it.

---

## Step 6. Vercel, the hosting (15 min)

6.1 Go to **vercel.com** and **Sign up / Log in with GitHub**, using the GitHub account that can see `rajiv-ramanan-84/spendflo`. Choose the **Hobby** (free) plan when asked.

6.2 Click **Add New > Project**. Find `spendflo` in the list and click **Import**. If it is not listed, click **Adjust GitHub App Permissions** and give Vercel access to that repository.

6.3 On the configure screen:
- **Project Name**: `spendflo-outbound` exactly. The address `spendflo-outbound.vercel.app` comes from this name. (If Vercel says the name is taken, see the note at the end.)
- **Framework Preset**: Next.js (detected automatically)
- **Root Directory**: click **Edit**, choose **outbound**, then **Continue**

6.4 Open **Environment Variables**.
- Open your filled-in `vercel-environment-variables.env`, check no `PASTE_` values are left, select all and copy.
- Click into the first **Key** box and paste. Vercel splits it into one row per setting.
- Add one more row by hand. Key: `GOOGLE_SERVICE_ACCOUNT_JSON`. Value: open the `.json` file from step 2.6, select everything, copy, and paste it into the Value box. Many lines is fine.

6.5 Click **Deploy** and wait about 3 minutes for the confetti.

6.6 Open `https://spendflo-outbound.vercel.app`. You should see the pink Outbound Command Center sign-in page.

---

## Step 7. Turn on the schedules (3 min)

7.1 Supabase: **SQL Editor > New query**. Paste all of `02-schedules-READY.sql` and click **Run**. You should see a small table of results and no errors.

7.2 Check it: left menu **Integrations > Cron** (or **Database > Cron Jobs**). You should see 5 jobs starting with `occ-`.

From now on:
- The Gmail check runs every 15 minutes, around the clock.
- The sheet syncs every hour.
- Drafts are written in the background every 5 minutes. New Tier A and B accounts from the sheet get a draft within about 15 minutes of a sync.
- The morning plan posts at 8:30 IST on working days. Weekends and US holidays are skipped.

---

## Step 8. First sign-in and setup (20 min)

8.1 **Rajiv**: open the app, click **Continue with Google**, and allow Gmail access. You land on **Today**.

8.2 **Settings > Slack**: paste the four member IDs from step 3.5 and click **Save**, then **Send test post**. Check `#outbound-command`.

8.3 **Settings > Claude campaign skill**: it shows **Version 1**. This is where you upload your edited skill later.

8.4 **Accounts > Sync now**. Expect about 81 active accounts and 36 archived. New Tier A and B accounts are queued for drafts, which land over the next 15 minutes or so.

8.5 Try one draft now. Open **Xylem** and click **Generate campaign**. A "Claude is writing this campaign" card appears; the draft lands in 5 to 10 minutes and the page refreshes on its own. Review the flags and the copy.

8.6 **Sid, Mouli and Shweta** each open the app once and sign in with Google. This connects their Gmail for drafts and reply detection. Until they do, the app cannot create drafts in their mailbox.

8.7 Tomorrow at 8:30 IST: the morning plan in Slack, with new drafts waiting in Today.

8.8 Once a month (put it in your calendar): **Settings > Backup > Download backup**, and save the file to a Google Drive folder.

---

## If something goes wrong

| You see | Fix |
| --- | --- |
| Google: "Access blocked" or "Error 403: org_internal" | The person is not on spendflo.com, or 2.3 was not set to Internal |
| Google: "Error 400: redirect_uri_mismatch" | The redirect URI in 2.5 must match the Supabase Callback URL from 1.7 exactly |
| Sign-in loops back to the sign-in page | Recheck 2.9: Site URL and the Redirect URL ending in `/**` |
| "Your account is not linked to the team list" | The email is not one of the four in the database. Use the exact spendflo.com address. |
| Sync now: "permission" or "not found" | 2.7: share the sheet with the service account email as Editor |
| Slack test post: "The bot is not in that channel" | 3.4: `/invite @Outbound Command Center` in the channel |
| Vercel build fails | Root Directory must be `outbound` (6.3). Send me the build log if not. |
| No morning post | Supabase **Integrations > Cron**: open `occ-morning-post` and check its last run. Weekends and US holidays are skipped on purpose. |

**If `spendflo-outbound` was taken in 6.3:** use the address Vercel gave you everywhere this guide says `spendflo-outbound.vercel.app`. That's 2.5 (origin), 2.9 (both URLs), the `NEXT_PUBLIC_SITE_URL` variable in Vercel, and `02-schedules-READY.sql`. Or send me the address and I'll regenerate the files.
