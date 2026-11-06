/**
 * Local only: saves a hand-written, skill-shaped plan for Ahold Delhaize USA
 * through the production validation and save path, so the cockpit can be
 * checked without an Anthropic key. Never run against production.
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/local-demo-draft.ts
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { loadPlanningContext, loadScheduledTouches, planningWindow } from "../src/lib/campaigns/context";
import { saveDraft } from "../src/lib/campaigns/generate";
import { validateCampaign } from "../src/lib/claude/validate";
import { CampaignSchema } from "../src/lib/claude/schemas";

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) throw new Error("Refusing: this script is for the local stack only");
  const db = supabaseAdmin()!;
  const { data: account } = await db.from("accounts").select("id, owner_id").eq("name", "Ahold Delhaize USA").single();
  const { data: contacts } = await db.from("contacts").select("id, full_name, email, linkedin_url, country, exclude, do_not_contact").eq("account_id", account!.id);
  const id = (name: string) => contacts!.find((c) => c.full_name === name)!.id;

  const p = await loadPlanningContext(db);
  const win = planningWindow(p);
  const d = win.validWorkingDates;

  const output = CampaignSchema.parse({
    campaign_name: "Ahold Delhaize USA | Renewals on top of Coupa",
    objective: "A 30 minute discovery with the indirect sourcing lead about renewal notice periods.",
    job: "renewals",
    icp_profile: "B",
    angle: "Coupa already holds the contracts; the renewal dates inside them are what slip.",
    rationale: "Project: indirect sourcing owns supplier renewals across banners. Unavoidable: auto-renewals keep firing whether or not anyone reads the notice clause. Alternatives: Coupa reminders on the contract record, a spreadsheet, or doing nothing. Limitation: reminders only work when someone keyed the notice date in by hand. Disqualifying answer: renewals are owned by each banner's legal team and procurement never sees them.",
    generated_on: d[0],
    change_summary: null,
    tracks: [
      {
        contact_ref: id("Jason Thomas"),
        persona: "system_owner",
        track_goal: "Learn how contract records and renewal dates are kept in Coupa today",
        start_trigger: { type: "fixed", date: d[0], from_contact: null, step_index: null, delay_working_days: null },
        assignee: "mouli",
        rationale: "Systems owner starts first and tells us where the contracts actually live.",
        steps: [
          { date: d[0], offset_working_days: null, channel: "linkedin_connect", subject: null, body: "Jason, I work with procurement systems teams that run Coupa at retail scale. Would be good to connect.", call_script: null, keep_from_previous: false },
          { date: "2026-11-11", offset_working_days: null, channel: "email", subject: "renewal dates in coupa", body: "Jason, you run procurement systems for a business with thousands of supplier contracts in Coupa. The renewal and notice dates usually sit inside the PDF, not on the record. Flo reads the contracts where they already live and puts those dates on the record, with no new tool for buyers. Is renewal tracking something your team gets asked about?", call_script: null, keep_from_previous: false },
          { date: d[7], offset_working_days: null, channel: "call", subject: null, body: null, call_script: "Opener: Hi Jason, it's Mouli from Spendflo. We haven't spoken. Can I take 30 seconds on why I called, and you tell me if it's worth another minute?\nProblem: I work with procurement systems leads at large retailers on Coupa. They tell me renewal dates live in the contract file, so reminders only fire when someone keyed them in. Is that close for you, or way off?\nIf close: ask who gets the renewal surprises today.\nIf way off: ask how they capture notice periods now.\nObjection, we have Coupa CLM: acknowledge, then ask how many legacy contracts were loaded with dates filled in.\nObjection, not my area: ask who owns renewals for indirect spend.", keep_from_previous: false },
        ],
      },
      {
        contact_ref: id("Patrick Vestergaard"),
        persona: "procurement_leader",
        track_goal: "Get a reply that opens a discovery call on renewals",
        start_trigger: { type: "fixed", date: d[1], from_contact: null, step_index: null, delay_working_days: null },
        assignee: "mouli",
        rationale: "Indirect sourcing feels renewal surprises first; main thread of the campaign.",
        steps: [
          { date: d[1], offset_working_days: null, channel: "linkedin_connect", subject: null, body: "Patrick, I spend most of my time with indirect sourcing leaders on renewal season. Would be glad to connect.", call_script: null, keep_from_previous: false },
          { date: d[4], offset_working_days: null, channel: "email", subject: "notice periods on indirect", body: "Patrick, indirect sourcing at Ahold Delhaize USA covers a long tail of software and services renewals. Most teams find out a notice period passed after the invoice arrives. Flo reads the contracts already in Coupa and flags each renewal early enough to negotiate. Worth 30 minutes to see what that would surface for one category?", call_script: null, keep_from_previous: false },
          { date: d[8], offset_working_days: null, channel: "linkedin_message", subject: null, body: "Patrick, one question I keep hearing from sourcing leads: which renewals did you only find out about from the invoice? Happy to share what others did about it.", call_script: null, keep_from_previous: false },
        ],
      },
      {
        contact_ref: id("Peggy Krebs"),
        persona: "economic_buyer",
        track_goal: "Executive sponsor once the sourcing lead engages",
        start_trigger: { type: "after_reply", date: null, from_contact: id("Patrick Vestergaard"), step_index: null, delay_working_days: 2 },
        assignee: "sid",
        rationale: "VP Procurement hears from Sid only after a warm signal from her team.",
        steps: [
          { date: null, offset_working_days: 0, channel: "email", subject: "renewals across banners", body: "Peggy, Patrick on your indirect team and I have been talking about renewals. Every contract waiting on a missed notice date is spend you can't control yet. Flo finds those dates in the contracts you already hold in Coupa. Would a short call with Patrick and me be useful?", call_script: null, keep_from_previous: false },
        ],
      },
    ],
    skipped_contacts: [{ contact_ref: id("Jeff Dyer"), reason: "No email; LinkedIn only and not a renewals owner" }],
    discovery_questions: ["Who finds out first when a software renewal auto-renews?", "Are notice dates on the Coupa contract record or only in the file?", "Which category had the most surprise renewals last year?"],
    review: {
      likely_reply: "medium",
      main_weakness: "The Coupa evidence is a case study with no date, so the 'why now' is thin.",
      flags: ["Trigger is undated: the Coupa case study has no date. Confirm a current reason to reach out before launch."],
    },
  });

  const touches = await loadScheduledTouches(db, p.today);
  const v = validateCampaign(output, {
    accountId: account!.id,
    ownerId: account!.owner_id,
    contacts: contacts!.map((c) => ({ id: c.id, email: c.email, hasEmail: !!c.email, hasLinkedIn: !!c.linkedin_url, country: c.country, excluded: c.exclude, doNotContact: c.do_not_contact })),
    users: p.users.map((u) => ({ id: u.id, key: u.key, active: u.active })),
    campaignStartDate: win.start,
    caps: p.caps,
    existingTouches: touches,
    ctx: p.ctx,
  });
  const campaignId = await saveDraft(db, { accountId: account!.id, ownerId: account!.owner_id, startDate: win.start, output, validated: v, payload: { demo: true }, model: "hand-written-demo", p, createdBy: null });
  console.log("draft", campaignId, "blocking:", v.blocking.map((b) => b.text), "notes:", v.notes.map((n) => n.text));
}

main().catch((e) => { console.error(e); process.exit(1); });
