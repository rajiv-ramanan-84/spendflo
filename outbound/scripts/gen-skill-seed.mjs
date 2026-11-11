// Two outputs from the docs, both safe to re-run:
//   1. supabase/seed_skill.sql: the team's campaign skill, exactly as written,
//      added as the next skill version only when the text changed.
//   2. src/lib/claude/prompt-extras.generated.ts: the app's own notes and the
//      condensed outbound brief. These ride along with whatever skill version
//      is current, so editing the skill in Settings never removes them.
// Run after editing docs/flo-campaign-engine-SKILL.md, docs/skill-reference/00-brief.md
// or the notes below: node scripts/gen-skill-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").trim();
const skill = read("../docs/flo-campaign-engine-SKILL.md");
const brief = read("../docs/skill-reference/00-brief.md");

const appNotes = [
  "# How the app sends data",
  "",
  "- Contacts are referenced as c1, c2 and so on. Use exactly those refs in contact_ref, from_contact and skipped_contacts.",
  "- has_phone: true means a direct line exists. The number itself is withheld for privacy, so plan calls where has_phone is true and do not flag the missing number. Where it is false, prefer email or LinkedIn over a call.",
  "- Never claim shared connections, a past meeting or an earlier conversation unless the request's data shows it. Copy that does is blocked before launch.",
  "- Keep review.flags to what the owner must decide or fix before launch. Put softer observations in main_weakness or rationale.",
  "- step_index counts from 1, and the app dates triggered tracks and enforces caps itself. Do not flag how the app counts or schedules; flag only what a person must do.",
  "- For replan_campaign with scope \"track\", return only the replying contact's track. Other tracks stay as they are.",
  "- Every step on an account is sent by the account owner (the owner field). Set every track's assignee to the owner.",
  "- Active people per account: write tracks for the 4 to 6 people you would go to now for this one use case, never more than 6. Put everyone else in skipped_contacts with a one-line reason (for example \"same remit as c2, hold for a referral\"); they wait in nurture. The app keeps at most 6 active and parks any extra tracks in nurture.",
  "- Do not sign anything. Write email and LinkedIn copy with no sign-off, no name at the end and no signature: the app adds the right one for whoever sends it. A LinkedIn connect note has no name at all. In the body, refer to the sender only as \"I\", and never name the sender, the owner or a teammate as the person writing.",
  "- The request includes play (the matched play and level) and signals (each with its ID, date, age in days and whether it counts). The app has applied the gate already. Use only signals marked counts: true as triggers, cite the signal and its date, and never present a stale or undated signal as current.",
  "- The PLAYBOOK section below replaces the job table, the ICP lead-job guidance and any sweep or intake guidance in the skill. The three jobs are redlining, renewals and guided_buying. Set job to the play's job. Level nurture means no live trigger: write a short, low-key 3-touch sequence and raise a flag.",
  "- writing_rules (when present) holds the team's standing writing instructions, the sender's voice and instructions for personas on this account. Follow them for every email and LinkedIn message. A persona's instructions apply to that persona's track and refine the team rules; they never override the facts, the dates, the caps or the approved proof points.",
  "- Email steps: body is 2 to 4 short paragraphs separated by a blank line, with no greeting, no sign-off and no signature. The app adds \"Hi {first name},\" and the sender's signature. Write the body first and the subject after it. Return one subject.",
  "- For replan_campaign, history lists everything already done on this campaign: each step taken with its outcome, every reply, who accepted on LinkedIn, which tracks are paused and why, and the earlier plan versions. Build on it. Never repeat or contradict a message already sent, never plan a touch for someone who asked to stop or whose track is paused, treat a reply as that person's latest word, and leave completed steps as they are. Signals marked new_since_plan arrived after the last plan: use them where they help and say in the rationale what changed because of them.",
  "- For replan_campaign, change as little as possible. Return every open step that does not need to change exactly as it is (same channel, date, subject and body). Change only what the reply, the new signals or the owner's instruction requires, and only for the people they affect. Do not rewrite copy, move dates or switch channels just to freshen the plan.",
  "- Calls are made by the owner in their own name. When writes_as differs, the call opener refers to that person's note, e.g. \"Mouli from Spendflo, following Sid's note\".",
].join("\n");

if (skill.includes("$skill$")) throw new Error("Skill text contains the dollar-quote tag");
writeFileSync(new URL("../supabase/seed_skill.sql", import.meta.url), `-- Generated by scripts/gen-skill-seed.mjs from docs/flo-campaign-engine-SKILL.md.
-- Adds the next skill version only when the text differs from the latest one,
-- so it is safe to re-run. After go-live, edit the skill in Settings > Claude.
insert into skill_versions (version_no, body)
select coalesce(max(version_no), 0) + 1, $skill$${skill}$skill$
from skill_versions
having coalesce((select body from skill_versions order by version_no desc limit 1), '') <> $skill$${skill}$skill$;
`);

writeFileSync(new URL("../src/lib/claude/prompt-extras.generated.ts", import.meta.url), `// Generated by scripts/gen-skill-seed.mjs. Do not edit by hand.
// Source: the notes in that script and docs/skill-reference/00-brief.md.

export const APP_NOTES = ${JSON.stringify(appNotes)};

export const OUTBOUND_BRIEF = ${JSON.stringify(brief)};
`);
console.log(`skill ${skill.length} chars; app notes ${appNotes.length}; brief ${brief.length}`);
