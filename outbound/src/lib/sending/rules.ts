/**
 * Sending limits and domain protection. Pure functions, so the page, the send flow, the cron and the tests agree.
 *
 * Counting is per address per IST calendar day. A mailbox in warm-up gets a lower ceiling that steps up with age.
 * The warning is quiet ("ok") until a send would be past the warning level, then amber ("warn"), then a hard stop ("full").
 */

export type SendingConfig = {
  perAddressMax: number;
  warnAt: number;
  protectCore: "off" | "warn" | "block";
  coreDomains: string[];
  warmupEnabled: boolean;
  warmupSteps: Array<{ days: number; max: number }>;
  bouncePausePct: number;
  bounceMinSample: number;
  optoutLine: string | null;
};

export const DEFAULT_SENDING: SendingConfig = {
  perAddressMax: 30,
  warnAt: 25,
  protectCore: "block",
  coreDomains: [],
  warmupEnabled: true,
  warmupSteps: [{ days: 7, max: 10 }, { days: 14, max: 20 }],
  bouncePausePct: 3,
  bounceMinSample: 20,
  optoutLine: null,
};

export type SendState = "ok" | "warn" | "full";

/** Addresses nobody should connect for outreach: personal inboxes have no domain reputation to protect or to build. */
export const CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "zoho.com", "mail.com", "yandex.com", "rediffmail.com",
]);

export const domainOf = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";
export const isConsumerDomain = (email: string) => CONSUMER_DOMAINS.has(domainOf(email));

/** Whole days since `from` (an ISO timestamp), by the clock, never negative. */
export function ageInDays(from: string | null | undefined, now: Date): number {
  if (!from) return 9999;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(from)) / 86_400_000));
}

/**
 * The most one address may send today. Established inboxes get the configured max.
 * A new outreach inbox climbs: for example 10 a day in week one, 20 in week two, then the full max.
 */
export function effectiveMax(cfg: SendingConfig, mb: { established: boolean; startedAt: string | null } | null, now: Date): { max: number; warming: boolean; fullAt: number | null } {
  if (!mb || mb.established || !cfg.warmupEnabled) return { max: cfg.perAddressMax, warming: false, fullAt: null };
  const age = ageInDays(mb.startedAt, now);
  let edge = 0;
  for (const s of [...cfg.warmupSteps].sort((a, b) => a.days - b.days)) {
    edge = s.days;
    if (age < s.days) return { max: Math.min(s.max, cfg.perAddressMax), warming: true, fullAt: edge - age };
  }
  return { max: cfg.perAddressMax, warming: false, fullAt: null };
}

/** The warning level moves down with a warm-up ceiling so it keeps the same distance from the max. */
export function effectiveWarn(cfg: SendingConfig, max: number): number {
  const gap = Math.max(0, cfg.perAddressMax - cfg.warnAt);
  return Math.max(1, Math.min(cfg.warnAt, max - gap));
}

/**
 * State for the send being considered. `sent` is what has already gone out today.
 * "full": nothing more should go out. "warn": this send would pass the warning level. "ok" otherwise.
 */
export function sendState(sent: number, warn: number, max: number): SendState {
  if (sent >= max) return "full";
  if (sent + 1 > warn) return "warn";
  return "ok";
}

/** The state of the day so far (no send in mind): over the warning level is "warn". */
export function dayState(sent: number, warn: number, max: number): SendState {
  if (sent >= max) return "full";
  if (sent > warn) return "warn";
  return "ok";
}

export const left = (sent: number, max: number) => Math.max(0, max - sent);

/** A short line for the person, the same everywhere the warning shows. */
export function stateLine(email: string, sent: number, warn: number, max: number): string {
  const s = dayState(sent, warn, max);
  if (s === "full") return `${email} has sent ${sent} of ${max} today. That is the daily limit.`;
  if (s === "warn") return `${email} is at ${sent} of ${max} today. Slow down: more than ${warn} a day from one address puts the domain at risk.`;
  return `${email} has sent ${sent} of ${max} today.`;
}

/** Core domains: the team's own login domains plus any added in settings. */
export function coreDomainSet(cfg: SendingConfig, loginEmails: string[]): Set<string> {
  const s = new Set(cfg.coreDomains.map((d) => d.trim().toLowerCase()).filter(Boolean));
  for (const e of loginEmails) {
    const d = domainOf(e);
    if (d) s.add(d);
  }
  return s;
}

export const isCoreAddress = (email: string, core: Set<string>) => core.has(domainOf(email));

/** Bounce rate over a recent window, with a minimum sample so two bounces out of five do not pause an inbox. */
export function shouldPauseForBounces(sent: number, bounced: number, pct: number, minSample: number): { pause: boolean; rate: number } {
  const rate = sent > 0 ? (bounced / sent) * 100 : 0;
  return { pause: sent >= minSample && rate >= pct, rate: Math.round(rate * 10) / 10 };
}

// ---- Domain checks (SPF, DKIM, DMARC) from the TXT records ----

export type DnsState = "pass" | "weak" | "missing";

