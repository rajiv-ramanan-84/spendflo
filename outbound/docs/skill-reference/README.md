# Outbound skill reference

These documents travel with the campaign skill. `scripts/gen-skill-seed.mjs` appends every `.md` and `.txt` file here (except this README) to `docs/flo-campaign-engine-SKILL.md` and saves the result as the next skill version, so Claude reads them on every generate, re-plan and reply classification.

| File | What Claude uses it for |
| --- | --- |
| 01-commercial-context | Positioning, the three jobs (contract review, renewals, guided buying) and claims to keep out |
| 02-datavant-implementation | What the product actually does today and where the boundaries are |
| 03-buyer-response-review | How to judge a sequence through the buyer's eyes |
| 04-account-lessons | Mattel and Sonoco: what was verified and what was corrected |
| 05-mattel-sonoco-account-plan | The full plans, as worked examples of tone, cadence and evidence discipline |

Dated 30 October 2026. To update: replace a file, run `node scripts/gen-skill-seed.mjs`, then run `supabase/seed_skill.sql`. It adds a new version only when the text changed.
