import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIn, type IsoDate } from "@/lib/calendar/dates";
import { columnLetter } from "@/lib/sheet-sync/headers";
import { refreshPlays } from "@/lib/playbook/service";
import { refreshPriorities } from "@/lib/jobs/daily";
import { LIMITS, TEST_ACCOUNT, contentKey, decideRows, effectOf, parseFeedTab, rowHash, type Decision, type DecideCtx } from "./validate";

/**
 * Reads the vendor's Signals tab, decides every new row under the limits, writes a status back to the tab,
 * stores accepted signals, and recomputes level, play and priority for the accounts that changed.
 * The vendor never touches the master sheet and the app never edits the vendor's columns.
 */

export type FeedIO = {
  read(tab: string): Promise<string[][]>;
  write(updates: ReadonlyArray<{ tab: string; range: string; values: string[][] }>): Promise<void>;
  clear(tab: string, range: string): Promise<void>;
};

export const FEED_TABS = { signals: "Signals", watch: "Accounts to watch" } as const;
const STATUS_LABEL: Record<string, string> = { accepted: "Accepted", duplicate: "Duplicate", rejected: "Rejected", deferred: "Held", superseded: "Superseded" };
const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const safe = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

/** The derived text the gate reads: one pipe line per live vendor signal. */
export function vendorLines(rows: Array<{ signal_id: string; seen_on: string; evidence: string; source_url: string | null; confidence: string | null }>): string {
  return rows.map((r) => `${r.signal_id} | ${r.seen_on} | ${safe(r.evidence)} | ${(r.source_url ?? "").replace(/\|/g, "%7C")} | ${r.confidence === "likely" ? "Likely" : "Confirmed"}`).join("\n");
}

