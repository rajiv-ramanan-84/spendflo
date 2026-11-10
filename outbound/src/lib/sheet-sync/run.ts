import { resignOpenSteps } from "@/lib/writing/resign";
import { queueOvernightDrafts } from "@/lib/playbook/overnight";
import type { AutoDraftMode } from "@/lib/playbook/auto-draft";
import { refreshPlays } from "@/lib/playbook/service";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readTab, writeCells } from "@/lib/google/sheets";
import { normalizeDomain, normalizeLinkedIn } from "./identity";
import { guessPersona } from "./parse";
import { planSync, type DqIssue, type SyncPlan, type SyncSnapshot } from "./plan";
import { assertContactWritesAllowed, assertMasterWritesAllowed, planWriteback, type AccountWriteback, type CampaignStatus } from "./writeback";

export type SyncOptions = { dryRun?: boolean; triggeredBy?: string | null };

export type SyncResult = {
  ok: boolean;
  dryRun: boolean;
  runId: string | null;
  counts: SyncPlan["counts"] & { dqOpen: number; writebackCells: number; autoDraftQueued: number };
  fatal: string[];
  missingWritebackColumns: string[];
  error?: string;
};

export function tabs() {
  return {
    master: process.env.SHEET_MASTER_TAB || "Master",
    contacts: process.env.SHEET_CONTACTS_TAB || "Contacts (Wiza + Evaboot)",
  };
}

export async function sheetIdFor(db: SupabaseClient): Promise<string> {
  const { data } = await db.from("app_settings").select("sheet_id").maybeSingle();
  const id = data?.sheet_id || process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("No sheet connected. Set it in Settings > Data or GOOGLE_SHEET_ID.");
  return id;
}

async function all<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadSnapshot(db: SupabaseClient) {
  const [accounts, contacts, dnc, users] = await Promise.all([
    all<{ id: string; sheet_account_id: string; owner_id: string | null; sheet_deleted_at: string | null }>(
      db.from("accounts").select("id, sheet_account_id, owner_id, sheet_deleted_at").is("deleted_at", null),
    ),
    all<{ id: string; sheet_contact_key: string; account_id: string; title: string | null; persona: string | null; sheet_deleted_at: string | null }>(
      db.from("contacts").select("id, sheet_contact_key, account_id, title, persona, sheet_deleted_at").is("deleted_at", null),
    ),
    all<{ email: string | null; linkedin_url: string | null }>(db.from("do_not_contact").select("email, linkedin_url")),
    all<{ id: string; name: string; email: string }>(db.from("users").select("id, name, email").eq("active", true)),
  ]);

  const usersByName = new Map<string, string>();
  for (const u of users) {
    usersByName.set(u.name.trim().toLowerCase(), u.id);
    usersByName.set(u.email.split("@")[0].toLowerCase(), u.id);
  }
  const sheetIdByUuid = new Map(accounts.map((a) => [a.id, a.sheet_account_id]));
  const snapshot: SyncSnapshot = {
    accounts: new Map(accounts.map((a) => [a.sheet_account_id, { id: a.id, ownerId: a.owner_id, sheetDeleted: !!a.sheet_deleted_at }])),
    contacts: new Map(
      contacts.map((c) => [c.sheet_contact_key, { id: c.id, title: c.title ?? "", accountSheetId: sheetIdByUuid.get(c.account_id) ?? "", sheetDeleted: !!c.sheet_deleted_at }]),
    ),
    dncEmails: new Set(dnc.map((d) => d.email?.toLowerCase()).filter((e): e is string => !!e)),
    dncLinkedIns: new Set(dnc.map((d) => normalizeLinkedIn(d.linkedin_url)).filter((l): l is string => !!l)),
    usersByName,
  };
  const personaByKey = new Map(contacts.map((c) => [c.sheet_contact_key, c.persona]));
  return { snapshot, personaByKey };
}

