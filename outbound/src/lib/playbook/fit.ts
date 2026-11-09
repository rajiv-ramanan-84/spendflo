import type { PlayCode } from "./catalog";
import type { ParsedSignal } from "./signals";

/**
 * ICP fit per play, from the sales playbook ("Weird not to buy": who will 100% buy this).
 * Each play lists the checks its ICP names. A check is met, partial, unmet, or unknown when
 * the Sheet has nothing to judge it by. Unknown checks are never counted against an account:
 * they show as "to research" so the agency or the owner can fill them in.
 * Pure: no database, no clock.
 */

export type CheckStatus = "met" | "partial" | "unmet" | "unknown";
export type FitLevel = "strong" | "possible" | "weak";
export const FIT_LABEL: Record<FitLevel, string> = { strong: "Strong fit", possible: "Possible fit", weak: "Weak fit" };

export interface FitCheck { id: string; label: string; status: CheckStatus; note: string; core?: boolean }
export interface PlayFit { play: PlayCode; level: FitLevel; score: number; met: number; evaluable: number; unknown: number; checks: FitCheck[] }
export interface FitResult { level: FitLevel; best: PlayCode | null; plays: PlayFit[] }

export interface FitInput {
  coupaEvidence: string | null;
  employees: string | null;
  disqualifierFlags: string | null;
  researchFit: string | null; // the "Fit Agent(s)" cell
  personas: string[]; // personas of this account's live contacts
  liveSignalIds: string[]; // signal ids counted today
}

const WEIGHT: Record<CheckStatus, number | null> = { met: 1, partial: 0.5, unmet: 0, unknown: null };

/** Largest headcount mentioned in free text: "~13,000 (est.)", "LinkedIn 17K+", "approx 7.5K". */
export function headcount(text: string | null): number | null {
  if (!text) return null;
  const found: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kK])?/g)) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    found.push(m[2] ? n * 1000 : n);
  }
  const real = found.filter((n) => n >= 20); // skips years like "FY25" fragments and stray digits
  return real.length ? Math.max(...real) : null;
}

/** Plays the researcher marked in the "Fit Agent(s)" cell: "Agent 1, Agent 2", "2,3", "None". */
export function researcherPlays(cell: string | null): PlayCode[] | null {
  if (cell === null || cell.trim() === "") return null;
  if (/^\s*none\s*$/i.test(cell)) return [];
  const map: Record<string, PlayCode> = { "1": "A1", "2": "A2", "3": "A3" };
  return [...new Set((cell.match(/[123]/g) ?? []).map((d) => map[d]))];
}

function coupaCheck(i: FitInput): FitCheck {
  const ev = i.coupaEvidence ?? "";
  const admin = /coupa admin/i.test(ev);
  const researchNone = /no coupa/i.test(ev);
  const base = { id: "coupa", label: "Runs on Coupa", core: true };
  if (admin && !researchNone) return { ...base, status: "met", note: "Coupa admin on LinkedIn and research confirms Coupa" };
  if (admin) return { ...base, status: "partial", note: "A Coupa admin is on LinkedIn, but research found no other Coupa evidence" };
  if (ev.trim()) return { ...base, status: researchNone ? "unmet" : "partial", note: researchNone ? "Research found no Coupa evidence" : "Some Coupa evidence, no admin seen" };
  return { ...base, status: "unmet", note: "No Coupa evidence on file" };
}

function gateCheck(i: FitInput): FitCheck {
  const f = i.disqualifierFlags ?? "";
  const base = { id: "gates", label: "Inside the team gates (revenue band, US HQ)", core: true };
  if (!f.trim()) return { ...base, status: "met", note: "No gate flags" };
  if (/^possible/i.test(f.trim())) return { ...base, status: "partial", note: f.trim() };
  return { ...base, status: "unmet", note: f.trim() };
}

const has = (i: FitInput, ...personas: string[]) => i.personas.some((p) => personas.includes(p));
const leader = (i: FitInput): FitCheck => has(i, "procurement_leader", "economic_buyer")
  ? { id: "leader", label: "Procurement leader on file (VP, Director or CPO)", status: "met", note: "A procurement or economic buyer contact is on the list" }
  : { id: "leader", label: "Procurement leader on file (VP, Director or CPO)", status: "unmet", note: "No procurement leader contact yet" };
const admin = (i: FitInput): FitCheck => has(i, "system_owner")
  ? { id: "admin", label: "Coupa admin or system owner on file", status: "met", note: "A system owner contact is on the list" }
  : /coupa admin/i.test(i.coupaEvidence ?? "")
    ? { id: "admin", label: "Coupa admin or system owner on file", status: "partial", note: "Admin seen on LinkedIn, not yet a contact" }
    : { id: "admin", label: "Coupa admin or system owner on file", status: "unmet", note: "None found" };