export async function ingestVendorSignals(db: SupabaseClient, io: FeedIO, opts: { today?: IsoDate } = {}) {
  const today = opts.today ?? todayIn();
  const now = new Date();
  const dayStart = `${today}T00:00:00.000Z`;
  const { data: run } = await db.from("signal_feed_runs").insert({}).select("id").single();
  const finish = async (patch: Record<string, unknown>) => { if (run) await db.from("signal_feed_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id); };

  try {
    // 1. The watch list the vendor reads: IDs, names and domains only. Nothing else leaves the app.
    const { data: accts } = await db.from("accounts").select("id, sheet_account_id, name, domain, archived, do_not_contact").is("deleted_at", null).order("sheet_account_id").limit(5000);
    const active = (accts ?? []).filter((a) => !a.archived && !a.do_not_contact && a.sheet_account_id);
    // The sandbox account comes first so the vendor can test before touching a real account.
    const watch = [["Account ID", "Account", "Domain"], [TEST_ACCOUNT.sheetId, TEST_ACCOUNT.name, TEST_ACCOUNT.domain], ...active.map((a) => [String(a.sheet_account_id), String(a.name), String(a.domain ?? "")])];
    await io.write([{ tab: FEED_TABS.watch, range: `A1:C${watch.length}`, values: watch }]);
    await io.clear(FEED_TABS.watch, `A${watch.length + 1}:C5000`);

    // 2. The vendor's rows.
    const values = await io.read(FEED_TABS.signals);
    const parsed = parseFeedTab(values);
    if (parsed.problem) { await finish({ error: parsed.problem }); return { ok: false as const, error: parsed.problem }; }

    // 3. What the app already knows and today's counters.
    const refs = [...new Set(parsed.rows.map((r) => r.ref).filter(Boolean))];
    const known = new Map<string, { hash: string; status: string }>();
    for (const part of chunk(refs)) {
      const { data } = await db.from("signal_feed_rows").select("vendor_ref, row_hash, status").in("vendor_ref", part);
      for (const r of data ?? []) known.set(r.vendor_ref as string, { hash: r.row_hash as string, status: r.status as string });
    }
    const { data: vendorSignals } = await db.from("account_signals").select("account_id, signal_id, seen_on, source_url").eq("source", "vendor").eq("expired", false).gte("seen_on", addDays(today, -LIMITS.maxAgeDays - 1)).limit(20000);
    const contentKeys = new Set((vendorSignals ?? []).map((v) => contentKey(v.account_id as string, v.signal_id as string, v.seen_on as string, (v.source_url as string | null) ?? "")));
    // Test rows are never stored as signals, so their content keys live on the feed rows.
    const { data: testRows } = await db.from("signal_feed_rows").select("content_key").eq("sheet_account_id", TEST_ACCOUNT.sheetId).eq("status", "accepted").not("content_key", "is", null).limit(5000);
    for (const t of testRows ?? []) contentKeys.add(t.content_key as string);
    const { data: recent } = await db.from("signal_feed_rows").select("account_id, decided_at").eq("status", "accepted").not("account_id", "is", null).gte("decided_at", new Date(now.getTime() - 7 * 86_400_000).toISOString()).limit(20000);
    const acceptedToday = (recent ?? []).filter((r) => (r.decided_at as string) >= dayStart);
    const perAccountWeek = new Map<string, number>();
    for (const r of recent ?? []) if (r.account_id) perAccountWeek.set(r.account_id as string, (perAccountWeek.get(r.account_id as string) ?? 0) + 1);

    const ctx: DecideCtx = {
      today, known, contentKeys, perAccountWeek,
      accounts: new Map([
        [TEST_ACCOUNT.sheetId, { id: TEST_ACCOUNT.id, active: true }],
        ...(accts ?? []).filter((a) => a.sheet_account_id).map((a): [string, { id: string; active: boolean }] => [String(a.sheet_account_id).toUpperCase(), { id: a.id as string, active: !a.archived && !a.do_not_contact }]),
      ]),
      acceptedToday: acceptedToday.length,
      accountsToday: new Set(acceptedToday.map((r) => r.account_id as string).filter(Boolean)),
    };
    const decisions = decideRows(parsed.rows, ctx);

    // 4. Store what was decided. A row without a ref cannot be tracked, so it only gets its status written back.
    const touched = new Set<string>();
    const rowOf = new Map(parsed.rows.map((r) => [r.ref, r.sheetRow]));
    for (const d of decisions) {
      const isTest = d.accept?.accountId === TEST_ACCOUNT.id || d.row.accountId.toUpperCase() === TEST_ACCOUNT.sheetId;
      const acct = isTest ? null : (d.accept?.accountId ?? ctx.accounts.get(d.row.accountId.toUpperCase())?.id ?? null);
      if (d.status === "accepted" && d.accept && !isTest) {
        const a = d.accept;
        const { error } = await db.from("account_signals").upsert({
          account_id: a.accountId, signal_id: a.signalId, seen_on: a.seenOn, evidence: a.evidence, source_url: a.url, confidence: a.confidence,
          expired: false, legacy: false, line_key: `V|${a.ref}`, source: "vendor", vendor_ref: a.ref, ingested_at: now.toISOString(),
        }, { onConflict: "account_id,line_key" });
        if (error) { await db.from("signal_feed_rows").upsert({ vendor_ref: a.ref, account_id: a.accountId, sheet_account_id: d.row.accountId, signal_id: a.signalId, status: "rejected", reason: "Could not be saved. It will be retried.", row_hash: "retry", sheet_row: d.row.sheetRow }, { onConflict: "vendor_ref" }); continue; }
        touched.add(a.accountId);
        if (a.replaces) {
          await db.from("account_signals").update({ expired: true }).eq("vendor_ref", a.replaces).eq("account_id", a.accountId);
          await db.from("signal_feed_rows").update({ status: "superseded", reason: `Replaced by ${a.ref}`, decided_at: now.toISOString() }).eq("vendor_ref", a.replaces);
        }
      }
      if (d.status === "accepted" && d.accept && isTest && d.accept.replaces) {
        await db.from("signal_feed_rows").update({ status: "superseded", reason: `Replaced by ${d.accept.ref}`, content_key: null, decided_at: now.toISOString() }).eq("vendor_ref", d.accept.replaces);
      }
      if (d.row.ref) {
        await db.from("signal_feed_rows").upsert({
          vendor_ref: d.row.ref, account_id: acct, sheet_account_id: d.row.accountId || null, signal_id: d.accept?.signalId ?? (d.row.signalId || null),
          status: d.status, reason: d.reason, effect: d.accept ? effectOf(d.accept.seenOn, today, isTest) : null, row_hash: rowHash(d.row), sheet_row: d.row.sheetRow, decided_at: now.toISOString(),
          content_key: d.accept ? contentKey(d.accept.accountId, d.accept.signalId, d.accept.seenOn, d.accept.url) : null,
        }, { onConflict: "vendor_ref" });
      }
    }

    // 5. The text the gate reads, for accounts whose vendor signals changed.
    for (const part of chunk([...touched], 100)) {
      for (const accountId of part) {
        const { data: live } = await db.from("account_signals").select("signal_id, seen_on, evidence, source_url, confidence").eq("account_id", accountId).eq("source", "vendor").eq("expired", false).gte("seen_on", addDays(today, -365)).order("seen_on", { ascending: false }).limit(200);
        await db.from("accounts").update({ vendor_signals: vendorLines((live ?? []) as never), signals_changed_at: now.toISOString() }).eq("id", accountId);
      }
    }
    if (touched.size) {
      await refreshPlays(db, { accountIds: [...touched], today });
      await refreshPriorities(db).catch(() => 0);
    }

    // 6. Tell the vendor what happened to each row. Only cells that would change are written.
    const col = parsed.col;
    const cur = (r: number, name: string) => (col[name] >= 0 ? String(values[r - 1]?.[col[name]] ?? "") : "");
    const updates: Array<{ tab: string; range: string; values: string[][] }> = [];
    const label = (d: Decision) => STATUS_LABEL[d.status];
    for (const d of decisions) {
      const want = [label(d), d.reason ?? "", d.accept ? effectOf(d.accept.seenOn, today, d.accept.accountId === TEST_ACCOUNT.id) : ""];
      const have = [cur(d.row.sheetRow, "Status"), cur(d.row.sheetRow, "Reason"), cur(d.row.sheetRow, "Effect")];
      if (want.every((w, i) => w === have[i]) || col.Status < 0) continue;
      const a = columnLetter(col.Status);
      updates.push({ tab: FEED_TABS.signals, range: `${a}${d.row.sheetRow}:${columnLetter(col.Status + 2)}${d.row.sheetRow}`, values: [want] });
    }
    for (const d of decisions) {
      const old = d.accept?.replaces ? rowOf.get(d.accept.replaces) : null;
      if (old && col.Status >= 0) updates.push({ tab: FEED_TABS.signals, range: `${columnLetter(col.Status)}${old}:${columnLetter(col.Status + 2)}${old}`, values: [["Superseded", `Replaced by ${d.accept!.ref}`, ""]] });
    }
    await io.write(updates);

    const count = (s: string) => decisions.filter((d) => d.status === s).length;
    const summary = { rowsRead: parsed.rows.length, accepted: count("accepted"), duplicates: count("duplicate"), rejected: count("rejected"), deferred: count("deferred"), accountsTouched: touched.size };
    await finish({ rows_read: summary.rowsRead, accepted: summary.accepted, duplicates: summary.duplicates, rejected: summary.rejected, deferred: summary.deferred, accounts_touched: summary.accountsTouched });
    return { ok: true as const, ...summary };
  } catch (e) {
    await finish({ error: (e as Error).message.slice(0, 500) });
    return { ok: false as const, error: (e as Error).message };
  }
}

/** The real feed: a Google Sheet shared with the service account. Returns null when no feed sheet is configured. */
export async function googleFeedIO(): Promise<FeedIO | null> {
  const id = process.env.GOOGLE_SIGNALS_SHEET_ID;
  if (!id) return null;
  const sheets = await import("@/lib/google/sheets");
  return { read: (tab) => sheets.readTab(id, tab), write: (u) => sheets.writeRanges(id, u), clear: (tab, range) => sheets.clearRange(id, tab, range) };
}
