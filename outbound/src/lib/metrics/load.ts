import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Snapshot } from "./compute";

/** Reads every row in pages (Supabase caps a response at 1,000 rows). */
async function paged<T>(make: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await make().range(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) return out;
  }
}

export async function loadMetricsSnapshot(db: SupabaseClient, sinceIso: string): Promise<Snapshot> {
  const [accounts, contacts, campaigns, tracks, steps, responses, versions, users] = await Promise.all([
    paged<Snapshot["accounts"][number]>(() => db.from("accounts").select("id, name, tier, segment, owner_id, archived").is("deleted_at", null).order("id")),
    paged<Snapshot["contacts"][number]>(() => db.from("contacts").select("id, account_id, engagement_status").is("deleted_at", null).order("id")),
    paged<Snapshot["campaigns"][number]>(() => db.from("campaigns").select("id, account_id, owner_id, status, updated_at").is("deleted_at", null).not("status", "eq", "draft").order("id")),
    paged<Snapshot["tracks"][number]>(() => db.from("contact_tracks").select("id, status").order("id")),
    paged<Snapshot["steps"][number]>(() => db.from("steps").select("id, campaign_id, track_id, contact_id, assignee_id, channel, status, due_date, completed_at, completed_by").is("deleted_at", null).order("id")),
    paged<Snapshot["responses"][number]>(() => db.from("responses").select("id, account_id, campaign_id, contact_id, channel, classification, state, received_at, confirmed_at").order("id")),
    paged<Snapshot["versions"][number]>(() => db.from("campaign_versions").select("campaign_id, reason, created_at").gte("created_at", sinceIso).order("created_at")),
    paged<Snapshot["users"][number]>(() => db.from("users").select("id, name").eq("active", true).order("name")),
  ]);
  return { accounts, contacts, campaigns, tracks, steps, responses, versions, users };
}

/** The rows behind a drilled number. */
export async function loadDrill(db: SupabaseClient, kind: "accounts" | "campaigns" | "steps", ids: string[]) {
  const take = ids.slice(0, 200);
  if (!take.length) return [];
  if (kind === "accounts") {
    const { data } = await db.from("accounts").select("id, name, tier, owner_id").in("id", take);
    return (data ?? []).map((a) => ({ accountId: a.id as string, title: a.name as string, detail: `Tier ${a.tier ?? "-"}`, ownerId: a.owner_id as string | null, date: null as string | null }));
  }
  if (kind === "campaigns") {
    const { data } = await db.from("campaigns").select("id, account_id, owner_id, status, name").in("id", take);
    const accs = new Map(((await db.from("accounts").select("id, name").in("id", (data ?? []).map((c) => c.account_id))).data ?? []).map((a) => [a.id, a.name]));
    return (data ?? []).map((c) => ({ accountId: c.account_id as string, title: accs.get(c.account_id) as string, detail: c.name as string, ownerId: c.owner_id as string, date: null as string | null, status: c.status as string }));
  }
  const { data } = await db.from("steps").select("id, campaign_id, contact_id, assignee_id, channel, due_date, status").in("id", take);
  const camps = new Map(((await db.from("campaigns").select("id, account_id").in("id", [...new Set((data ?? []).map((s) => s.campaign_id))])).data ?? []).map((c) => [c.id, c.account_id]));
  const accs = new Map(((await db.from("accounts").select("id, name").in("id", [...new Set(camps.values())])).data ?? []).map((a) => [a.id, a.name]));
  const people = new Map(((await db.from("contacts").select("id, full_name").in("id", [...new Set((data ?? []).map((s) => s.contact_id))])).data ?? []).map((c) => [c.id, c.full_name]));
  return (data ?? []).map((s) => ({ accountId: camps.get(s.campaign_id) as string, title: accs.get(camps.get(s.campaign_id)) as string, detail: `${people.get(s.contact_id) ?? ""} · ${String(s.channel).replace(/_/g, " ")} · ${s.status}`, ownerId: s.assignee_id as string | null, date: s.due_date as string | null }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}