const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function applyPlan(db: SupabaseClient, plan: SyncPlan, personaByKey: Map<string, string | null>) {
  const now = new Date().toISOString();

  // Accounts. New rows carry owner and tier (first import only); existing rows get research fields only.
  const accountRow = (a: SyncPlan["accounts"][number]) => ({
    sheet_account_id: a.sheetAccountId,
    name: a.fields.name,
    domain: normalizeDomain(a.fields.domain),
    segment: a.fields.segment || null,
    icp_verdict: a.verdict,
    archived: a.archived,
    hq: a.fields.hq || null,
    revenue: a.fields.revenue || null,
    employees: a.fields.employees || null,
    ownership: a.fields.ownership || null,
    coupa_evidence: a.fields.coupa_evidence || null,
    trigger: a.fields.trigger || null,
    trigger_date: a.fields.trigger_date,
    signals: a.fields.signals || null,
    disqualifier_flags: a.fields.disqualifier_flags || null,
    outreach_angle: a.fields.outreach_angle || null,
    target_contact_notes: a.fields.target_contact_notes || null,
    do_not_contact: a.fields.do_not_contact,
    custom_fields: a.custom_fields,
    sheet_owner_hint: a.sheetOwnerHint,
    sheet_deleted_at: null,
    last_synced_at: now,
  });
  const fresh = plan.accounts.filter((a) => a.isNew).map((a) => ({ ...accountRow(a), owner_id: a.ownerId, tier: a.tier }));
  const existing = plan.accounts.filter((a) => !a.isNew).map(accountRow);
  for (const part of chunk(fresh)) {
    const { error } = await db.from("accounts").insert(part);
    if (error) throw new Error(`Insert accounts: ${error.message}`);
  }
  for (const part of chunk(existing)) {
    const { error } = await db.from("accounts").upsert(part, { onConflict: "sheet_account_id" });
    if (error) throw new Error(`Update accounts: ${error.message}`);
  }

  const idRows = await all<{ id: string; sheet_account_id: string }>(db.from("accounts").select("id, sheet_account_id"));
  const accountUuid = new Map(idRows.map((r) => [r.sheet_account_id, r.id]));

  // Contacts. Sheet persona wins; a blank sheet persona keeps the app's, or a title guess for a new contact.
  const contactRows = plan.contacts.map((c) => ({
    sheet_contact_key: c.sheetContactKey,
    account_id: accountUuid.get(c.accountSheetId)!,
    full_name: c.fields.full_name,
    title: c.fields.title || null,
    persona: c.persona ?? personaByKey.get(c.sheetContactKey) ?? guessPersona(c.fields.title),
    seniority: c.fields.seniority || null,
    email: c.fields.email || null,
    email_status: c.fields.email_status || null,
    phone: c.fields.phone || null,
    linkedin_url: c.fields.linkedin_url || null,
    country: c.fields.country ?? "US",
    linkedin_signals: c.linkedin_signals,
    notes: c.fields.notes || null,
    exclude: c.fields.exclude,
    ...(c.doNotContact ? { do_not_contact: true } : {}),
    ...(c.changed ? { changed_flag: true } : {}),
    sheet_deleted_at: null,
  }));
  // Uniform column sets per batch (PostgREST bulk upsert needs them).
  const groups = new Map<string, typeof contactRows>();
  for (const r of contactRows) {
    const key = Object.keys(r).sort().join(",");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const rows of groups.values()) {
    for (const part of chunk(rows)) {
      const { error } = await db.from("contacts").upsert(part, { onConflict: "sheet_contact_key" });
      if (error) throw new Error(`Upsert contacts: ${error.message}`);
    }
  }

  // Deleted rows: flag, never delete.
  if (plan.flagDeletedAccounts.length) {
    await db.from("accounts").update({ sheet_deleted_at: now }).in("sheet_account_id", plan.flagDeletedAccounts);
  }
  if (plan.flagDeletedContacts.length) {
    await db.from("contacts").update({ sheet_deleted_at: now }).in("sheet_contact_key", plan.flagDeletedContacts);
  }

  // Tracks: a changed contact pauses; an excluded, do-not-contact or deleted contact stops (history kept).
  const contactIds = await all<{ id: string; sheet_contact_key: string }>(db.from("contacts").select("id, sheet_contact_key"));
  const uuidByKey = new Map(contactIds.map((c) => [c.sheet_contact_key, c.id]));
  const changed = plan.contacts.filter((c) => c.changed).map((c) => uuidByKey.get(c.sheetContactKey)!).filter(Boolean);
  const stopped = [
    ...plan.contacts.filter((c) => c.fields.exclude || c.doNotContact).map((c) => uuidByKey.get(c.sheetContactKey)!),
    ...plan.flagDeletedContacts.map((k) => uuidByKey.get(k)!),
  ].filter(Boolean);
  if (changed.length) {
    await db.from("contact_tracks").update({ status: "paused", pause_reason: "Contact changed in the sheet" })
      .in("contact_id", changed).in("status", ["not_started", "active"]);
  }
  if (stopped.length) {
    await db.from("contact_tracks").update({ status: "stopped", pause_reason: "Excluded or removed in the sheet" })
      .in("contact_id", stopped).in("status", ["not_started", "active", "paused"]);
  }

  await syncDataQuality(db, plan.dq);

  // Dated signals and the play each account earned. Runs before auto-draft so only live accounts get drafted.
  await refreshPlays(db, { accountIds: plan.accounts.map((a) => accountUuid.get(a.sheetAccountId)).filter((x): x is string => !!x) });

  // Drafts written before the signing rules get the right name, greeting and paragraphs.
  await resignOpenSteps(db).catch(() => 0);

  // Overnight drafts, if Settings > Claude spend says so (off by default: Claude writes when someone
  // clicks Generate). Super hot and Hot accounts are drafted in any tier, Warm follow the tier switch,
  // Nurture never. Nothing launches without the owner.
  const { data: settings } = await db.from("app_settings").select("auto_draft").maybeSingle();
  return queueOvernightDrafts(db, ((settings?.auto_draft as AutoDraftMode | undefined) ?? "off"));
}

