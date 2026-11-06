/**
 * Milestone 5 check, runnable before the app is deployed.
 * Builds the exact generate_campaign input for one real account from sheet
 * exports, and, when ANTHROPIC_API_KEY is set, calls Claude with the skill and
 * verifies the draft: every date a valid working day, caps and the collision
 * guard holding, no phone number sent.
 *
 * Usage: npx tsx scripts/generate-check.ts <master.json> <contacts.json> "<Account name>" [owner notes]
 */
import { readFileSync } from "node:fs";
import { planSync } from "../src/lib/sheet-sync/plan";
import { guessPersona } from "../src/lib/sheet-sync/parse";
import { buildGeneratePayload } from "../src/lib/claude/payload";
import { callClaude } from "../src/lib/claude/call";
import { CampaignSchema } from "../src/lib/claude/schemas";
import { validateCampaign } from "../src/lib/claude/validate";
import { DEFAULT_CAPS, scheduleTouches } from "../src/lib/caps/schedule";
import { prospectHolidayLookup } from "../src/lib/calendar/holidays";
import { defaultCampaignStart, isValidDate, listValidDates } from "../src/lib/calendar/working-calendar";
import { normalizeDomain } from "../src/lib/sheet-sync/identity";
import { todayIn } from "../src/lib/calendar/dates";

async function main() {
  const [mPath, cPath, accountName, ownerNotes] = process.argv.slice(2);
  const master = JSON.parse(readFileSync(mPath, "utf8")).values as string[][];
  const contactsSheet = JSON.parse(readFileSync(cPath, "utf8")).values as string[][];
  const users = new Map([["rajiv", "rajiv"], ["sid", "sid"], ["mouli", "mouli"], ["shweta", "shweta"]]);
  const plan = planSync(master, contactsSheet, { accounts: new Map(), contacts: new Map(), dncEmails: new Set(), dncLinkedIns: new Set(), usersByName: users });

  const acct = plan.accounts.find((a) => a.fields.name.toLowerCase() === accountName.toLowerCase());
  if (!acct) throw new Error(`No imported account named ${accountName}`);
  const contacts = plan.contacts.filter((c) => c.accountSheetId === acct.sheetAccountId);

  const year = Number(todayIn().slice(0, 4));
  const ctx = { prospectHolidays: prospectHolidayLookup([year, year + 1]), teamHolidays: new Set<string>(), outOfOffice: new Map(), quietPeriods: [] };
  const today = todayIn();
  const start = defaultCampaignStart(today, ctx);
  const valid = listValidDates(start, 30, {}, ctx);

  const payload = buildGeneratePayload({
    today,
    campaignStartDate: start,
    validWorkingDates: valid,
    account: {
      name: acct.fields.name, domain: normalizeDomain(acct.fields.domain), tier: acct.tier, icp_verdict: acct.verdict, hq: acct.fields.hq,
      revenue: acct.fields.revenue, employees: acct.fields.employees, ownership: acct.fields.ownership, coupa_evidence: acct.fields.coupa_evidence,
      trigger: acct.fields.trigger, trigger_date: acct.fields.trigger_date, signals: acct.fields.signals, disqualifier_flags: acct.fields.disqualifier_flags,
      outreach_angle: acct.fields.outreach_angle, target_contact_notes: acct.fields.target_contact_notes, custom_fields: acct.custom_fields,
    },
    contacts: contacts.map((c) => ({
      contact_id: c.sheetContactKey, name: c.fields.full_name, title: c.fields.title, persona: c.persona ?? guessPersona(c.fields.title),
      email: c.fields.email || null, email_status: c.fields.email_status || null, linkedin_url: c.fields.linkedin_url || null,
      country: c.fields.country, notes: c.fields.notes || null, linkedin_signals: c.linkedin_signals, exclude: c.fields.exclude, do_not_contact: c.doNotContact,
    })),
    owner: "mouli",
    team: ["rajiv", "sid", "mouli", "shweta"].map((u) => ({ user: u, name: u, role: "member", out_of_office_dates: [] })),
    teamLoad: [],
    caps: DEFAULT_CAPS,
    approvedProofPoints: [],
    ownerNotes: ownerNotes ?? null,
  });
  const json = JSON.stringify(payload);
  console.log(`Account ${acct.sheetAccountId} ${acct.fields.name}: ${contacts.length} contacts, payload ${json.length} chars, start ${start}`);
  console.log(`Phone in payload: ${/phone/i.test(json) ? "YES (bug)" : "no"}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY not set: payload built and checked; skipping the Claude call.");
    return;
  }
  const skillText = readFileSync(new URL("../docs/flo-campaign-engine-SKILL.md", import.meta.url), "utf8");
  const model = acct.tier === "A" ? "claude-opus-5-5" : "claude-sonnet-5-5";
  const res = await callClaude({ kind: "generate_campaign", model, skillText, payload, schema: CampaignSchema });
  if (!res.ok) throw new Error(`Claude call failed (${res.reason}): ${res.message}`);
  console.log(`Claude ${res.model}: ${res.attempts} attempt(s), ${res.usage.input}+${res.usage.cacheRead} in / ${res.usage.output} out, $${res.usage.costUsd}`);

  const ownerId = "mouli";
  const v = validateCampaign(res.data, {
    accountId: acct.sheetAccountId, ownerId,
    contacts: contacts.map((c) => ({ id: c.sheetContactKey, email: c.fields.email || null, hasEmail: !!c.fields.email, hasLinkedIn: !!c.fields.linkedin_url, country: c.fields.country, excluded: c.fields.exclude, doNotContact: c.doNotContact })),
    users: ["rajiv", "sid", "mouli", "shweta"].map((u) => ({ id: u, key: u, active: true })),
    campaignStartDate: start, caps: DEFAULT_CAPS, existingTouches: [], ctx,
  });

  const steps = v.tracks.flatMap((t) => t.steps.map((s) => ({ t, s })));
  const dated = steps.filter((x) => x.s.date);
  const badDates = dated.filter((x) => !isValidDate(x.s.date!, { country: contacts.find((c) => c.sheetContactKey === x.t.contactId)?.fields.country ?? null, assigneeId: x.s.assigneeId }, ctx));
  const recheck = scheduleTouches(dated.map((x, i) => ({ key: String(i), date: x.s.date!, contactId: x.t.contactId, accountId: "a", assigneeId: x.s.assigneeId, channel: x.s.channel })), [], DEFAULT_CAPS, ctx);
  const capBreaks = recheck.scheduled.filter((s) => s.movedFrom);

  console.log(`Plan: ${res.data.campaign_name} | job ${res.data.job} | ${v.tracks.length} tracks, ${steps.length} steps (${dated.length} dated)`);
  for (const t of v.tracks) {
    console.log(`  ${t.contactId} ${t.persona} by ${t.assigneeId} [${t.trigger.type}] ${t.steps.map((s) => `${s.date ?? `+${s.offsetWorkingDays}`}:${s.channel}`).join(" ")}`);
  }
  console.log(`Every date a valid working day: ${badDates.length === 0 ? "yes" : `NO (${badDates.length})`}`);
  console.log(`Caps and collision guard hold: ${capBreaks.length === 0 ? "yes" : `NO (${capBreaks.length})`}`);
  console.log(`Review flags for the owner: ${v.blocking.length}`);
  v.blocking.forEach((b) => console.log(`  - ${b.text}`));
  if (badDates.length || capBreaks.length) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
