import { describe, expect, it } from "vitest";
import { buildAttackPlan, overflowToNurture, type PlanContact, type PlanTrack } from "@/lib/campaigns/attack-plan";
import type { Projection } from "@/lib/campaigns/projection";

const contact = (id: string, persona: string | null = null, o: Partial<PlanContact> = {}): PlanContact => ({ id, full_name: `${id[0].toUpperCase()}${id.slice(1)} Smith`, title: "Director", persona, exclude: false, do_not_contact: false, sheet_deleted_at: null, ...o });
const step = (id: string, n: number, due: string | null, status = "upcoming", channel = "email") => ({ id, sequence_no: n, channel, status, due_date: due, completed_at: status === "done" ? `${due}T10:00:00Z` : null });
const track = (id: string, contactId: string, o: Partial<PlanTrack> = {}): PlanTrack => ({ id, contact_id: contactId, persona: null, status: "active", pause_reason: null, track_goal: null, start_trigger_type: "fixed", trigger_from_contact_id: null, steps: [], ...o });

describe("attack plan", () => {
  const contacts = [contact("michele", "procurement_leader"), contact("jim", "system_owner"), contact("sean", "procurement_leader"), contact("tony", "economic_buyer"), contact("kavil"), contact("paul", "legal", { do_not_contact: true })];
  const tracks = [
    track("t1", "michele", { persona: "procurement_leader", steps: [step("a", 1, "2026-11-02", "done"), step("b", 2, "2026-11-09")] }),
    track("t2", "jim", { persona: "system_owner", steps: [step("c", 1, "2026-11-04", "upcoming", "linkedin_connect")] }),
    track("t3", "sean", { persona: "procurement_leader", start_trigger_type: "after_step", trigger_from_contact_id: "michele", steps: [step("d", 1, null)] }),
    track("t4", "tony", { persona: "economic_buyer", start_trigger_type: "after_reply", trigger_from_contact_id: "sean", steps: [step("e", 1, null)] }),
    track("t5", "kavil", { status: "nurture", pause_reason: "Same remit as Michele", steps: [step("f", 1, null)] }),
  ];
  const projections: Projection[] = [
    { kind: "projected", trackId: "t3", basis: "2 working days after Michele's step 2", triggerDate: "2026-11-09", dates: { d: "2026-11-11" } },
    { kind: "on_reply", trackId: "t4", basis: "starts 2 working days after Sean replies" },
  ];
  const plan = buildAttackPlan({ tracks, contacts, projections });

  it("puts people in waves by how and when they start, in reach-out order", () => {
    expect(plan.waves[0].people.map((p) => p.name)).toEqual(["Michele Smith", "Jim Smith"]);
    expect(plan.waves[1].people.map((p) => p.name)).toEqual(["Sean Smith"]);
    expect(plan.waves[2].people.map((p) => p.name)).toEqual(["Tony Smith"]);
    expect(plan.waves[0].from).toBe("2026-11-02");
  });
  it("shows who unlocks whom", () => {
    expect(plan.active.find((p) => p.name === "Michele Smith")?.unlocks).toEqual(["Sean"]);
    expect(plan.active.find((p) => p.name === "Tony Smith")?.waitsOn).toBe("Sean");
  });
  it("keeps nurture and do-not-contact people out of the waves", () => {
    expect(plan.nurture.map((n) => [n.name, n.reason, n.hasSteps])).toEqual([["Kavil Smith", "Same remit as Michele", true]]);
    expect(plan.outside.map((o) => o.why)).toEqual(["Do not contact"]);
    expect(plan.active).toHaveLength(4);
  });
  it("maps role coverage", () => {
    const cov = Object.fromEntries(plan.coverage.map((c) => [c.role, c.covered]));
    expect(cov).toMatchObject({ "Economic buyer": true, "Procurement leader": true, "System owner": true, "Legal or contracts": false });
  });
  it("recommends 4 to 6 active when the committee is large, and warns over the cap", () => {
    const many = Array.from({ length: 12 }, (_, i) => contact(`p${i}x`));
    expect(buildAttackPlan({ tracks: [], contacts: many, projections: [] }).advice).toMatch(/12 stakeholders found. Best practice is 4 to 6/);
    const eight = Array.from({ length: 8 }, (_, i) => track(`k${i}`, `p${i}x`, { steps: [step(`s${i}`, 1, "2026-11-10")] }));
    expect(buildAttackPlan({ tracks: eight, contacts: many, projections: [], cap: 6 }).advice).toMatch(/8 people are active. Keep 6/);
  });
});

describe("overflow to nurture (new drafts)", () => {
  const t = (id: string, type: string, date: string | null, from: string | null = null) => ({ contactId: id, trigger: { type, startDate: date, fromContactId: from }, steps: [{ date }] });
  it("keeps everyone when under the cap", () => {
    expect(overflowToNurture([t("a", "fixed", "2026-11-10")], 6).nurture).toHaveLength(0);
  });
  it("keeps fixed, earliest starts first and parks the rest", () => {
    const r = overflowToNurture([t("late", "fixed", "2026-11-20"), t("reply", "after_reply", null, "a"), t("a", "fixed", "2026-11-10"), t("b", "fixed", "2026-11-11")], 2);
    expect(r.keep.map((x) => x.contactId)).toEqual(["a", "b"]);
    expect(r.nurture.map((x) => x.contactId)).toEqual(["late", "reply"]);
  });
  it("never keeps a track whose trigger person was parked", () => {
    const r = overflowToNurture([t("a", "fixed", "2026-11-10"), t("b", "fixed", "2026-11-12"), t("c", "after_step", null, "b")], 2);
    expect(r.keep.map((x) => x.contactId)).toEqual(["a", "b"]);
    const r2 = overflowToNurture([t("a", "fixed", "2026-11-10"), t("z", "fixed", "2026-12-01"), t("c", "after_step", null, "z")], 2);
    expect(r2.keep.map((x) => x.contactId)).not.toContain("c");
  });
});
