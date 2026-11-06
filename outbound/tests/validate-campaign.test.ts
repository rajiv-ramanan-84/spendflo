import { describe, expect, it } from "vitest";
import { validateCampaign, wordCount, type ValidationInput } from "@/lib/claude/validate";
import { CampaignSchema, type CampaignOutput, type StepOutput, type TrackOutput } from "@/lib/claude/schemas";
import { DEFAULT_CAPS } from "@/lib/caps/schedule";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";
import { isValidDate } from "@/lib/calendar/working-calendar";

const ctx = {
  prospectHolidays: prospectHolidayLookup([2026, 2027]),
  teamHolidays: new Set<string>(),
  outOfOffice: new Map(),
  quietPeriods: [],
};

const input = (over: Partial<ValidationInput> = {}): ValidationInput => ({
  accountId: "acc",
  ownerId: "u-mouli",
  contacts: [
    { id: "c-priya", email: "priya@cortland.com", hasEmail: true, hasLinkedIn: true, country: "US", excluded: false, doNotContact: false },
    { id: "c-sam", email: null, hasEmail: false, hasLinkedIn: true, country: "US", excluded: false, doNotContact: false },
    { id: "c-cfo", email: "cfo@cortland.com", hasEmail: true, hasLinkedIn: true, country: "US", excluded: false, doNotContact: false },
    { id: "c-gone", email: "gone@cortland.com", hasEmail: true, hasLinkedIn: true, country: "US", excluded: true, doNotContact: false },
  ],
  users: [
    { id: "u-rajiv", key: "rajiv", active: true },
    { id: "u-sid", key: "sid", active: true },
    { id: "u-mouli", key: "mouli", active: true },
    { id: "u-shweta", key: "shweta", active: false },
  ],
  campaignStartDate: "2026-11-06",
  caps: DEFAULT_CAPS,
  existingTouches: [],
  ctx,
  ...over,
});

const step = (date: string | null, channel: StepOutput["channel"], body = "Short, specific note about their Coupa rollout.", subject: string | null = null): StepOutput => ({
  date, offset_working_days: null, channel, subject, body, call_script: channel === "call" ? "Opener..." : null, keep_from_previous: false,
});

const track = (over: Partial<TrackOutput>): TrackOutput => ({
  contact_ref: "c-priya",
  persona: "procurement_leader",
  track_goal: "Open a discovery call",
  start_trigger: { type: "fixed", date: "2026-11-06", from_contact: null, step_index: null, delay_working_days: null },
  assignee: "mouli",
  rationale: "Main thread",
  steps: [step("2026-11-06", "linkedin_connect"), step("2026-11-10", "email", "Three sentences about redlining.", "redlining at cortland")],
  ...over,
});

const campaign = (tracks: TrackOutput[], flags: string[] = []): CampaignOutput =>
  CampaignSchema.parse({
    campaign_name: "Cortland | Redlining on top of Coupa",
    objective: "Book discovery",
    job: "redlining",
    icp_profile: "B",
    angle: "Coupa build-out plus M&A",
    rationale: "PULL...",
    generated_on: "2026-11-05",
    change_summary: null,
    tracks,
    skipped_contacts: [{ contact_ref: "c-gone", reason: "Marked Exclude" }],
    discovery_questions: ["Who reviews supplier paper today?"],
    review: { likely_reply: "medium", main_weakness: "Trigger is undated", flags },
  });

