# Outbound Command Center: PRD

Nov 5, 2026 · @Rajiv Ramanan

## 1. Overview

We are building a lightweight outbound command center for a 4-person founder-led team. It takes an enriched account book, assigns accounts to owners, turns a Claude skill's campaign plan into a tracked multi-step, multi-persona sequence, and tells every person exactly what to do today.

Nothing is auto-executed. Humans send every touch. The app's job is to remove the friction between "we know who to hit" and "it actually went out today", and to give everyone the same view of what is in motion.

**The problem today**

- Account research and campaign thinking live in Claude, execution lives in people's heads and inboxes.
- A campaign into one account spans 3 to 6 people over 2 to 3 weeks. Steps slip and nobody sees it.
- When a prospect replies, the rest of the sequence goes stale and there is no clean way to re-plan.
- No shared view of penetration across the account book.

**What good looks like (first 60 days after launch)**

| Metric | Target |
| --- | --- |
| Assigned accounts with a live campaign | 90%+ within 48 hours of assignment |
| Steps completed on or before due date | 85%+ |
| Time from reply logged to re-planned sequence | Under 10 minutes |
| Time to send an email step (open to sent) | Under 60 seconds |
| Daily active users | 4 of 4 on working days |

**Guiding principles**

1. Today first. The default screen is "what do I do today", not a database.
2. One click to act. Every step has a primary button that moves it forward.
3. Claude plans, humans execute. The app stores the plan, the human owns the send.
4. One shared truth. Everyone sees every campaign. No private spreadsheets.

## 2. Users, roles and access

Four users at launch. Everyone owns accounts, everyone executes, everyone sees the central dashboard. The only difference is admin rights.

| User | Role | App role | Owns accounts | Can assign accounts | Can edit admin settings |
| --- | --- | --- | --- | --- | --- |
| Rajiv | CRO | Admin | Yes | Yes | Yes |
| Sid | CEO | Admin | Yes | Yes | Yes |
| Mouli | Head of BDR | Manager | Yes | Yes | No |
| Shweta | AE | Member | Yes | No | No |

**Authentication**

- Google sign-in only (OAuth). No passwords.
- Access restricted to an allowlist of the four emails above, plus a domain check on the company Google Workspace domain.
- Admins can add or deactivate users from Settings. Deactivating reassigns open steps to a chosen owner.

**Visibility**

- All users see all accounts, campaigns and dashboards. No data is hidden by owner.
- Edit rights: an owner edits their own accounts and steps. Admins and Manager can edit anything. Any user can mark a step done on behalf of someone else, which is logged with their name.

**Design for scale (not built now)**

Keep a role field on the user so we can add more BDRs later without a rebuild. No team hierarchy needed in v1.

## 3. Core workflow end to end

One loop runs every account: plan once with Claude, execute daily, and re-plan the moment a prospect responds.

&#91;embedded content: outbound workflow · 8 steps, 1 decision, 1 re-plan loop\]

1. **Sync** the account book from the Google Sheet (hourly).
2. **Assign** accounts to Rajiv, Sid, Mouli or Shweta, in bulk or one by one.
3. **Generate** the campaign with the Claude skill. It lands as a draft: one track per contact, real dates, channels, assignees, full content.
4. **Review and launch.** Owner edits anything, then launches. Every step keeps its working-day date.
5. **Execute.** Each person works from the Today screen. Email = one-click Gmail draft. LinkedIn and calls = copy, open, mark done.
6. **Reply?** If no reply, the next step comes due as planned.
7. **Confirm the response.** The app detects email replies and shows a confirm card; LinkedIn and call responses take one tap to log. That contact's track pauses.
8. **Re-plan with Claude.** Owner reviews a side-by-side diff, accepts, and a new version replaces the open steps. Back to Execute.

The Command Center reads every step, response and version, so everyone sees the same picture without asking.

## 4. Data model

Nine core objects, including Contact Track. A campaign belongs to one account and has versions, so every re-plan is traceable.

| Object | Key fields | Notes |
| --- | --- | --- |
| **User** | id, name, email, role (admin / manager / member), active | Created on first Google login if on allowlist |
| **Account** | id, sheet\_account\_id (join key), name, domain, tier (A to D), icp\_verdict, owner\_id, status, revenue, employees, HQ, coupa\_evidence, trigger, signals, outreach\_angle, target\_contact\_notes, do\_not\_contact, last\_synced\_at, custom\_fields (JSON) | Research fields mirror the sheet; custom\_fields keeps any extra column |
| **Contact** | id, account\_id, full name, title, persona (Economic buyer, Procurement leader, Coupa or system owner, Legal, Finance or AP, Champion, Other), email, email\_status, phone, linkedin\_url, country, timezone, engagement\_status, exclude, do\_not\_contact (global, survives re-sync), bounced | One account has many contacts |
| **Campaign** | id, account\_id, owner\_id, name, objective, angle / hook, status (Draft, Active, Paused, Responded, Meeting Booked, Closed No Response, Disqualified, Recycle (with a re-engage date)), current\_version, start\_date | One active campaign per account at a time |
| **Campaign Version** | id, campaign\_id, version\_no, created\_by, reason (Initial, Response, Manual edit), claude\_input, claude\_output (raw JSON), skill\_version, model, created\_at | Full audit trail of every re-plan |
| **Step** | id, campaign\_id, track\_id, version\_no, scheduled\_date (absolute calendar date, always a working day), original\_date (as Claude proposed), due\_date, sequence\_no, channel (Email, LinkedIn Connect, LinkedIn Message, LinkedIn InMail, Call, Other), contact\_id, assignee\_id, subject, body (current, after edits), original\_body (Claude draft), sent\_body (as actually sent from Gmail), call\_script, send\_window (prospect local time), status (Upcoming, Due, Overdue, Done, Skipped, Superseded), completed\_at, completed\_by, gmail\_draft\_id, outcome\_note | The unit everything is tracked on |
| **Response** | id, campaign\_id, track\_id, step\_id (optional), contact\_id, channel, received\_at, source (Detected or Manual), classification (Positive, Neutral, Objection, Not now, Referral, Wrong person, Unsubscribe, Auto-reply, Bounce), confidence, summary, raw\_text, confirmed\_by | Triggers the re-plan flow |
| **Activity Log** | id, entity\_type, entity\_id, action, actor\_id, before, after, timestamp | Every change, for the manager view and trust |