const researcher = (i: FitInput, code: PlayCode): FitCheck => {
  const r = researcherPlays(i.researchFit);
  const label = `Research marked this account for ${code}`;
  return r === null ? { id: "research", label, status: "unknown", note: "No research call yet" }
    : r.includes(code) ? { id: "research", label, status: "met", note: "Research found a fit" }
    : { id: "research", label, status: "unmet", note: "Research did not mark this play" };
};
const unknown = (id: string, label: string, note: string): FitCheck => ({ id, label, status: "unknown", note });

const BUILDERS: Record<PlayCode, (i: FitInput) => FitCheck[]> = {
  // Contract review and redlining: procurement leader who runs a contract team and a small legal team on Coupa, no intake tool.
  A1: (i) => [
    coupaCheck(i), gateCheck(i), leader(i),
    has(i, "contract_manager", "legal")
      ? { id: "contracts", label: "Contract manager or legal contact on file", status: "met", note: "A contract or legal contact is on the list" }
      : { id: "contracts", label: "Contract manager or legal contact on file", status: "unmet", note: "No contract manager or legal contact yet" },
    admin(i),
    unknown("no_intake", "No intake and orchestration software", "Not in the Sheet. Ask the agency to check."),
    researcher(i, "A1"),
  ],
  // Renewal intelligence: procurement operations, PR to PO on Coupa, VP or Director or CPO, high software contract volume.
  A2: (i) => [
    coupaCheck(i), gateCheck(i), leader(i), admin(i),
    unknown("ops", "Procurement operations team exists", "Not in the Sheet. Ask the agency to check."),
    unknown("ratio", "Revenue per procurement FTE of $100M or more", "Needs procurement headcount. Not in the Sheet."),
    unknown("software", "High volume of software contracts", "Not in the Sheet. Ask the agency to check."),
    researcher(i, "A2"),
  ],
  // Guided buying: must use Coupa, 10k+ requestors, public AI initiative, new S2P implementation, Coupa admin team.
  A3: (i) => {
    const n = headcount(i.employees);
    // Scale is part of what defines this play's ICP ("large companies, 10k+ requestors"), so a small company cannot be a strong fit.
    const scaleBase = { id: "scale", label: "10,000+ employees as requestors", core: true };
    const scale: FitCheck = n === null ? { ...scaleBase, core: false, status: "unknown", note: "Headcount not in the Sheet" }
      : n >= 10000 ? { ...scaleBase, status: "met", note: `About ${n.toLocaleString("en-US")} employees` }
      : n >= 5000 ? { ...scaleBase, status: "partial", note: `About ${n.toLocaleString("en-US")} employees` }
      : { ...scaleBase, status: "unmet", note: `About ${n.toLocaleString("en-US")} employees` };
    const rollout = i.liveSignalIds.some((s) => s === "A3.S2" || s === "A3.S7" || s === "A3.S8");
    return [
      coupaCheck(i), gateCheck(i), scale,
      rollout ? { id: "s2p", label: "New Coupa or S2P implementation under way", status: "met", note: "A live rollout signal is on the account" } : unknown("s2p", "New Coupa or S2P implementation under way", "No live rollout signal yet"),
      unknown("ai", "Public AI initiative", "Not in the Sheet. Ask the agency to check."),
      admin(i),
      researcher(i, "A3"),
    ];
  },
};

export function fitForPlay(play: PlayCode, i: FitInput): PlayFit {
  const checks = BUILDERS[play](i);
  let got = 0, evaluable = 0, unknownCount = 0, met = 0;
  for (const c of checks) {
    const w = WEIGHT[c.status];
    if (w === null) { unknownCount++; continue; }
    evaluable++; got += w; if (c.status === "met") met++;
  }
  const score = evaluable ? got / evaluable : 0;
  const coreFail = checks.some((c) => c.core && c.status === "unmet");
  // Strong needs evidence on most of the ICP: with more than two checks unknown it stays "possible" until they are researched.
  const level: FitLevel = coreFail ? "weak" : score >= 0.7 && evaluable >= 5 && unknownCount <= 2 ? "strong" : score >= 0.4 ? "possible" : "weak";
  return { play, level, score: Math.round(score * 100) / 100, met, evaluable, unknown: unknownCount, checks };
}

export function evaluateFit(i: FitInput): FitResult {
  const plays = (["A1", "A2", "A3"] as PlayCode[]).map((p) => fitForPlay(p, i));
  const rank: Record<FitLevel, number> = { strong: 2, possible: 1, weak: 0 };
  const best = [...plays].sort((a, b) => rank[b.level] - rank[a.level] || b.score - a.score || (a.play < b.play ? -1 : 1))[0];
  return { level: best.level, best: best.level === "weak" ? null : best.play, plays };
}

export const liveSignalIds = (signals: ParsedSignal[]): string[] => signals.filter((s) => !s.expired).map((s) => s.id);