describe("validateCampaign", () => {
  it("accepts a clean plan unchanged", () => {
    const v = validateCampaign(campaign([track({})]), input());
    expect(v.blocking).toEqual([]);
    expect(v.tracks).toHaveLength(1);
    expect(v.tracks[0]).toMatchObject({ contactId: "c-priya", assigneeId: "u-mouli", trigger: { type: "fixed", startDate: "2026-11-06" } });
    expect(v.tracks[0].steps.map((s) => [s.date, s.movedNote])).toEqual([["2026-11-06", null], ["2026-11-10", null]]);
  });

  it("carries Claude's own review flags as blocking", () => {
    const v = validateCampaign(campaign([track({})], ["Owner note names Lennar; not in approved proof points"]), input());
    expect(v.blocking.map((b) => b.text)).toEqual(["Owner note names Lennar; not in approved proof points"]);
  });

  it("moves a holiday date to the next working day and says why", () => {
    const v = validateCampaign(campaign([track({ steps: [step("2026-11-06", "linkedin_connect"), step("2026-11-11", "email", "Body.", "subject")] })]), input());
    const s = v.tracks[0].steps[1];
    expect(s.date).toBe("2026-11-12");
    expect(s.movedNote).toBe("Moved from 2026-11-11 (prospect holiday)");
    expect(v.notes.some((n) => n.text.includes("Moved from 2026-11-11"))).toBe(true);
  });

  it("keeps at least two working days between touches to one person", () => {
    const v = validateCampaign(campaign([track({ steps: [step("2026-11-06", "linkedin_connect"), step("2026-11-09", "email", "Body.", "subject")] })]), input());
    expect(v.tracks[0].steps[1].date).toBe("2026-11-10");
    expect(v.tracks[0].steps[1].movedNote).toMatch(/too close/);
  });

  it("applies the team-wide collision guard against steps already scheduled", () => {
    const existing = [{ key: "x", date: "2026-11-06", contactId: "c-priya", accountId: "acc", assigneeId: "u-sid", channel: "call" }];
    const v = validateCampaign(campaign([track({})]), input({ existingTouches: existing }));
    expect(v.tracks[0].steps[0].date).toBe("2026-11-09");
    expect(v.tracks[0].steps[1].date).toBe("2026-11-12"); // gap of 2 working days after the 9th skips Veterans Day
  });

  it("every stored date is a valid working day", () => {
    const v = validateCampaign(
      campaign([track({ steps: [step("2026-11-07", "linkedin_connect"), step("2026-11-26", "email", "Body.", "s"), step("2026-12-25", "call")] })]),
      input(),
    );
    for (const s of v.tracks[0].steps) expect(isValidDate(s.date!, { country: "US", assigneeId: "u-mouli" }, ctx)).toBe(true);
  });

  it("drops a track for an unknown contact and never invents one", () => {
    const v = validateCampaign(campaign([track({ contact_ref: "someone@else.com" })]), input());
    expect(v.tracks).toEqual([]);
    expect(v.blocking.map((b) => b.text).join(" ")).toMatch(/not a contact on this account/);
  });

  it("resolves contacts by email as well as id", () => {
    const v = validateCampaign(campaign([track({ contact_ref: "PRIYA@cortland.com" })]), input());
    expect(v.tracks[0].contactId).toBe("c-priya");
  });

  it("leaves out excluded people quietly", () => {
    const v = validateCampaign(campaign([track({}), track({ contact_ref: "c-gone" })]), input());
    expect(v.tracks.map((t) => t.contactId)).toEqual(["c-priya"]);
  });

  it("gives an inactive or unknown assignee's track to the owner, with a flag", () => {
    const v = validateCampaign(campaign([track({ assignee: "shweta" })]), input());
    expect(v.tracks[0].assigneeId).toBe("u-mouli");
    expect(v.blocking[0].text).toMatch(/not an active user/);
  });

  it("flags copy problems: long connect note, long email, placeholders, em dashes, missing subject", () => {
    const longNote = "x".repeat(301);
    const longEmail = Array.from({ length: 160 }, () => "word").join(" ");
    const v = validateCampaign(
      campaign([track({
        steps: [
          step("2026-11-06", "linkedin_connect", longNote),
          step("2026-11-10", "email", longEmail, "subject"),
          step("2026-11-13", "email", "Hi {first_name}, quick one — is this you?", null),
        ],
      })]),
      input(),
    );
    const text = v.blocking.map((b) => b.text).join(" | ");
    expect(text).toMatch(/301 characters/);
    expect(text).toMatch(/160 words/);
    expect(text).toMatch(/placeholder/);
    expect(text).toMatch(/em dash/);
    expect(text).toMatch(/no subject/);
  });

  it("flags an email step to someone without an email, and a message before a connect", () => {
    const v = validateCampaign(
      campaign([track({ contact_ref: "c-sam", steps: [step("2026-11-06", "linkedin_message"), step("2026-11-10", "email", "Body.", "s")] })]),
      input(),
    );
    const text = v.blocking.map((b) => b.text).join(" | ");
    expect(text).toMatch(/LinkedIn message before any connect/);
    expect(text).toMatch(/no email/);
  });

  it("stores trigger-based tracks with offsets, not dates", () => {
    const cfo = track({
      contact_ref: "c-cfo",
      persona: "economic_buyer",
      assignee: "sid",
      start_trigger: { type: "after_reply", date: null, from_contact: "c-priya", step_index: null, delay_working_days: 2 },
      steps: [{ ...step(null, "email", "Body.", "s"), offset_working_days: 0 }, { ...step(null, "call"), offset_working_days: 3 }],
    });
    const v = validateCampaign(campaign([track({}), cfo]), input());
    const t = v.tracks[1];
    expect(t.trigger).toEqual({ type: "after_reply", startDate: null, fromContactId: "c-priya", stepIndex: null, delayWorkingDays: 2 });
    expect(t.steps.map((s) => [s.date, s.offsetWorkingDays])).toEqual([[null, 0], [null, 3]]);
    expect(t.assigneeId).toBe("u-sid");
  });

  it("flags a trigger that waits on someone not on the account", () => {
    const v = validateCampaign(
      campaign([track({ start_trigger: { type: "after_reply", date: null, from_contact: "ghost", step_index: null, delay_working_days: 2 }, steps: [] })]),
      input(),
    );
    expect(v.blocking.map((b) => b.text).join(" ")).toMatch(/waits on "ghost"/);
  });

  it("never schedules before the campaign start date", () => {
    const v = validateCampaign(campaign([track({ steps: [step("2026-11-02", "linkedin_connect")] })]), input());
    expect(v.tracks[0].steps[0]).toMatchObject({ date: "2026-11-06", movedNote: "Moved from 2026-11-02 (before the start date)" });
  });

  it("counts words like a person would", () => {
    expect(wordCount("  one two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});

describe("short contact refs and invented claims", () => {
  it("resolves c1-style refs back to contact ids", async () => {
    const { contactRefs } = await import("@/lib/claude/payload");
    const r = contactRefs(["uuid-a", "uuid-b"]);
    expect([r.ref("uuid-b"), r.id("c1"), r.id(" c2 "), r.id("c9")]).toEqual(["c2", "uuid-a", "uuid-b", null]);
  });
  it("blocks copy that claims a relationship the data does not show", async () => {
    const { copyIssues } = await import("@/lib/claude/copy-checks");
    const lim = { emailWords: 150, connectChars: 300 };
    expect(copyIssues("linkedin_connect", null, "Hi Michael, we share a few connections and I'd like to connect.", lim)).toContain("claims a connection or past conversation the data does not show");
    expect(copyIssues("email", "Re: our call", "Following up on our conversation last week.", lim).some((x) => x.startsWith("claims"))).toBe(true);
    expect(copyIssues("linkedin_connect", null, "Hi Michael, I'm the founder of Spendflo. Happy to connect.", lim)).toEqual([]);
  });
});

describe("names in Claude's notes", () => {
  it("swaps c1-style refs for names and leaves other text alone", async () => {
    const { namesForRefs } = await import("@/lib/claude/payload");
    const toId = new Map([["c1", "u1"], ["c4", "u4"]]);
    const names = new Map([["u1", "Aaron B"], ["u4", "Josh Floyd"]]);
    expect(namesForRefs("c1 email is off-domain; c4 and c9 are riskier. Use c1c2 rules.", toId, names)).toBe("Aaron B email is off-domain; Josh Floyd and c9 are riskier. Use c1c2 rules.");
    expect(namesForRefs(null, toId, names)).toBeNull();
  });
});
