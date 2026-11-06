import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** What each sync issue means and how to fix it in the sheet, in plain words. */
export const DQ_TYPES: Record<string, { label: string; fix: string }> = {
  unlinked_contact: { label: "Contact not linked to an account", fix: "The company name or email domain does not match an account in Master. Type the right ACC-number in the contact's Account ID column, or add the account to Master." },
  email_domain_mismatch: { label: "Email domain differs from the account", fix: "The email is at another company's domain. If the person really belongs to this account, type the ACC-number in Account ID to confirm." },
  possible_duplicate_contact: { label: "Possible duplicate contact", fix: "Same name at the same account. Delete the extra row, or type KEEP in Contact ID if it is a different person." },
  duplicate_contact: { label: "Duplicate contact", fix: "Same person listed twice. Delete the extra row; the app already ignores it." },
  same_person_two_accounts: { label: "Same person under two accounts", fix: "Keep the row under the right account and delete the other." },
  shared_email: { label: "Two people share one email", fix: "One of the two emails is likely wrong. Correct it in the sheet." },
  no_email_no_linkedin: { label: "No email and no LinkedIn", fix: "Nothing to reach them on. Add an email or LinkedIn URL, or ignore." },
  retired_title: { label: "Title says retired", fix: "Probably no longer reachable. Remove the row, or ignore if the title is wrong." },
  duplicate_account: { label: "Duplicate account", fix: "Same company twice in Master. Delete the extra row." },
  unknown_owner: { label: "Owner not recognised", fix: "The Owner column must be Rajiv, Sid, Mouli or Shweta." },
  missing_verdict: { label: "ICP Verdict missing", fix: "Set ICP Verdict to FIT, MAYBE or NO-FIT. Until then the account is archived." },
  missing_tier: { label: "Tier missing", fix: "Set Tier to A, B, C or D." },
  verdict_tier_mismatch: { label: "Tier D marked FIT", fix: "Check whether the tier or the verdict is right." },
  missing_header: { label: "Missing column", fix: "A required column header is missing from the sheet. Add it back exactly as named." },
};

export type DqRow = { id: string; sheet_tab: string; sheet_row: number | null; sheet_key: string | null; issue_type: string; details: string | null; first_seen_at: string };

export async function loadDataSettings(db: SupabaseClient) {
  const [{ data: lastRun }, { data: lastOk }, issues, { data: settings }] = await Promise.all([
    db.from("sync_runs").select("status, started_at, finished_at, counts, error").eq("dry_run", false).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("sync_runs").select("finished_at").eq("dry_run", false).in("status", ["ok", "partial"]).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    (async () => {
      const rows: DqRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await db.from("data_quality_issues").select("id, sheet_tab, sheet_row, sheet_key, issue_type, details, first_seen_at").eq("status", "open").order("sheet_tab").order("sheet_row").range(from, from + 999);
        rows.push(...((data ?? []) as DqRow[]));
        if (!data || data.length < 1000) return rows;
      }
    })(),
    db.from("app_settings").select("sheet_id").maybeSingle(),
  ]);
  const sheetId = (settings?.sheet_id as string | null) || process.env.GOOGLE_SHEET_ID || null;
  const groups = Object.entries(
    issues.reduce<Record<string, DqRow[]>>((acc, r) => ((acc[r.issue_type] ??= []).push(r), acc), {}),
  )
    .map(([type, rows]) => ({ type, label: DQ_TYPES[type]?.label ?? type.replace(/_/g, " "), fix: DQ_TYPES[type]?.fix ?? "", rows }))
    .sort((a, b) => b.rows.length - a.rows.length);
  return {
    lastRun: lastRun ? { status: lastRun.status as string, at: (lastRun.finished_at ?? lastRun.started_at) as string, error: (lastRun.error as string | null) ?? null } : null,
    lastOkAt: (lastOk?.finished_at as string | null) ?? null,
    total: issues.length,
    groups,
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null,
  };
}

/** For the top bar: when the sheet last synced. */
export async function lastSheetSync(db: SupabaseClient) {
  const { data } = await db.from("sync_runs").select("finished_at, status").eq("dry_run", false).not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { at: data.finished_at as string, ok: data.status !== "failed" } : null;
}