const flat = (txts: string[][]) => txts.map((t) => t.join("")).map((t) => t.trim());

export function spfState(txts: string[][]): DnsState {
  const spf = flat(txts).find((t) => /^v=spf1\b/i.test(t));
  if (!spf) return "missing";
  // "+all" and "?all" let anyone send as the domain.
  if (/\s[+?]all\b/i.test(spf) || !/\s[~-]all\b/i.test(spf)) return "weak";
  return "pass";
}

export function dmarcState(txts: string[][]): DnsState {
  const d = flat(txts).find((t) => /^v=DMARC1\b/i.test(t));
  if (!d) return "missing";
  const p = /\bp=(\w+)/i.exec(d)?.[1]?.toLowerCase();
  return p === "quarantine" || p === "reject" ? "pass" : "weak";
}

/** DKIM is published under a selector; any record that holds a public key counts. */
export function dkimState(recordsBySelector: string[][][]): DnsState {
  const keyed = recordsBySelector.some((txts) => flat(txts).some((t) => /\bp=[A-Za-z0-9+/=]{20,}/.test(t) || /^v=DKIM1/i.test(t)));
  return keyed ? "pass" : "missing";
}

export const DKIM_SELECTORS = ["google", "selector1", "selector2", "default", "k1", "s1", "mail"];

export function domainHealth(d: { spf: string | null; dkim: string | null; dmarc: string | null }): "ready" | "fix" | "unchecked" {
  if (!d.spf && !d.dkim && !d.dmarc) return "unchecked";
  return d.spf === "pass" && d.dkim === "pass" && d.dmarc === "pass" ? "ready" : "fix";
}

/** What to do next for a domain, in plain words. */
export function domainFix(d: { spf: string | null; dkim: string | null; dmarc: string | null }): string[] {
  const out: string[] = [];
  if (d.spf === "missing") out.push("Add an SPF record (v=spf1 include:_spf.google.com ~all)");
  else if (d.spf === "weak") out.push("Tighten SPF: end it with ~all or -all");
  if (d.dkim === "missing") out.push("Turn on DKIM signing in Google Workspace and publish the key");
  if (d.dmarc === "missing") out.push("Add a DMARC record (v=DMARC1; p=quarantine; rua=mailto:you@yourdomain)");
  else if (d.dmarc === "weak") out.push("Move DMARC from p=none to p=quarantine");
  return out;
}

/** Start of an IST calendar day as epoch seconds, for Gmail's `after:` filter. */
export function istDayStartEpoch(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00+05:30`) / 1000);
}

export type Resolver = (name: string) => Promise<string[][]>;

/** Looks up SPF, DKIM and DMARC for a domain through any TXT resolver (the real one, or a fake in tests). */
export async function checkDomainDns(domain: string, resolve: Resolver): Promise<{ spf: DnsState; dkim: DnsState; dmarc: DnsState }> {
  const [root, dmarc, ...dkim] = await Promise.all([resolve(domain), resolve(`_dmarc.${domain}`), ...DKIM_SELECTORS.map((sel) => resolve(`${sel}._domainkey.${domain}`))]);
  return { spf: spfState(root), dmarc: dmarcState(dmarc), dkim: dkimState(dkim) };
}

// ---- The one banner on Today ----

export type BannerInbox = { email: string; sent: number; queued: number; max: number; warn: number; state: SendState; paused: boolean; isDefault: boolean };
export type Banner = { tone: "full" | "warn" | "heads_up"; email: string; text: string };

/**
 * At most one banner, the most urgent. Quiet when everything is fine.
 * full: nothing more from this address today. warn: past the warning level. heads_up: today's queue will take it past the level.
 */
export function bannerFor(inboxes: BannerInbox[]): Banner | null {
  const live = inboxes.filter((i) => !i.paused);
  const pick = (f: (i: BannerInbox) => boolean) => live.filter(f).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.queued - a.queued)[0];
  const full = pick((i) => i.state === "full" && (i.isDefault || i.queued > 0));
  if (full) return { tone: "full", email: full.email, text: `${full.email} has reached today's limit of ${full.max}.${full.queued ? ` ${full.queued} more ${full.queued === 1 ? "is" : "are"} due: send from another inbox or move ${full.queued === 1 ? "it" : "them"} to tomorrow.` : " No more from this address today."}` };
  const warn = pick((i) => i.state === "warn" && (i.isDefault || i.queued > 0));
  if (warn) return { tone: "warn", email: warn.email, text: `${warn.email} is at ${warn.sent} of ${warn.max} today. More than ${warn.warn} a day from one address puts the domain at risk.${warn.queued ? ` ${warn.queued} more ${warn.queued === 1 ? "is" : "are"} due.` : ""}` };
  const heads = pick((i) => i.queued > 0 && i.sent + i.queued > i.warn);
  if (heads) return { tone: "heads_up", email: heads.email, text: `${heads.queued} emails are due from ${heads.email}. With the ${heads.sent} already sent that is ${heads.sent + heads.queued}, past the warning level of ${heads.warn}.` };
  return null;
}
