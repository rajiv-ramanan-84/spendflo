/**
 * What the assistant may see and what traces may store (pure).
 * Phone numbers never reach Claude. Personal email addresses are never used.
 * Secrets never reach a log. Work emails stay: they are what outreach needs.
 */

const PERSONAL_DOMAINS = "gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail|gmx|rediffmail";
const PERSONAL_EMAIL = new RegExp(`[A-Za-z0-9._%+-]+@(?:${PERSONAL_DOMAINS})\\.[A-Za-z.]{2,}`, "gi");
// 8 to 15 digits with the usual separators, not part of a longer number or a date.
const PHONE = /(?<![\w.])(?:\+?\d[\d\s().-]{7,17}\d)(?![\w])/g;
const SECRET = /\b(?:sk-[A-Za-z0-9_-]{16,}|xox[abp]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|ghp_[A-Za-z0-9]{20,})/g;
const DATE_LIKE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;

const DROP_KEYS = /(phone|mobile|\btel\b|whatsapp|personal.?email|private.?key|secret|password|api.?key|token|authorization)/i;

export function redactText(s: string): string {
  return s
    .replace(SECRET, "[secret]")
    .replace(PERSONAL_EMAIL, "[personal email]")
    .replace(PHONE, (m) => (DATE_LIKE.test(m.trim()) || m.replace(/\D/g, "").length < 8 ? m : "[phone]"));
}

/** Deep copy with phone, personal email and secret fields removed and free text scrubbed. */
export function redactValue<T>(v: T, depth = 0): T {
  if (depth > 12) return "[too deep]" as unknown as T;
  if (typeof v === "string") return redactText(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => redactValue(x, depth + 1)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = DROP_KEYS.test(k) ? "[redacted]" : redactValue(x, depth + 1);
    return out as T;
  }
  return v;
}

/** A tool result, redacted and cut to a size the model can use. */
export function forModel(result: unknown, maxChars: number): string {
  const text = JSON.stringify(redactValue(result));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}... [truncated ${text.length - maxChars} characters; ask for fewer rows or narrower filters]`;
}
