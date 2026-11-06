/**
 * The sheet is read by header name, never by column position, so Mouli can
 * reorder or add columns freely. Each app field lists the header spellings it
 * accepts (the real Coupa_Account_Book names first).
 */

export const MASTER_FIELDS = {
  sheet_account_id: ["account id"],
  name: ["company", "account name"],
  owner: ["owner"],
  tier: ["tier"],
  status: ["status"],
  icp_verdict: ["icp verdict"],
  domain: ["domain"],
  segment: ["segment"],
  hq: ["hq"],
  revenue: ["revenue (~)", "revenue"],
  employees: ["employees"],
  ownership: ["ownership"],
  coupa_evidence: ["coupa evidence"],
  trigger: ["trigger / why now", "trigger"],
  trigger_date: ["trigger date"],
  signals: ["signal evidence", "signals"],
  disqualifier_flags: ["disqualifier flags"],
  outreach_angle: ["outreach angle notes", "outreach angle"],
  target_contact_notes: ["target contacts notes", "target contact notes"],
  do_not_contact: ["do not contact"],
  // Written by the app
  last_touch: ["last touch"],
  next_step_date: ["next step date"],
  contacts_engaged: ["contacts engaged"],
} as const;

export const CONTACT_FIELDS = {
  sheet_contact_key: ["contact id"],
  account_id: ["account id"],
  full_name: ["full name", "name"],
  title: ["title"],
  company: ["company"],
  linkedin_url: ["linkedin url", "linkedin"],
  email: ["best email", "email"],
  email_status: ["best email status", "email status"],
  phone: ["best phone (wiza)", "phone"],
  location: ["location"],
  country: ["country"],
  persona: ["persona"],
  seniority: ["seniority"],
  exclude: ["exclude"],
  notes: ["notes"],
  company_domain: ["wiza company_domain", "company domain"],
} as const;

/** Evaboot columns passed to Claude as LinkedIn signals (never phone or email). */
export const LINKEDIN_SIGNAL_HEADERS: Record<string, string> = {
  "evaboot has new position": "has_new_position",
  "evaboot recently hired (90d)": "recently_hired_90d",
  "evaboot recently promoted (90d)": "recently_promoted_90d",
  "evaboot recent posts (30d)": "recent_posts_30d",
  "evaboot posting frequency": "posting_frequency",
  "evaboot mentioned in news (30d)": "mentioned_in_news_30d",
  "evaboot profile mutual connections": "mutual_connections",
  "evaboot months in position": "months_in_position",
  "evaboot years in position": "years_in_position",
};

/** App-owned Master columns. The sync writes these and nothing else in Master. */
export const MASTER_WRITEBACK_FIELDS = ["status", "last_touch", "next_step_date", "contacts_engaged"] as const;

export type MasterField = keyof typeof MASTER_FIELDS;
export type ContactField = keyof typeof CONTACT_FIELDS;

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export type HeaderIndex<F extends string> = {
  /** column index (0-based) for each field found */
  col: Partial<Record<F, number>>;
  /** headers that map to no field, kept as custom fields */
  extra: Array<{ header: string; col: number }>;
};

export function buildHeaderIndex<F extends string>(
  headerRow: readonly string[],
  fields: Record<F, readonly string[]>,
): HeaderIndex<F> {
  const col: Partial<Record<F, number>> = {};
  const used = new Set<number>();
  const normalized = headerRow.map((h) => normalizeHeader(h ?? ""));

  for (const field of Object.keys(fields) as F[]) {
    for (const alias of fields[field]) {
      const i = normalized.indexOf(alias);
      if (i >= 0 && !used.has(i)) {
        col[field] = i;
        used.add(i);
        break;
      }
    }
  }
  const extra = normalized
    .map((h, i) => ({ header: headerRow[i]?.trim() ?? "", col: i, norm: h }))
    .filter((x) => x.norm && !used.has(x.col))
    .map(({ header, col: c }) => ({ header, col: c }));
  return { col, extra };
}

/** 0-based column index -> A1 letters (0 -> A, 25 -> Z, 26 -> AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cell(row: readonly string[] | undefined, i: number | undefined): string {
  if (i === undefined || !row) return "";
  return (row[i] ?? "").toString().trim();
}
