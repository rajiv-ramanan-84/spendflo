import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { ActionError, canEdit, launchCampaign } from "./actions";
import { canLaunch, type ReviewFlag } from "./launch";

const MAX_ACCOUNTS = 25;

export type BulkItem = { accountId: string; campaignId: string | null; name: string; flags: string[]; reason: string | null };
export type BulkPlan = { ready: BulkItem[]; flagged: BulkItem[]; skipped: BulkItem[] };

/**
 * Sorts selected accounts into: ready to launch, launchable but with open review flags, and skipped
 * (no draft, already live, not yours, or nothing dated). Pure reads, so it is safe to call for a preview.
 */
export async function planBulkLaunch(db: SupabaseClient, user: SessionUser, accountIds: string[]): Promise<BulkPlan> {
  const ids = [...new Set(accountIds)];
  if (!ids.length) throw new ActionError("Select at least one account");
  if (ids.length > MAX_ACCOUNTS) throw new ActionError(`Launch up to ${MAX_ACCOUNTS} accounts at a time. Select fewer and run it again.`);

  const [{ data: accounts }, { data: camps }] = await Promise.all([
    db.from("accounts").select("id, name, owner_id, archived, do_not_contact").in("id", ids).is("deleted_at", null),
    db.from("campaigns").select("id, account_id, status, owner_id, review, review_flags_cleared, created_at").in("account_id", ids).is("deleted_at", null).in("status", ["draft", "active", "paused", "responded", "meeting_booked"]).order("created_at", { ascending: false }),
  ]);
  const draftIds = (camps ?? []).filter((c) => c.status === "draft").map((c) => c.id as string);
  const { data: steps } = draftIds.length ? await db.from("steps").select("campaign_id, due_date").in("campaign_id", draftIds).is("deleted_at", null).not("due_date", "is", null) : { data: [] as Array<{ campaign_id: string; due_date: string }> };
  const dated = new Map<string, number>();
  for (const s of steps ?? []) dated.set(s.campaign_id as string, (dated.get(s.campaign_id as string) ?? 0) + 1);

  const plan: BulkPlan = { ready: [], flagged: [], skipped: [] };
  for (const a of accounts ?? []) {
    const mine = (camps ?? []).filter((c) => c.account_id === a.id);
    const base = { accountId: a.id as string, name: a.name as string, campaignId: null as string | null, flags: [] as string[] };
    const live = mine.find((c) => c.status !== "draft");
    const draft = mine.find((c) => c.status === "draft");
    if (a.archived || a.do_not_contact) { plan.skipped.push({ ...base, reason: a.do_not_contact ? "Do not contact" : "Archived" }); continue; }
    if (live) { plan.skipped.push({ ...base, reason: "Already has a live campaign" }); continue; }
    if (!draft) { plan.skipped.push({ ...base, reason: "No draft yet" }); continue; }
    if (!canEdit(user, (draft.owner_id as string | null) ?? (a.owner_id as string | null))) { plan.skipped.push({ ...base, campaignId: draft.id as string, reason: "Not your account" }); continue; }
    const gate = canLaunch(((draft.review as { flags?: ReviewFlag[] } | null)?.flags ?? []), (draft.review_flags_cleared as string[] | null) ?? [], dated.get(draft.id as string) ?? 0);
    if (!gate.ok) { plan.skipped.push({ ...base, campaignId: draft.id as string, reason: gate.reason }); continue; }
    const item = { ...base, campaignId: draft.id as string, reason: null, flags: gate.warnings.map((f) => f.text) };
    (gate.warnings.length ? plan.flagged : plan.ready).push(item);
  }
  // Accounts the caller named that no longer exist.
  for (const id of ids) if (!(accounts ?? []).some((a) => a.id === id)) plan.skipped.push({ accountId: id, campaignId: null, name: "Unknown account", flags: [], reason: "Not found" });
  return plan;
}

/** Launches every ready draft, and the flagged ones too when the caller has chosen to override. */
export async function bulkLaunch(db: SupabaseClient, user: SessionUser, accountIds: string[], opts: { overrideFlags: boolean }) {
  const plan = await planBulkLaunch(db, user, accountIds);
  const todo = [...plan.ready, ...(opts.overrideFlags ? plan.flagged : [])];
  const launched: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const item of todo) {
    try {
      await launchCampaign(db, user, item.campaignId!, { acknowledgeFlags: opts.overrideFlags });
      launched.push(item.name);
    } catch (e) {
      failed.push({ name: item.name, error: (e as Error).message });
    }
  }
  return { launched, failed, heldForFlags: opts.overrideFlags ? [] : plan.flagged.map((f) => f.name), skipped: plan.skipped };
}
