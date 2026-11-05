# Account book sheet: the contract with the app

Master sheet: Coupa_Account_Book (owner: Mouli). Tabs read: `Master`, `Contacts (Wiza + Evaboot)`.
A clean reference template also exists: https://docs.google.com/spreadsheets/d/15vXYiMRAyaeTeJ8IJXqVvl8BJt6W81iHC5UlPRTx5OY/edit

The sync reads columns by **header name**, so columns can move. Headers below are the real ones in the master sheet.

## IDs: the app owns them

Nobody types an ID. On every hourly sync the app:

1. Gives every new account an `ACC-###` and every new contact a `CON-####`, written into the sheet.
2. Links each contact to an account: work email domain first, then company name, then the enrichment domain (only when the company name agrees). The result goes in the contact's `Account ID` cell.
3. Never renumbers, reuses or moves an ID. A deleted row retires its ID.

A person can override any link by typing the right `ACC-###` in the contact's `Account ID` cell. A typed ID always wins.

## Duplicates: what the app writes and what you do

| Situation | Sheet shows | Imported? | What to do |
| --- | --- | --- | --- |
| Same account twice (same domain or same name) | `DUPLICATE of ACC-003` | No | Delete the row, or merge any extra research into the kept row |
| Same person twice (same LinkedIn URL or same email, same name) | `DUPLICATE of CON-0119` | No | Delete the row |
| Same name at the same account, different profiles | `POSSIBLE DUPLICATE of CON-0119` | No | Delete it if it is the same person. If it is a different person, type `KEEP` in the ID cell; the next sync gives it an ID and never asks again |
| Two different people given the same email by enrichment | Both get IDs | Yes, email flagged for review | Fix the wrong email |
| One person under two accounts | Both get IDs | Held in the review queue | Keep the person under one account |
| Contact matches no account | `CHECK: no matching account` in Account ID | No | Type the right `ACC-###`, or delete the contact |
| Contact could belong to two accounts | `CHECK: could be ACC-028 or ACC-082` | No | Type the right `ACC-###` |

The kept row is the one that already has an ID; otherwise the one with a name; otherwise the earliest row.

## Master columns

| Header in sheet | App field | Notes |
| --- | --- | --- |
| Account ID | sheet_account_id | Written by the app |
| Company | name | |
| Owner | owner_id | Rajiv, Sid, Mouli, Shweta. First import only |
| Tier | tier | A and B auto-draft a campaign |
| Status | status | Written by the app (write-back) |
| ICP Verdict | icp_verdict | FIT, MAYBE active; NO-FIT archived |
| Domain | domain | "(est.)" is stripped; "unverified" means unknown |
| HQ, Revenue (~), Employees, Ownership | hq, revenue, employees, ownership | |
| Coupa Evidence | coupa_evidence | |
| Trigger / Why Now | trigger | |
| Disqualifier Flags | disqualifier_flags | |
| Why (Fit), Signal Evidence, Agent 1/2/3 Signals, Target Title, Named Procurement Lead, Sales Nav fields, Notes | custom_fields | Passed to Claude as account context |
| Target contacts notes, Outreach angle notes | target_contact_notes, outreach_angle | To be moved into Master from the per-owner tabs |
| Last Touch, Next Step Date, Contacts Engaged | | To be added; written by the app |

## Contacts columns

| Header in sheet | App field | Notes |
| --- | --- | --- |
| Contact ID | sheet_contact_key | Written by the app |
| Account ID | account_id | Written by the app; a typed ID wins |
| Full Name, Title, Company | full_name, title | Company is used only for linking |
| LinkedIn URL | linkedin_url | |
| Best Email, Best Email Status | email, email_status | |
| Best Phone (Wiza) | phone | Never sent to Claude |
| Location | country | Parsed to a country code for the holiday calendar |
| Evaboot signals (new position, recently hired or promoted, recent posts, mutual connections, months in position) | linkedin_signals | Passed to Claude |
| Persona, Exclude | persona, exclude | To be added |
