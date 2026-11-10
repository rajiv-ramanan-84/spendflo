import { createHash } from "node:crypto";
import { addDays, isIsoDate, type IsoDate } from "@/lib/calendar/dates";
import { FIT_FACT_IDS, normalizeSignalId, signalDef } from "@/lib/playbook/catalog";

/**
 * The rules for a row in the vendor's Signals tab. Pure: no sheet, no database, no clock.
 * Everything the vendor writes is checked here, and anything that fails never reaches scoring.
 */

export const LIMITS = {
  rowsPerDay: 500,
  accountsPerDay: 50,
  perAccountPerWeek: 10,
  maxAgeDays: 180,
  evidenceMax: 250,
  urlMax: 500,
  refMax: 80,
} as const;

/** The columns the vendor writes, then the ones only the app writes. */
export const VENDOR_COLUMNS = ["Vendor ref", "Account ID", "Signal ID", "Signal date", "Evidence", "Source URL", "Confidence", "Replaces ref"] as const;
export const APP_COLUMNS = ["Status", "Reason", "Effect"] as const;

export type FeedRow = { sheetRow: number; ref: string; accountId: string; signalId: string; date: string; evidence: string; url: string; confidence: string; replaces: string };
export type FeedStatus = "accepted" | "duplicate" | "rejected" | "deferred";
export type Accepted = { accountId: string; signalId: string; seenOn: IsoDate; evidence: string; url: string; confidence: "confirmed" | "likely"; ref: string; replaces: string | null };
export type Decision = { row: FeedRow; status: FeedStatus; reason: string | null; accept?: Accepted };

export type KnownRef = { hash: string; status: string };
export type DecideCtx = {
  today: IsoDate;
  /** Sheet account ID (ACC-004) to the account's database id and whether it can take signals. */
  accounts: Map<string, { id: string; active: boolean }>;
  /** Refs the app has decided about before, with the row's content hash then. */
  known: Map<string, KnownRef>;
  /** Content keys of accepted signals already stored: account|signal|date|url. */
  contentKeys: Set<string>;
  /** Rows accepted so far today, and the accounts they touched. */
  acceptedToday: number;
  accountsToday: Set<string>;
  /** Rows accepted per account over the last 7 days. */
  perAccountWeek: Map<string, number>;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
export const rowHash = (r: Pick<FeedRow, "ref" | "accountId" | "signalId" | "date" | "evidence" | "url" | "confidence" | "replaces">) =>
  createHash("sha1").update([r.ref, r.accountId, r.signalId, r.date, r.evidence, r.url, r.confidence, r.replaces].map(norm).join("\u0001")).digest("hex");

const urlKey = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/+$/, "");
export const contentKey = (accountId: string, signalId: string, date: string, url: string) => `${accountId}|${signalId}|${date}|${urlKey(url)}`;

export function isBlank(r: FeedRow): boolean {
  return !(r.ref || r.accountId || r.signalId || r.date || r.evidence || r.url || r.confidence || r.replaces);
}

/** Why a row is not acceptable, or null when its fields are fine. The checks run in the order a person would fix them. */
export function fieldProblem(r: FeedRow, today: IsoDate): string | null {
  if (!r.ref) return "Vendor ref is empty. Every row needs your own unique ID for it.";
  if (r.ref.length > LIMITS.refMax) return `Vendor ref is over ${LIMITS.refMax} characters.`;
  if (!r.accountId) return "Account ID is empty.";
  const sid = normalizeSignalId(r.signalId);
  if (!sid || !signalDef(sid)) return "Signal ID must be one of the listed signals, for example A1.S1 or E2.";
  if (FIT_FACT_IDS.has(sid)) return `${sid} is a fit fact we maintain ourselves, not an event. Leave it out.`;
  if (!isIsoDate(r.date)) return "Signal date must be a real date written like 2026-11-03.";
  if (r.date > today) return "Signal date is in the future.";
  if (r.date < addDays(today, -LIMITS.maxAgeDays)) return `Signal date is more than ${LIMITS.maxAgeDays} days old. Only recent events are accepted.`;
  if (!r.evidence) return "Evidence is empty. Write one factual sentence.";
  if (r.evidence.length > LIMITS.evidenceMax) return `Evidence is ${r.evidence.length} characters. Keep it to ${LIMITS.evidenceMax} or fewer, one factual sentence.`;
  if (!/^https?:\/\/\S+\.\S+/i.test(r.url) || r.url.length > LIMITS.urlMax) return "Source URL must be a full link starting with https://.";
  if (!/^(confirmed|likely)$/i.test(r.confidence)) return "Confidence must be Confirmed or Likely.";
  return null;
}

/**
 * Decides every row in sheet order. Rows already decided with the same content are left alone (no decision).
 * Limits are applied in order, so what is over the limit waits for the next day instead of being thrown away.
 */