async function syncDataQuality(db: SupabaseClient, issues: DqIssue[]) {
  const open = await all<{ id: string; sheet_tab: string; sheet_key: string | null; issue_type: string }>(
    db.from("data_quality_issues").select("id, sheet_tab, sheet_key, issue_type").eq("status", "open"),
  );
  // Rows someone chose to ignore stay ignored until the issue itself changes.
  const ignored = await all<{ sheet_tab: string; sheet_key: string | null; issue_type: string }>(
    db.from("data_quality_issues").select("sheet_tab, sheet_key, issue_type").eq("status", "ignored"),
  );
  const keyOf = (tab: string, key: string | null, type: string) => `${tab}|${key ?? ""}|${type}`;
  const current = new Map(issues.map((i) => [keyOf(i.tab, i.key, i.type), i]));
  const openByKey = new Map(open.map((o) => [keyOf(o.sheet_tab, o.sheet_key, o.issue_type), o]));
  const now = new Date().toISOString();

  const ignoredKeys = new Set(ignored.map((o) => keyOf(o.sheet_tab, o.sheet_key, o.issue_type)));
  const toInsert = [...current.entries()].filter(([k]) => !openByKey.has(k) && !ignoredKeys.has(k)).map(([, i]) => ({
    sheet_tab: i.tab, sheet_row: i.row, sheet_key: i.key, issue_type: i.type, details: i.details,
  }));
  const stillOpen = open.filter((o) => current.has(keyOf(o.sheet_tab, o.sheet_key, o.issue_type))).map((o) => o.id);
  const resolved = open.filter((o) => !current.has(keyOf(o.sheet_tab, o.sheet_key, o.issue_type))).map((o) => o.id);

  for (const part of chunk(toInsert)) await db.from("data_quality_issues").insert(part);
  for (const part of chunk(stillOpen)) await db.from("data_quality_issues").update({ last_seen_at: now }).in("id", part);
  for (const part of chunk(resolved)) await db.from("data_quality_issues").update({ status: "resolved", resolved_at: now }).in("id", part);
}

