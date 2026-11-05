# Account book sheet: the contract with the app

Template: https://docs.google.com/spreadsheets/d/15vXYiMRAyaeTeJ8IJXqVvl8BJt6W81iHC5UlPRTx5OY/edit

The sync (milestone 4) reads columns by **header name**, not position, so columns can be reordered. Header names must match exactly.

## Master (one row per account)

| Header | Required | App field | Notes |
| --- | --- | --- | --- |
| Account ID | Yes | accounts.sheet_account_id | Permanent join key, e.g. ACC-001 |
| Account Name | Yes | name | |
| Domain | Yes | domain | Used to match replies from unknown senders and to check contact emails |
| Segment | | segment | |
| Tier | Yes | tier | A, B, C, D. A and B auto-draft a campaign |
| ICP Verdict | Yes | icp_verdict | FIT, MAYBE import active; NO-FIT imports archived |
| Owner | | owner_id | Rajiv, Sid, Mouli, Shweta. First import only, then the app owns it |
| Do Not Contact | | do_not_contact | Yes / No |
| HQ | | hq | |
| Revenue | | revenue | |
| Employees | | employees | |
| Ownership | | ownership | |
| Coupa Evidence | | coupa_evidence | |
| Trigger | | trigger | |
| Trigger Date | | trigger_date | YYYY-MM-DD. Undated triggers are weak signals |
| Signals | | signals | |
| Disqualifier Flags | | disqualifier_flags | |
| Outreach Angle | | outreach_angle | |
| Target Contact Notes | | target_contact_notes | |
| Status | App writes | | Write-back |
| Last Touch | App writes | | Write-back |
| Next Step Date | App writes | | Write-back |
| Contacts Engaged | App writes | | Write-back, e.g. "2 of 6" |

Any other column is kept in accounts.custom_fields.

## Contacts (one row per person)

| Header | Required | App field | Notes |
| --- | --- | --- | --- |
| Account ID | Yes | account_id | Must match a Master row |
| Contact ID | Yes | contacts.sheet_contact_key | Permanent, unique across the sheet, e.g. CON-0001 |
| Full Name | Yes | full_name | |
| Title | | title | A change mid-campaign pauses the track |
| Persona | | persona | Economic buyer, Procurement leader, Coupa or system owner, Contract manager or legal ops, Legal or GC, Finance or AP, Champion, Other |
| Seniority | | seniority | C-level, VP, Director, Manager, Individual contributor |
| Email | One of email or LinkedIn | email | Domain should match the account |
| Email Status | | email_status | Valid, Risky, Invalid, Unknown |
| Phone | | phone | Never sent to Claude |
| LinkedIn URL | One of email or LinkedIn | linkedin_url | |
| Country | | country | ISO code, default US. Drives the prospect holiday calendar |
| Exclude | | exclude | Yes / No |
| Notes | | notes | |

## Rows that go to the data quality queue instead of importing

Missing Account ID or Contact ID, Contact with an Account ID not on Master, duplicate Contact ID, duplicate LinkedIn URL, same person under two accounts, email domain not matching the account domain, title containing "Retired", no email and no LinkedIn.