**Rules**

- `due_date` is the step's scheduled\_date. Claude proposes real dates; the app validates them against the working calendar (M4) and never schedules a weekend or holiday.
- A step is **Due** on its due date, **Overdue** after it, until marked Done or Skipped.
- When a campaign is re-planned, all not-yet-done steps from the old version become **Superseded**. Done steps are never touched.
- Contact engagement\_status rolls up from steps and responses: Not contacted, Contacted, Connected (LinkedIn accepted), Replied, Meeting.

**Campaign structure: one account play, one track per contact**

A campaign is the account-level play (the angle and objective). Inside it, every contact gets their own **Contact Track** with its own start date, cadence, steps and status. Tracks run on different timelines: the Coupa system owner can start Day 1, the VP Procurement on Day 5 once there is a warm signal, and the CFO only after a reply.

| Object | Key fields | Notes |
| --- | --- | --- |
| **Contact Track** | id, campaign\_id, contact\_id, persona, track\_goal, start\_trigger (Fixed date, After another track's step, After a reply, Manual), start\_date, assignee\_id, status (Not started, Active, Paused, Replied, Meeting, Completed, Stopped), current\_step\_no, total\_steps, last\_touch\_at, next\_step\_at | One per contact in the campaign. Steps hang off the track |

- A track can wait on another track ("start CFO track 2 days after VP Procurement replies"). The app starts it automatically when the condition is met and notifies the owner.
- A reply on one track pauses only that track by default. The owner decides whether other tracks pause too.
- Re-plan can change one track or the whole campaign.

## 5. Functional requirements by module

### M1. Account book sync (Google Sheet is the master)

The Coupa Account Book Google Sheet stays the master for research and contacts. The app syncs from it and writes back a light status update. The app owns everything about execution.

**Source today:** Coupa\_Account\_Book (owner: Mouli). Master tab with 118 accounts and 31 research columns. A Contacts (Wiza + Evaboot) tab with roughly 530 contacts. Per-owner tabs for Rajiv, Sid and Mouli.

**Who owns what**

| Data | Owned by | Direction |
| --- | --- | --- |
| Account research (firmographics, Coupa evidence, triggers, signals, disqualifiers, outreach angle, target contact notes) | Sheet | Sheet to app |
| Contacts (name, title, email, phone, LinkedIn, email status) | Sheet | Sheet to app |
| Initial owner and tier | Sheet on first import, then app | Sheet to app once |
| Campaigns, contact tracks, steps, responses, edits | App | App only |
| Status, Last Touch, Next Step Date, Contacts Engaged | App | App to sheet (write-back) |

**Sync behaviour**

- Admin connects the sheet once in Settings by pasting its link. The app reads with the admin's Google access.
- Hourly auto sync plus a **Sync now** button. Last sync time and result are shown in the header.
- Sheet changes to research fields overwrite the app. App-owned fields are never touched by the sync.
- New rows in the sheet create new accounts or contacts. Rows deleted in the sheet are flagged in the app, never auto-deleted (campaign history is kept).
- Write-back touches only four app-owned columns in Master: Status, Last Touch, Next Step Date, Contacts Engaged. No other cell is ever written.
- Only accounts with ICP Verdict FIT or MAYBE are imported as active. NO-FIT (mostly Tier D) are imported as archived for reference.

**Sheet cleanup before go-live (one-time, Mouli)**

- [ ] Add an **Account ID** column to Master (stable, never changes, for example ACC-001).
- [ ] Add **Account ID** to every row in Contacts. This is the join key. Company name is not used for matching.
- [ ] Move Target contacts notes and Outreach angle notes from the per-owner tabs into Master as columns, then retire the per-owner tabs.
- [ ] Add a **Persona** column to Contacts (Economic buyer, Procurement leader, Coupa or system owner, Legal, Finance or AP, Champion). The skill uses this to shape each contact's track.
- [ ] Remove or mark duplicates (GameStop appears twice with different verdicts; some contacts repeat).
- [ ] Mark Retired or wrong-company contacts as Exclude.
- [ ] Add the four write-back columns to Master if missing.

**Data quality queue**

Rows the sync cannot trust go to a review queue instead of importing silently: missing Account ID, duplicate LinkedIn URL, email domain not matching the account domain, title containing Retired, no email and no LinkedIn. The queue shows on the Admin page with fix-in-sheet links.

### M2. Account assignment

- Account list with filters: segment, tier, owner, unassigned, campaign status, signal keyword.
- Bulk select and assign to an owner. Single reassign from the account page.
- Reassigning an account moves its open steps to the new owner, with an option to keep specific persona steps with the original person (for example Sid keeps the CEO-to-CFO touch).
- Assignment notifies the new owner in-app and by email digest.

### M3. Campaign generation (Claude skill)

- From an account, the owner clicks **Generate campaign**.
- The app sends the account and its contacts, plus optional owner notes, to Claude with the configured skill (see Section 7).
- Claude returns a structured campaign. The app shows it as a draft timeline: date by date, contact by contact, channel, assignee, full content.
- The owner can edit any step inline (content, date, channel, assignee), add or delete steps, then click **Launch**.
- Bulk generate: select up to 20 accounts and generate drafts in one go. Each lands in Draft for review. Nothing launches without a human click.
- No manual import step in the everyday flow. If a Claude call fails, the owner sees the error with a Retry button.

**Persona-aware generation**

- Claude gets every contact on the account with their persona, title, seniority and LinkedIn signals (new role, recent posts, mutual connections), plus the account's angle notes.
- It returns **one track per contact**, each written for that persona's job, not one message cloned across people.
- Default persona playbooks, which the skill can override:

| Persona | What they care about | Typical track |
| --- | --- | --- |
| Economic buyer (CFO, CPO, SVP) | Cost, risk, speed to value | Short. Starts after a lower-level touch or a warm signal. Founder-sent where possible |
| Procurement leader (VP or Director) | Cycle time, renewals, team capacity | Main thread. LinkedIn connect, 2 to 3 emails, 1 call |
| Coupa or system owner | Adoption, admin load, integrations | Starts Day 1. Practical, "works on top of Coupa" angle |
| Legal or contracts | Redlining backlog, turnaround time | Only when the angle is contract review |
| Finance or AP | Invoice accuracy, leakage, close speed | Only when the angle is AP |

- Claude also suggests the **order and timing** between tracks (who starts first, who waits for a signal) and the **assignee** per track, for example Sid on the economic buyer.
- Contacts marked Exclude, or with no email and no LinkedIn, are skipped and listed so the owner knows why.
- The owner can add or remove a contact from the campaign and ask Claude to generate just that one track.

**New accounts added to the sheet**

Claude never watches the sheet. The app does, and decides when to call Claude.

1. The hourly sync finds a new row in Master. If it is FIT or MAYBE, has an owner and has at least one usable contact, it is imported as active.
2. **Tier A and B:** the app calls `generate_campaign` automatically and saves the result as a **Draft**. Nothing launches without the owner.
3. **Tier C:** the account lands with a "Not started" chip and a Generate button. This keeps spend on Claude where it matters.
4. The owner sees it in Focus Today with a "New, draft ready" chip, and the Slack morning post lists new accounts by owner.
5. Accounts with no owner go to an Unassigned queue for Mouli. Accounts with no usable contacts go to the data quality queue.

The same rule covers a new contact added to an account that already has a live campaign: the app drafts just that contact's track for the owner to approve.

### M4. Campaign tracker

- Launching a campaign creates every step on the dates Claude proposed (after calendar validation). From then on the app owns the schedule: follow-ups surface on the Today screen on their dates, and any shift (pause, snooze, reply, re-plan) is recalculated in working days.
- Steps can be assigned to anyone, not only the account owner. Example: Rajiv owns the account, Sid sends the founder email on Tue 10 Nov.
- Each step shows: due date, channel icon, persona, assignee, status, preview of content, primary action button.
- Campaign controls: Pause (freezes due dates), Resume (shifts remaining steps by the working days paused), Close with outcome.

**Working calendar (must have)**

No step is ever scheduled on a weekend or a holiday. This applies to Claude's first cut, every re-plan, pause and resume, snooze, and every "start after a reply" trigger.

| Calendar | Default | Why |
| --- | --- | --- |
| Prospect calendar | US federal holidays (all current accounts are US HQ), Saturday and Sunday off. Per-contact country override for non-US contacts | Don't land in an inbox on Thanksgiving |
| Team calendar | Spendflo company holidays (India) | The sender must be working that day |
| Personal out-of-office | Set per user in Settings | Steps for that person move, or prompt a reassign |
| Quiet periods (optional) | For example 24 Dec to 1 Jan, toggle on or off | Year-end inboxes are dead |

- A valid date is a working day on the prospect calendar **and** the team calendar **and** the assignee is not out of office.
- Every gap is counted in **working days**. "2 days after a reply" means 2 working days.
- If a date fails, it rolls forward to the next valid working day and the step shows a small "moved from" note with the original date.
- Snooze offers +1, +2 or +3 working days. Pause and resume shift remaining steps by the working days lost.
- Admins maintain holiday lists in Settings, preloaded for the current and next year (for example US Thanksgiving on 26 Nov 2026 and Christmas on 25 Dec 2026).

### M5. Step execution

| Channel | Primary action | Secondary actions | How it is marked done |
| --- | --- | --- | --- |
| Email | **Create Gmail draft** in the assignee's Gmail, then **Open in Gmail** | Copy subject + body, Open in mail client (mailto), Send now from app (V2) | Auto when Gmail shows it sent (thread check), or manual Mark done |
| LinkedIn Connect | **Copy note + Open profile** in a new tab | Edit note (300 char limit enforced) | Manual Mark done; later Mark accepted |
| LinkedIn Message / InMail | **Copy message + Open profile** | Edit | Manual Mark done |
| Call | **Show script** with tap-to-call number | Log outcome (Connected, Voicemail, No answer) | Logging an outcome marks done |
| Other (gift, event invite, video) | **Show instructions** | Attach link | Manual Mark done |

- Every step has a full content preview before action, with personalisation tokens resolved (first name, company, title).
- Skip a step with a reason. Snooze a step by 1, 2 or 3 working days.
- Completing a step logs who, when, and an optional one-line outcome note.

**Edit before send (every channel)**

The person sending always has the final word on the words. Every email, LinkedIn note, LinkedIn message and call script opens in an editor before the action button fires.

- **Inline editor** with the Claude draft pre-filled: subject and body for email, note for LinkedIn, script and talking points for calls.
- **Live checks while typing:** LinkedIn connect note character count (300 max), email word count (flag above 150), unresolved tokens like {first\_name}, and links.
- **Rewrite helpers:** Shorter, Warmer, More direct, Add proof point, Rewrite for this persona. Each calls Claude and shows the new version next to the old one. The user picks one.
- **Save edits** keeps the change on the step. The original Claude draft is kept in history so we can learn what owners change.
- **Apply to similar steps** (optional): push the same edit to later steps in the same track.
- The Gmail draft, copy-to-clipboard and call script all use the **edited** version, never the original.
- Edits are logged (who, when, before and after) in the activity log.

### M6. Response handling and re-plan

- **Log response** button on the account, the campaign, and every step. Fields: contact, channel, sentiment, paste of the reply, owner's view of the next step (free text).
- Logging a positive or objection response auto-pauses that contact's track. Unsubscribe or Wrong person stops that track and sets do-not-contact, which survives every future sheet sync.
- Owner clicks **Re-plan with Claude**. The app sends the original campaign, completed steps, the response and the owner's note.
- Claude returns a revised plan. The app shows a **side-by-side diff**: steps kept, changed, removed, added.
- Owner accepts all, accepts some, or edits, then clicks **Apply**. A new Campaign Version is saved, old open steps become Superseded, new steps are created with fresh due dates.
- Manual re-plan without Claude is always allowed (edit steps directly). It also saves a version.

### M7. Today (the home screen for every user)

- Default landing page. One screen, three blocks top to bottom: Replies waiting, Focus Today accounts, then today's steps grouped into **Overdue**, **Today**, **Tomorrow**, **This week**.
- Sorted by account tier, then due date. Each row is one click to act.
- Header strip: steps due today, done today, overdue, replies awaiting action.
- **Replies awaiting re-plan** block at the top so responses never sit.

**Filters and channel blocks on Today**

People work in blocks: LinkedIn in one sitting, emails in the US send window, calls in a power hour. Today lets them slice the day the same way.

| Filter | Options |
| --- | --- |
| Channel | LinkedIn (connect and message), Email, Call, Other |
| When | Overdue, Today, Tomorrow, This week |
| Account | Any of my accounts, or one account |
| Tier | A, B, C |
| Persona | Economic buyer, Procurement leader, System owner, and so on |
| Whose steps | Mine (default), a teammate's, whole team |

- Filter chips sit at the top of Today with live counts, for example "LinkedIn 14 · Email 9 · Call 3". One tap filters.
- Each channel filter has a matching **session** button that runs the filtered list back to back:
  - **LinkedIn session:** copy note, open profile, mark done, next.
  - **Email batch:** create every filtered draft in Gmail in one click, then review them in Gmail.
  - **Call block:** script, tap to call, log outcome, next.
- **Work ahead:** when today's list is clear, the user can pull this week's steps for the same channel forward. The app only allows it when the contact gap and weekly caps (Section 11) still hold, and later steps in that track shift to keep their spacing.
- **Saved views:** a filter can be saved, for example "Tier A LinkedIn". The last-used filter is remembered per user.
- Filters never hide replies waiting. That block always stays on top.

### M8. Command Center (everyone sees it)

- Team-level KPIs, penetration, activity by person, campaigns in motion, today's team load (Section 6 and 8).
- Click any number to drill to the underlying list.

### M9. Notifications and shared Slack channel

All team updates go to one shared Slack channel, **#outbound-command**, not individual DMs. Everyone sees the whole motion; ownership stays clear through @mentions.

| Post | When | Content | Phase |
| --- | --- | --- | --- |
| Morning plan | 8:30 AM IST, working days only | Team totals (steps due, replies waiting, overdue, new triggers), then one threaded reply per person with step count and top 3 Focus Today accounts | V1.0 |
| Reply alert | Within 15 min of detection | Account, contact, persona, sentiment, @owner, Open in app button | V1.0 |
| LinkedIn accept | Batched hourly | Who accepted, for whom, the follow-up step it unlocks, @owner | V1.1 |
| End-of-day scoreboard | 6:30 PM IST | Opens with wins (replies, meetings), then done vs due per person, then overdue count rolling to tomorrow | V1.1 |
| Friday wrap | Friday evening | Penetration rate, multi-threaded accounts, meetings booked, best reply of the week | V1.1 |

**Rules for the channel**

- Never post individual step completions. They roll into the scoreboard.
- Never paste a prospect's email text. Post a one-line summary and sentiment; the full reply stays in the app.
- Lead with wins. Overdue shows as a count per person, never a callout.
- Every alert that needs action @mentions the owner and links straight to the step.
- Posts follow the working calendar: no morning post on weekends or team holidays.

**In-app**

- Badge for new assignments, reassigned steps and replies.
- Replies waiting always sit at the top of the Today screen.

**Setup:** a Slack app with a bot posting to one channel, configured in Settings (channel, post times, which posts are on). Each user's Slack handle is mapped to their app user for @mentions.

### M10. Response detection

The app watches for responses itself, through each user's own Google login. It does not rely on anyone's Claude connections. Nothing changes silently: every detected signal becomes a one-tap confirmation card for the owner.

| Signal | How it is captured | What happens | Phase |
| --- | --- | --- | --- |
| Email reply | Checks every 15 min the Gmail threads the app created drafts in, plus any new email from a known contact's address | Claude classifies it. Card: "Replied, looks positive. Re-plan?" On confirm: contact = Replied, track paused, +40 priority, Slack alert | V1.0 |
| Auto-reply or out of office | Same check, classified by Claude | Not counted as a reply. Next step shifts past the return date if one is stated | V1.0 |
| Unsubscribe or wrong person | Same check, classified by Claude | Stops all steps to that contact after owner confirms | V1.0 |
| LinkedIn accept or message | Reads LinkedIn notification emails in Gmail and matches the name to a contact on the owner's accounts | Card: "Accepted by X. Start follow-up?" Low-confidence name matches are shown as suggestions only | V1.1 |
| Meeting booked | A Google Calendar invite that includes a contact's email | Contact = Meeting, campaign status = Meeting Booked | V2 |
| Calls | Manual | Logging the call outcome is the update | V1.0 |

**Fallback:** every step and contact keeps one-tap manual buttons (Accepted, Replied, Meeting) so nothing waits on detection.

**Privacy:** the app only reads messages from or to known contact addresses and LinkedIn notification senders. It never ingests the rest of anyone's inbox. Only the one-line summary leaves the app (to Slack).

**Downstream on confirm:** priority recalculates, the reply moves to the top of Focus Today, Slack posts the alert, and the sheet's Status column updates on the next write-back.

## 6. Screens

Four places in the nav: Today, Accounts, Team (Command Center), Settings. Campaigns live inside each account. The sheet connection and data quality queue live in Settings.

| # | Screen | Who uses it | What it must show |
| --- | --- | --- | --- |
| 1 | **Today** (home: replies, Focus Today, steps) | Everyone | Overdue / Today / Tomorrow / This week buckets, one-click actions, replies awaiting re-plan, personal streak (steps done on time this week) |
| 2 | **Command Center** | Everyone | KPI strip, penetration funnel, activity by person, campaigns in motion table, today's team load, stalled campaigns |
| 3 | **Accounts** | Everyone | Filterable table: account, segment, tier, owner, personas count, personas engaged, campaign status, next step date. Bulk assign, bulk generate |
| 4 | **Account detail** | Owner, managers | The account cockpit (Owner view 2): header, one row per contact with their track, response history, activity log |
| 5 | **Campaign builder / timeline** | Owner | Opened from the account. Date-based swimlane by contact. Each step card: channel, assignee, status, content preview. Inline edit, add step, launch, re-plan with diff view |
| 6 | **Data** (inside Settings) | Admin, Manager | Inside Settings: sheet connection, last sync, data quality queue |
| 7 | **Settings** | Admin | Users, Claude skill and approved proof points, calendars and holidays, daily caps, priority weights, Slack, sheet connection and data quality queue |

**Command Center layout (top to bottom)**

1. KPI strip: Accounts assigned, Campaigns live, Penetration rate, Replies this week, Meetings booked, Steps due today (team), On-time completion %.
2. Penetration funnel: Assigned, Touched, Connected, Engaged, Meeting.
3. By owner: a row per person with accounts, live campaigns, steps due today, overdue, done this week, replies, meetings.
4. Campaigns in motion: account, owner, day X of Y, last touch, next step, status chip. Sort by "needs attention".
5. Stalled: campaigns with overdue steps over 2 days, or replies not re-planned within 24 hours.

**Engagement colours (used everywhere)**

Every contact chip, row and dot uses one colour scale (grey Not contacted, light pink Contacted, pink Connected, green Replied, dark green Meeting). Same colours in the cockpit, the account list and Slack, so nobody has to learn two systems.

### Owner view 1: My Accounts and Focus Today

Every owner opens to a ranked list of their own accounts. The top of the list is what to work today, and each row says why.

**Focus Today (top 10)** sits above the full list. Each card shows the account, the priority score, the reason chips, and the one next action button.

**Priority score (0 to 100), recalculated every morning and after every logged event**

| Driver | Points | Reason chip |
| --- | --- | --- |
| Reply logged, not yet re-planned | +40 | Reply waiting |
| Step overdue | +20 | Overdue |
| Step due today | +15 | Due today |
| Tier A / B / C | +30 / +20 / +10 | Tier A |
| LinkedIn accepted in last 3 days, no follow-up yet | +10 | Warm: accepted |
| New trigger or signal in the sheet in last 14 days | +10 | New trigger |
| Assigned for 2+ days with no campaign launched | +10 | Not started |
| No touch on any contact for 10+ days | +5 | Going cold |

Weights live in Settings so we can tune them after the first month. Owners can **pin** an account to Focus Today manually.

**My Accounts list columns:** Priority, Account, Tier, Contacts engaged (for example 2 of 6), Track progress bar, Last touch, Next step and date, Status, Reason chips. Filters: tier, status, has reply, overdue, not started. Toggle to see the whole team's accounts.

### Owner view 2: Account cockpit (contacts and their tracks)

Opening an account shows every contact as a row, with their own track running on its own timeline. The owner sees penetration per contact at a glance, not just per account.

&#91;embedded content: account cockpit example · 5 contacts, tracks on different timelines\]

Illustrative layout. One reply is waiting for a re-plan, one step is due today, and the CFO track waits for a signal before it starts.

**What each contact row shows**

- Name, title, persona chip, assignee avatar.
- Engagement status chip: Not contacted, Contacted, Connected, Replied, Meeting, Stopped.
- Track timeline: every step as a dot (done, due, upcoming, skipped), with today marked.
- Step X of Y, last touch, next step and date.
- Quick actions: open next step, log response, pause track, re-plan this track.

**Account header:** tier, angle, Coupa evidence, trigger, contacts engaged (2 of 6), multi-threaded yes or no, campaign day, and a **Generate track** button for any contact without one.

## 7. Claude skill integration contract

The app calls the Claude API server-side with our outbound skill loaded as the system prompt, and requires strict JSON back. The skill text lives in Settings so we can improve it without a redeploy.

**Setup (Settings > Claude)**

- Anthropic API key (stored encrypted, server-side only).
- Model selector (default: latest Claude Sonnet; Opus option for Tier A accounts).
- Skill prompt: a large text field where we paste the SKILL.md content (our campaign skill, 30MPC-based). Versioned, with "last edited by".
- Output schema appended automatically to every call. The skill decides the strategy, the app enforces the shape.

**Three calls (one skill: flo-campaign-engine)**

| Call | When | Input sent | Output expected |
| --- | --- | --- | --- |
| `generate_campaign` | Generate campaign button | Account record, all contacts with persona, owner, team members and their load on each date, owner notes, valid working dates, daily caps, approved proof points | Full campaign JSON |
| `replan_campaign` | Re-plan button after a response | Everything above plus current campaign version, completed steps with dates, the response, owner's suggested next step | Revised campaign JSON plus a `change_summary` |

The third call, `classify_reply`, runs on every detected email reply (M10). It receives the reply as quoted data plus the account's known contacts, and returns a classification, a confidence score, a one-line summary, any out-of-office return date or referral, and a suggested next step. Below 0.7 confidence the card shows as Needs review.

The campaign output also carries `job`, `icp_profile`, `rationale` (PULL plus the disqualifying answer), `discovery_questions` and a `review` block (likely reply, main weakness, flags the owner must clear before launch). The app shows `review.flags` on the draft and blocks Launch until each flag is resolved or dismissed.

**Output schema (both calls)**

```json
{
  "campaign_name": "Cortland | Contract review on top of Coupa",
  "objective": "Book a 30 min discovery with the procurement leader",
  "angle": "One-line hook tied to the account signal",
  "generated_on": "2026-11-05",
  "change_summary": "Only on replan: what changed and why",
  "tracks": [
    {
      "contact_ref": "contact_id or email",
      "persona": "procurement_leader",
      "track_goal": "Get a reply that opens a discovery call",
      "start_trigger": { "type": "fixed", "date": "2026-11-06" },
      "assignee": "rajiv | sid | mouli | shweta",
      "rationale": "Why this person, why this order",
      "steps": [
        {
          "date": "2026-11-06",
          "channel": "linkedin_connect",
          "subject": null,
          "body": "Connect note under 300 characters",
          "call_script": null,
          "keep_from_previous": false
        },
        {
          "date": "2026-11-10",
          "channel": "email",
          "subject": "Subject line",
          "body": "Email under 150 words",
          "call_script": null,
          "keep_from_previous": false
        }
      ]
    },
    {
      "contact_ref": "cfo email",
      "persona": "economic_buyer",
      "start_trigger": { "type": "after_reply", "from_contact": "procurement leader email", "delay_working_days": 2 },
      "assignee": "sid",
      "steps": []
    }
  ],
  "skipped_contacts": [
    { "contact_ref": "email", "reason": "Marked Exclude in sheet" }
  ]
}
```

**Validation rules the app enforces**

- `channel` must be one of: email, linkedin\_connect, linkedin\_message, linkedin\_inmail, call, other.
- `contact_ref` must match a contact on the account. An unknown contact is flagged for the owner to fix, never auto-created.
- `assignee` must be an active user. Default to account owner if missing.
- LinkedIn connect body max 300 characters. Email body max 150 words (our Reply Method standard), flagged if over, not blocked.
- Invalid JSON: retry once automatically, then show the owner a Retry button (admins also get the fix box below).

**Dates from Claude, not day numbers**

- Every call sends today's date, the campaign start date (default: next working day), the assignee list, and the list of **valid working dates for the next 30 working days**. Claude picks from that list.
- Claude returns an ISO date (YYYY-MM-DD) on every step and every fixed track start. No "Day 1, Day 3".
- Re-plan sends the re-plan date as today, so new dates start from that day forward. Completed steps keep their original dates.
- The app re-checks every date on import. A date that is not a valid working day is moved to the next valid one and flagged in the draft review, before launch.
- Trigger-based starts (after a reply, after another track's step) return a working-day delay, not a date. The app sets the real date when the trigger fires.

**Admin fallback**

Admins only: if a call returns invalid JSON twice, the raw output can be corrected in a fix box and imported. This is a safety net, not part of the daily flow.

## 8. Metrics and definitions

Penetration = assigned accounts where at least one persona has had a two-way interaction (reply on any channel or a meeting). One definition, used everywhere, so the dashboard never gets argued about.

| Metric | Definition | Shown on |
| --- | --- | --- |
| Accounts assigned | Accounts with an owner | Command Center |
| Coverage | Assigned accounts with an Active campaign / Accounts assigned | Command Center |
| Touched | Accounts with at least 1 step Done | Funnel |
| Connected | Accounts with at least 1 LinkedIn accept | Funnel |
| **Penetration rate** | Accounts with at least 1 persona at Replied or Meeting / Accounts assigned | KPI strip, by owner |
| Persona depth | Personas engaged (Replied or Meeting) / Personas on the account | Account detail, by owner average |
| Multi-threaded accounts | Accounts with 2+ personas engaged | Command Center |
| Meetings booked | Campaigns with status Meeting Booked, by week | KPI strip |
| Steps due today | Steps with due\_date = today and status Due, team and per person | KPI strip, Today |
| On-time completion | Steps Done on or before due date / Steps due in period | By owner |
| Overdue | Steps past due, not Done or Skipped | By owner, Stalled |
| Reply-to-replan time | Time from Response logged to new version applied | By owner |
| Reply rate | Personas Replied / Personas Contacted, by channel | Command Center |

All metrics filterable by owner, segment, tier and date range (default: last 30 days). Time zone for "today" is the user's own, default IST.

## 9. Tech, design and non-functional requirements

**Stack (Emergent default is fine)**

- Web app, responsive. Desktop first, the Today screen must work well on mobile.
- Frontend React, backend API, any managed database. Keep the Claude API key and Google tokens server-side.
- Scheduled jobs: daily due-status and priority refresh, 8:30 AM IST Slack morning plan and email digest, Gmail sent and reply check every 15 minutes, hourly sheet sync.

**Google integration**

| Scope | Why | Required in v1 |
| --- | --- | --- |
| openid, email, profile | Login | Yes |
| gmail.compose | Create drafts in the assignee's own Gmail | Yes |
| gmail.readonly (limited to known contacts and LinkedIn senders) | Detect sent emails and replies from known contacts (V1.0); read LinkedIn notification emails (V1.1) | Yes |
| gmail.send | Send directly from the app | V2, behind a toggle |
| spreadsheets (read and write) | Sync the account book and write back the four status columns | Yes |

Emails always go from the assignee's own Gmail so replies land in their inbox and deliverability stays clean. No shared sending domain, no tracking pixels in v1.

**Design**

- White and light backgrounds, Spendflo pink (#E91E8C) as the primary accent, no dark mode needed.
- Generous whitespace, rounded cards, soft shadows, crisp sans-serif.
- Channel icons on every step (mail, LinkedIn, phone). Status chips with consistent colours across the app.
- Charts simple and boardroom-clean: KPI tiles, one funnel, bar by owner.

**Non-functional**

- Page load under 2 seconds for up to 2,000 accounts and 10,000 personas.
- Claude generation under 60 seconds per account, with a progress state. Bulk runs queue in the background.
- Full activity log, nothing hard-deleted (soft delete with restore for admins).
- Daily database backup. CSV export of accounts, campaigns and steps from any list.
- Contact data stays in the app and Gmail. No third-party sharing beyond the Claude API call.

## 10. Phasing, out of scope, open questions

**Build order**

| Phase | Scope | Done when |
| --- | --- | --- |
| V1 (days 1 to 3) | Google login, sheet sync with write-back, assignment, in-app Claude generate and re-plan with diff view, working calendar, My Accounts with Focus Today, account cockpit with contact tracks, edit before send, Gmail drafts, LinkedIn copy and open, email reply detection with confirm cards, Slack morning plan and reply alerts, Command Center | All 4 users run live campaigns from the app for 5 working days, every email reply surfaces within 15 minutes, and a reply is re-planned in under 10 minutes |
| V1.1 (week 2) | Bulk generate, LinkedIn accept detection from notification emails, Slack scoreboard and Friday wrap | LinkedIn accepts show up without manual logging |
| V2 (week 3+) | Send from app, meeting detection from Google Calendar, HubSpot sync (accounts, contacts, activities) | Activities show in HubSpot without double entry |

Emergent expects to build V1 in 1 to 2 days, so the in-app Claude call ships from day one. Prerequisites: an Anthropic API key with billing set up, and the campaign skill text pasted into Settings.

**Out of scope for v1**

- Automated sending or auto-sequencing of any kind.
- LinkedIn automation (against LinkedIn terms, and not how we want to show up).
- Open and click tracking.
- Data enrichment inside the app. The book arrives enriched.
- Auto-applying any detected response without the owner's confirmation.

**Open questions**

- [x] Account book: Google Sheet (Coupa\_Account\_Book) is the master, synced with a four-column write-back.
- [x] Email: Gmail draft, owner sends. Send from app is V2.
- [ ] Mouli's one-time sheet cleanup (M1), including Account ID and Persona columns.
- [ ] Anthropic API key with billing set up in the Claude Console (owner: Rajiv).
- [ ] Which skill runs campaigns (bdr-sequence, flo-outbound-sales, or a combined one) and who owns edits to it.
- [ ] Approved proof points Claude may cite: customer names, results, numbers.
- [ ] Approve the default caps in Section 11 (touches per contact and account, steps per person per day, LinkedIn invites per week).
- [ ] Shweta's account slice before go-live.
- [ ] Sheet access through a shared Google service account, not one person's login.
- [ ] Confirm the penetration definition (two-way interaction, not just a LinkedIn accept).
- [ ] HubSpot (V2): which system owns the account owner field once synced.

## 11. Edge cases and guardrails

Every case below has a defined behaviour, so nobody on the team has to improvise. Defaults are editable in Settings.

**Data and sync**

| Situation | What the app does | Phase |
| --- | --- | --- |
| A contact's title or company changes in the sheet mid-campaign | Pauses that contact's track and flags "Contact changed" in the cockpit. Owner re-plans or stops | V1 |
| A contact is removed or marked Exclude in the sheet mid-campaign | Stops the track, keeps the history | V1 |
| Someone unsubscribes or says wrong person | Global do-not-contact on that email and LinkedIn URL. No future sheet sync can reactivate it | V1 |
| The same person sits under two accounts (for example Hilton and Hilton Supply Management) | Goes to the data quality queue. One contact belongs to one account | V1 |
| Owner changed in the sheet after first import | Ignored, with a hint "Sheet says X". Ownership has one home: the app | V1 |
| Sheet access breaks | Sync runs on a shared service account. Failures show a banner and post to Slack. The app keeps working on the last good sync | V1 |
| Account disqualified mid-campaign | One action closes every track with a reason and writes Status back to the sheet | V1 |

**Collisions and limits**

| Situation | What the app does | Phase |
| --- | --- | --- |
| Two teammates would touch the same contact on the same day | Max one touch per contact per day across the team. The second step moves to the next working day | V1 |
| Too much pressure on one account | Default caps: 3 touches per contact per week, 6 per account per week. Claude is given the caps and the app enforces them | V1 |
| One person overloaded on a date | Default cap of 25 steps per person per day. Claude sees each person's load; overflow rolls forward with a note | V1 |
| LinkedIn invite limits | Default cap of 80 connect requests per person per week, with a warning at 80% | V1 |
| Contact already in an active deal, or the account is a customer | Do-not-contact flag on the account in the sheet. Automatic HubSpot check in V2 | V1 manual, V2 auto |
| A founder-sent step is due while that founder is out of office | Prompts to reassign or shift. Never silently swaps the sender | V1 |

**Responses**

| Situation | What the app does | Phase |
| --- | --- | --- |
| Reply from someone not on the contact list (forwarded or cc'd) | Matched by account domain. Card: "New person at Cortland replied" with Add contact | V1 |
| Referral ("talk to Priya instead") | Classified as Referral. One tap adds the new contact and generates their track | V1 |
| Email bounce | Detected from the bounce notice. Contact marked bounced, remaining email steps switch to LinkedIn, owner notified | V1 |
| Out of office with a return date | Next step moves to the first working day after the return | V1 |
| Positive reply from one contact while others are mid-sequence | Card asks whether to pause the other tracks at that account | V1 |
| Meeting booked | Every other track at the account pauses. Owner can resume any of them | V1 manual, V2 calendar |
| A reply arrives while a re-plan is open | The open re-plan is marked stale and the owner is asked to regenerate | V1 |
| Low-confidence classification | Shown as Needs review, never auto-labelled | V1 |

**Sending**

| Situation | What the app does | Phase |
| --- | --- | --- |
| Prospect is in a different time zone | Every email step shows a send window in the prospect's local time (default 8 to 10 AM local, which is evening IST for US East). Gmail's own schedule-send works on the draft | V1 |
| Draft edited or deleted inside Gmail | The app records what was actually sent. A deleted draft returns the step to Due | V1 |
| Double click on Create draft | One draft per step, always | V1 |
| A user's Google login expires | Banner plus a Slack nudge to reconnect. Their drafts and detection pause; nothing is lost | V1 |
| Unresolved token like {first\_name} | Blocks the action until fixed | V1 |
| Campaign ends with no response | Auto-closes 5 working days after the last step as Closed No Response, with a Recycle date 90 days out | V1 |

**AI guardrails**

| Guardrail | How | Phase |
| --- | --- | --- |
| No invented proof points | Claude may only cite customer names and results from the approved list in Settings. Anything else is flagged in review | V1 |
| No invented facts about the prospect | Claims must trace to sheet fields. The review screen highlights names and numbers not found in the inputs | V1.1 |
| Prospect text is data, not instructions | Reply text is passed to the classifier as quoted content only, so a reply cannot steer the app | V1 |
| Minimum data to Claude | Only fields the campaign needs. No phone numbers | V1 |
| Enforced structure | JSON schema on every call. Nothing is saved until it validates | V1 |
| Learning loop | Skill version and model stored on every campaign version. Team view shows edit rate and reply rate by skill version | V1.1 |
| Cost control | Prompt caching on the skill text, queued bulk runs, monthly spend shown in Settings | V1 |

## 12. Making it effortless for operators

The test for every screen: can someone clear their day in one sitting without thinking about the tool?

| Principle | What it means in the product | Phase |
| --- | --- | --- |
| One home | Today answers "what do I do now" in one scroll: replies, focus accounts, steps | V1 |
| Batch, don't click | **Create all today's drafts** in one click. **LinkedIn session** walks through today's LinkedIn steps one by one: copy, open profile, done, next | V1 |
| Undo, not confirm | Done, skip and snooze show a 10-second undo. Confirm dialogs only for stop and disqualify | V1 |
| One vocabulary | One contact status scale (Not contacted, Contacted, Connected, Replied, Meeting, Stopped) and one colour scale, in the app, the sheet and Slack | V1 |
| Empty states that guide | No accounts: "Ask Mouli to assign your slice." No steps today: show tomorrow and the best account to get ahead on | V1 |
| Fast | Today loads in under 1 second. Actions update instantly and sync in the background | V1 |
| Mobile-first for the moments that matter | Today, confirm cards and LinkedIn steps work one-handed. LinkedIn opens in the app | V1 |
| Keyboard for power users | J and K to move, E to open, D done, S snooze, R log reply | V1.1 |
