import { cell, CONTACT_FIELDS, LINKEDIN_SIGNAL_HEADERS, MASTER_FIELDS, normalizeHeader, type HeaderIndex } from "./headers";

export type Tier = "A" | "B" | "C" | "D";
export type Verdict = "fit" | "maybe" | "no_fit";
export type Persona =
  | "economic_buyer"
  | "procurement_leader"
  | "system_owner"
  | "contract_manager"
  | "legal"
  | "finance_ap"
  | "champion"
  | "other";

export function parseTier(v: string): Tier | null {
  const t = v.trim().toUpperCase();
  return t === "A" || t === "B" || t === "C" || t === "D" ? t : null;
}

export function parseVerdict(v: string): Verdict | null {
  const t = v.trim().toUpperCase().replace(/[\s_]+/g, "-");
  if (t === "FIT") return "fit";
  if (t === "MAYBE") return "maybe";
  if (t === "NO-FIT" || t === "NOFIT") return "no_fit";
  return null;
}

export function parseYes(v: string): boolean {
  return /^(y|yes|true|1|x)$/i.test(v.trim());
}

/** Accepts YYYY-MM-DD, or a value Sheets renders as M/D/YYYY. */
export function parseSheetDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

const PERSONA_LABELS: Record<string, Persona> = {
  "economic buyer": "economic_buyer",
  "procurement leader": "procurement_leader",
  "coupa or system owner": "system_owner",
  "system owner": "system_owner",
  "contract manager or legal ops": "contract_manager",
  "contract manager": "contract_manager",
  "legal or gc": "legal",
  legal: "legal",
  "finance or ap": "finance_ap",
  champion: "champion",
  other: "other",
};

export function parsePersona(v: string): Persona | null {
  return PERSONA_LABELS[normalizeHeader(v)] ?? null;
}

/**
 * A first guess from the job title, used to pre-fill the Persona column for
 * Mouli to review. Never overrides a persona typed in the sheet.
 */
export function guessPersona(title: string): Persona {
  const t = title.toLowerCase();
  if (/\b(coupa|e-?procurement|p2p|procure[- ]to[- ]pay|systems?|application|erp|sap|ariba)\b/.test(t)) return "system_owner";
  if (/\b(general counsel|legal|counsel|attorney|paralegal)\b/.test(t)) return /\b(contract|ops|operations)\b/.test(t) ? "contract_manager" : "legal";
  if (/\bcontract/.test(t)) return "contract_manager";
  if (/\b(accounts payable|ap\b|payables|controller)/.test(t)) return "finance_ap";
  if (/\b(chief of staff|strategy|transformation)\b/.test(t)) return "champion";
  if (/\b(cfo|chief financial|cpo|chief procurement|chief operating|coo|ceo|svp|evp|president)\b/.test(t)) return "economic_buyer";
  if (/\b(procurement|sourcing|purchasing|supply|buyer|category)\b/.test(t)) return "procurement_leader";
  if (/\b(finance|fp&a|treasury)\b/.test(t)) return "finance_ap";
  return "other";
}

const COUNTRY_NAMES: Record<string, string> = {
  "united states": "US",
  usa: "US",
  us: "US",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  canada: "CA",
  india: "IN",
  mexico: "MX",
  germany: "DE",
  france: "FR",
  ireland: "IE",
  netherlands: "NL",
  switzerland: "CH",
  australia: "AU",
  singapore: "SG",
  japan: "JP",
  denmark: "DK",
  sweden: "SE",
  spain: "ES",
  italy: "IT",
  brazil: "BR",
  china: "CN",
};

/** "Philadelphia, Pennsylvania, United States" -> "US". Unknown -> null (treated as US). */
export function countryFromLocation(location: string): string | null {
  const parts = location.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (COUNTRY_NAMES[parts[i]]) return COUNTRY_NAMES[parts[i]];
  }
  return null;
}

export type ParsedAccount = {
  row: number;
  idCell: string;
  sheet: {
    name: string;
    owner: string;
    tier: Tier | null;
    icp_verdict: Verdict | null;
    domain: string;
    segment: string;
    hq: string;
    revenue: string;
    employees: string;
    ownership: string;
    coupa_evidence: string;
    trigger: string;
    trigger_date: string | null;
    signals: string;
    disqualifier_flags: string;
    outreach_angle: string;
    target_contact_notes: string;
    do_not_contact: boolean;
  };
  custom_fields: Record<string, string>;
};

export function parseMasterRow(row: readonly string[], rowNumber: number, idx: HeaderIndex<keyof typeof MASTER_FIELDS>): ParsedAccount {
  const c = (f: keyof typeof MASTER_FIELDS) => cell(row, idx.col[f]);
  const custom: Record<string, string> = {};
  for (const x of idx.extra) {
    const v = cell(row, x.col);
    if (v) custom[x.header] = v;
  }
  return {
    row: rowNumber,
    idCell: c("sheet_account_id"),
    sheet: {
      name: c("name"),
      owner: c("owner"),
      tier: parseTier(c("tier")),
      icp_verdict: parseVerdict(c("icp_verdict")),
      domain: c("domain"),
      segment: c("segment"),
      hq: c("hq"),
      revenue: c("revenue"),
      employees: c("employees"),
      ownership: c("ownership"),
      coupa_evidence: c("coupa_evidence"),
      trigger: c("trigger"),
      trigger_date: parseSheetDate(c("trigger_date")),
      signals: c("signals"),
      disqualifier_flags: c("disqualifier_flags"),
      outreach_angle: c("outreach_angle"),
      target_contact_notes: c("target_contact_notes"),
      do_not_contact: parseYes(c("do_not_contact")),
    },
    custom_fields: custom,
  };
}

export type ParsedContact = {
  row: number;
  idCell: string;
  accountIdCell: string;
  company: string;
  companyDomain: string;
  sheet: {
    full_name: string;
    title: string;
    persona: Persona | null;
    seniority: string;
    email: string;
    email_status: string;
    phone: string;
    linkedin_url: string;
    country: string | null;
    exclude: boolean;
    notes: string;
  };
  linkedin_signals: Record<string, string>;
};

export function parseContactRow(
  row: readonly string[],
  rowNumber: number,
  idx: HeaderIndex<keyof typeof CONTACT_FIELDS>,
  headerRow: readonly string[],
): ParsedContact {
  const c = (f: keyof typeof CONTACT_FIELDS) => cell(row, idx.col[f]);
  const signals: Record<string, string> = {};
  headerRow.forEach((h, i) => {
    const key = LINKEDIN_SIGNAL_HEADERS[normalizeHeader(h ?? "")];
    const v = cell(row, i);
    if (key && v) signals[key] = v;
  });
  const explicitCountry = c("country").toUpperCase();
  return {
    row: rowNumber,
    idCell: c("sheet_contact_key"),
    accountIdCell: c("account_id"),
    company: c("company"),
    companyDomain: c("company_domain"),
    sheet: {
      full_name: c("full_name"),
      title: c("title"),
      persona: parsePersona(c("persona")),
      seniority: c("seniority"),
      email: c("email").toLowerCase(),
      email_status: c("email_status").toLowerCase(),
      phone: c("phone"),
      linkedin_url: c("linkedin_url"),
      country: /^[A-Z]{2}$/.test(explicitCountry) ? explicitCountry : countryFromLocation(c("location")),
      exclude: parseYes(c("exclude")),
      notes: c("notes"),
    },
    linkedin_signals: signals,
  };
}