export function decideRows(rows: FeedRow[], ctx: DecideCtx): Decision[] {
  const out: Decision[] = [];
  let acceptedToday = ctx.acceptedToday;
  const accountsToday = new Set(ctx.accountsToday);
  const perAccount = new Map(ctx.perAccountWeek);
  const seenRefs = new Set<string>();
  const keys = new Set(ctx.contentKeys);
  const acceptedRefs = new Set<string>();

  for (const row of rows) {
    if (isBlank(row)) continue;
    const hash = rowHash(row);
    const known = row.ref ? ctx.known.get(row.ref) : undefined;
    // Decided before and unchanged: nothing to do, unless it was held back for a limit.
    if (known && known.hash === hash && known.status !== "deferred") continue;
    // The same ref twice in one pass: only the first counts.
    if (row.ref && seenRefs.has(row.ref)) { out.push({ row, status: "duplicate", reason: "This Vendor ref appears more than once. Only the first row counts." }); continue; }
    if (row.ref) seenRefs.add(row.ref);
    // An accepted row whose content was edited afterwards is not re-decided: send a new row with a new ref.
    if (known && known.hash !== hash && known.status === "accepted") { out.push({ row, status: "rejected", reason: "This row was already accepted and then changed. Send the correction as a new row with a new Vendor ref and put the old one in Replaces ref." }); continue; }

    const problem = fieldProblem(row, ctx.today);
    if (problem) { out.push({ row, status: "rejected", reason: problem }); continue; }
    const acct = ctx.accounts.get(row.accountId.toUpperCase());
    if (!acct) { out.push({ row, status: "rejected", reason: "Account ID is not in Accounts to watch. Use the IDs on that tab exactly." }); continue; }
    if (!acct.active) { out.push({ row, status: "rejected", reason: "This account is not active (archived or do not contact), so it takes no signals." }); continue; }
    if (row.replaces && !ctx.known.has(row.replaces) && !acceptedRefs.has(row.replaces)) { out.push({ row, status: "rejected", reason: "Replaces ref does not match an earlier Vendor ref." }); continue; }

    const sid = normalizeSignalId(row.signalId);
    const key = contentKey(acct.id, sid, row.date, row.url);
    if (keys.has(key)) { out.push({ row, status: "duplicate", reason: "The same event for this account is already recorded." }); continue; }

    if (acceptedToday >= LIMITS.rowsPerDay) { out.push({ row, status: "deferred", reason: `Daily limit of ${LIMITS.rowsPerDay} rows reached. Held, and it is picked up automatically after midnight UTC.` }); continue; }
    if (!accountsToday.has(acct.id) && accountsToday.size >= LIMITS.accountsPerDay) { out.push({ row, status: "deferred", reason: `Daily limit of ${LIMITS.accountsPerDay} accounts reached. Held, and it is picked up automatically after midnight UTC.` }); continue; }
    if ((perAccount.get(acct.id) ?? 0) >= LIMITS.perAccountPerWeek) { out.push({ row, status: "deferred", reason: `This account already has ${LIMITS.perAccountPerWeek} new signals in the last 7 days. Held until some age out of that week.` }); continue; }

    acceptedToday++;
    accountsToday.add(acct.id);
    perAccount.set(acct.id, (perAccount.get(acct.id) ?? 0) + 1);
    keys.add(key);
    acceptedRefs.add(row.ref);
    out.push({
      row, status: "accepted", reason: null,
      accept: { accountId: acct.id, signalId: sid, seenOn: row.date as IsoDate, evidence: norm(row.evidence), url: row.url, confidence: row.confidence.toLowerCase() as "confirmed" | "likely", ref: row.ref, replaces: row.replaces || null },
    });
  }
  return out;
}

/** What an accepted signal does today, in the words the vendor sees. */
export function effectOf(seenOn: string, today: IsoDate): string {
  const age = Math.round((Date.parse(today) - Date.parse(seenOn)) / 86_400_000);
  return age <= 90 ? "Counts toward the account's level" : "Aging (91 to 180 days), counts toward Hot only";
}

/** Reads the vendor's tab into rows, finding columns by header name so column order never matters. */
export function parseFeedTab(values: string[][]): { rows: FeedRow[]; problem: string | null; col: Record<string, number> } {
  const header = (values[0] ?? []).map((h) => norm(String(h)).toLowerCase());
  const col: Record<string, number> = {};
  for (const name of [...VENDOR_COLUMNS, ...APP_COLUMNS]) col[name] = header.indexOf(name.toLowerCase());
  const missing = VENDOR_COLUMNS.filter((n) => col[n] < 0 && n !== "Replaces ref");
  if (missing.length) return { rows: [], problem: `The Signals tab is missing columns: ${missing.join(", ")}.`, col };
  const get = (r: string[], n: string) => (col[n] >= 0 ? norm(String(r[col[n]] ?? "")) : "");
  const rows = values.slice(1).map((r, i): FeedRow => ({
    sheetRow: i + 2, ref: get(r, "Vendor ref"), accountId: get(r, "Account ID"), signalId: get(r, "Signal ID"), date: get(r, "Signal date"),
    evidence: get(r, "Evidence"), url: get(r, "Source URL"), confidence: get(r, "Confidence"), replaces: get(r, "Replaces ref"),
  }));
  return { rows, problem: null, col };
}
