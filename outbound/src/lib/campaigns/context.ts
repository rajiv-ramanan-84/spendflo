import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addWorkingDays, defaultCampaignStart, listValidDates, type CalendarContext } from "@/lib/calendar/working-calendar";
import { todayIn, type IsoDate } from "@/lib/calendar/dates";
import { loadCalendarContext } from "@/lib/calendar/context";
import { DEFAULT_CAPS, type Caps, type Touch } from "@/lib/caps/schedule";

/** Everything a Claude call or a scheduling decision needs, loaded once. */

export type TeamUser = { id: string; name: string; email: string; role: string; active: boolean; key: string; slack_user_id: string | null; timezone: string };

export type PlanningContext = {
  today: IsoDate;
  ctx: CalendarContext;
  caps: Caps;
  users: TeamUser[];
  settings: { default_model: string; tier_a_model: string; priority_weights: Record<string, number>; email_word_flag: number; linkedin_connect_max_chars: number };
  skill: { id: string | null; text: string; version: number | null };
  proofPoints: string[];
};

export function userKey(u: { name: string; email: string }): string {
  return (u.name.split(/\s+/)[0] || u.email.split("@")[0]).toLowerCase();
}

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadPlanningContext(db: SupabaseClient): Promise<PlanningContext> {
  const today = todayIn();
  const year = Number(today.slice(0, 4));
  const [ctx, users, settings, skill, proof] = await Promise.all([
    loadCalendarContext(db, [year, year + 1]),
    rows<Omit<TeamUser, "key">>(db.from("users").select("id, name, email, role, active, slack_user_id, timezone")),
    db.from("app_settings").select("caps, default_model, tier_a_model, priority_weights").maybeSingle(),
    db.from("skill_versions").select("id, version_no, body").order("version_no", { ascending: false }).limit(1).maybeSingle(),
    rows<{ label: string; customer_name: string | null; text: string }>(db.from("proof_points").select("label, customer_name, text").eq("approved", true).is("deleted_at", null)),
  ]);
  const caps = { ...DEFAULT_CAPS, ...((settings.data?.caps as Partial<Caps>) ?? {}) };
  const rawCaps = (settings.data?.caps ?? {}) as Record<string, number>;
  return {
    today,
    ctx,
    caps,
    users: users.map((u) => ({ ...u, key: userKey(u) })),
    settings: {
      default_model: settings.data?.default_model ?? "claude-sonnet-5-5",
      tier_a_model: settings.data?.tier_a_model ?? "claude-opus-5-5",
      priority_weights: (settings.data?.priority_weights as Record<string, number>) ?? {},
      email_word_flag: rawCaps.email_word_flag ?? 150,
      linkedin_connect_max_chars: rawCaps.linkedin_connect_max_chars ?? 300,
    },
    skill: { id: skill.data?.id ?? null, text: skill.data?.body ?? "", version: skill.data?.version_no ?? null },
    proofPoints: proof.map((p) => [p.customer_name, p.text].filter(Boolean).join(": ")),
  };
}

/** Open steps across all campaigns, as touches for caps and collisions. */
export async function loadScheduledTouches(db: SupabaseClient, from: IsoDate): Promise<Touch[]> {
  const [steps, campaigns, contacts] = await Promise.all([
    rows<{ id: string; campaign_id: string; contact_id: string; assignee_id: string | null; channel: string; due_date: string | null }>(
      db.from("steps").select("id, campaign_id, contact_id, assignee_id, channel, due_date")
        .in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null).gte("due_date", from),
    ),
    rows<{ id: string; account_id: string }>(db.from("campaigns").select("id, account_id").is("deleted_at", null)),
    rows<{ id: string; country: string | null }>(db.from("contacts").select("id, country")),
  ]);
  const accountOf = new Map(campaigns.map((c) => [c.id, c.account_id]));
  const countryOf = new Map(contacts.map((c) => [c.id, c.country]));
  return steps
    .filter((s) => s.due_date && s.assignee_id)
    .map((s) => ({
      key: s.id,
      date: s.due_date!,
      contactId: s.contact_id,
      accountId: accountOf.get(s.campaign_id) ?? "",
      assigneeId: s.assignee_id!,
      channel: s.channel,
      country: countryOf.get(s.contact_id) ?? null,
    }));
}

export function planningWindow(p: PlanningContext, days = 30) {
  const start = defaultCampaignStart(p.today, p.ctx);
  const validWorkingDates = listValidDates(start, days, {}, p.ctx);
  const end = validWorkingDates[validWorkingDates.length - 1] ?? addWorkingDays(start, days, {}, p.ctx);
  return { start, end, validWorkingDates };
}

export function teamPayload(p: PlanningContext, from: IsoDate, to: IsoDate) {
  return p.users
    .filter((u) => u.active)
    .map((u) => {
      const ooo: IsoDate[] = [];
      for (const r of p.ctx.outOfOffice.get(u.id) ?? []) {
        for (let d = r.start < from ? from : r.start; d <= r.end && d <= to; d = addWorkingDays(d, 1, {}, p.ctx)) ooo.push(d);
      }
      return { user: u.key, name: u.name, role: u.role, out_of_office_dates: ooo };
    });
}

export function teamLoadPayload(p: PlanningContext, touches: Touch[]) {
  const keyOf = new Map(p.users.map((u) => [u.id, u.key]));
  const counts = new Map<string, number>();
  for (const t of touches) {
    const k = `${keyOf.get(t.assigneeId) ?? t.assigneeId}|${t.date}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, steps]) => {
    const [user, date] = k.split("|");
    return { user, date, steps };
  });
}