async function writebackData(db: SupabaseClient): Promise<Map<string, AccountWriteback>> {
  const rows = await all<{
    sheet_account_id: string; campaign_status: CampaignStatus | null; last_touch: string | null;
    next_step_date: string | null; contacts_engaged: number; contacts_total: number;
  }>(db.from("account_rollup").select("sheet_account_id, campaign_status, last_touch, next_step_date, contacts_engaged, contacts_total"));
  return new Map(rows.map((r) => [r.sheet_account_id, {
    campaignStatus: r.campaign_status, lastTouch: r.last_touch, nextStepDate: r.next_step_date,
    contactsEngaged: r.contacts_engaged, contactsTotal: r.contacts_total,
  }]));
}

/**
 * Plan and apply a sync from sheet values already in hand. Returns the cells
 * to write back (already checked against the write guards). Used by the
 * hourly sync and by local loading from exported tabs.
 */
export async function syncFromValues(db: SupabaseClient, master: string[][], contacts: string[][], opts: { dryRun?: boolean } = {}) {
  const { snapshot, personaByKey } = await loadSnapshot(db);
  const plan = planSync(master, contacts, snapshot);
  let autoDraftQueued = 0;
  let writebackCells = 0;
  let missingWritebackColumns: string[] = planWriteback(master, new Map()).missingColumns;
  let writes: SyncPlan["sheetWrites"] = [];

  if (plan.ok && !opts.dryRun) {
    autoDraftQueued = await applyPlan(db, plan, personaByKey);
    const wb = planWriteback(master, await writebackData(db));
    missingWritebackColumns = wb.missingColumns;
    writes = [...plan.sheetWrites, ...wb.writes];
    assertMasterWritesAllowed(master, writes);
    assertContactWritesAllowed(contacts, writes);
    writebackCells = wb.writes.length;
  }
  return { plan, writes, autoDraftQueued, writebackCells, missingWritebackColumns };
}

/** One full sync: read, plan, apply, write IDs and status back. A dry run reads and plans only. */
export async function runSheetSync(opts: SyncOptions = {}): Promise<SyncResult> {
  const db = supabaseAdmin();
  if (!db) throw new Error("Database is not configured");
  const dryRun = !!opts.dryRun;

  const { data: run } = await db.from("sync_runs").insert({ kind: "sheet", dry_run: dryRun, triggered_by: opts.triggeredBy ?? null }).select("id").single();
  const runId: string | null = run?.id ?? null;

  try {
    const sheetId = await sheetIdFor(db);
    const t = tabs();
    const [master, contacts] = await Promise.all([readTab(sheetId, t.master), readTab(sheetId, t.contacts)]);
    const r = await syncFromValues(db, master, contacts, { dryRun });
    if (r.writes.length) await writeCells(sheetId, t, r.writes);

    // Rows to check, not counting the ones someone chose to ignore.
    const { count: openDq } = dryRun ? { count: null } : await db.from("data_quality_issues").select("id", { count: "exact", head: true }).eq("status", "open");
    const counts = { ...r.plan.counts, dqOpen: openDq ?? r.plan.dq.length, writebackCells: r.writebackCells, autoDraftQueued: r.autoDraftQueued };
    await db.from("sync_runs").update({
      status: r.plan.ok ? "ok" : "failed",
      finished_at: new Date().toISOString(),
      counts,
      error: r.plan.ok ? null : r.plan.fatal.join("; "),
    }).eq("id", runId);

    return { ok: r.plan.ok, dryRun, runId, counts, fatal: r.plan.fatal, missingWritebackColumns: r.missingWritebackColumns };
  } catch (e) {
    const message = (e as Error).message;
    await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: message }).eq("id", runId);
    throw e;
  }
}
