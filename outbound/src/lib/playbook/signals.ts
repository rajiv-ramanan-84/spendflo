import { isIsoDate, type IsoDate } from "@/lib/calendar/dates";
import { normalizeSignalId, SIGNAL_ID_RE } from "./catalog";

/**
 * Reads the Signals cell on the Master tab. The agreed format is one line per signal:
 *
 *   A1.S1 | 2026-11-03 | Hiring Contract Manager | https://example.com/job | Confirmed
 *
 * Older free text ("A3.S6: ~15K employees; ... (themuse.com, 2025-11-13)") is still
 * understood: split at each signal ID, with the first date found as the date.
 * A signal with no usable date is kept but never counts toward the gate. Pure.
 */

export type ParsedSignal = {
  id: string;
  seenOn: IsoDate | null;
  undated: boolean;
  expired: boolean;
  evidence: string;
  url: string | null;
  confidence: "confirmed" | "likely" | null;
  legacy: boolean;
  raw: string;
};

const URL_RE = /https?:\/\/[^\s|)]+/i;
const MAX_EVIDENCE = 300;

function confidenceOf(s: string): ParsedSignal["confidence"] {
  if (/confirmed/i.test(s)) return "confirmed";
  if (/likely/i.test(s)) return "likely";
  return null;
}

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, MAX_EVIDENCE);
}

function pipeLine(line: string): ParsedSignal | null {
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length < 3) return null;
  const rawId = parts[0].toUpperCase() === "NEW" ? "NEW" : SIGNAL_ID_RE.test(parts[0]) ? normalizeSignalId(parts[0].match(SIGNAL_ID_RE)![0]) : null;
  if (!rawId) return null;
  const dateText = parts[1];
  const seenOn = isIsoDate(dateText) ? dateText : null;
  const evidence = clean(parts[2]);
  const url = (parts[3] && URL_RE.exec(parts[3])?.[0]) || URL_RE.exec(evidence)?.[0] || null;
  const conf = confidenceOf(parts[4] ?? "");
  return {
    id: rawId, seenOn, undated: !seenOn, expired: /\bexpired\b/i.test(`${parts[4] ?? ""} ${evidence}`),
    evidence, url, confidence: conf, legacy: false, raw: line.trim(),
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The last date in a stretch of text: 2026-04-12, 2026-04 (month only, taken as the 1st) or "Apr 2026". "undated" wins. */
export function lastDateIn(text: string): IsoDate | null {
  if (/\bundated\b/i.test(text)) return null;
  const hits: Array<{ at: number; date: string }> = [];
  for (const m of text.matchAll(/\b(20\d\d)-(\d\d)(?:-(\d\d))?\b/g)) hits.push({ at: m.index ?? 0, date: `${m[1]}-${m[2]}-${m[3] ?? "01"}` });
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)\b/gi)) hits.push({ at: m.index ?? 0, date: `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-01` });
  hits.sort((a, b) => a.at - b.at);
  for (let i = hits.length - 1; i >= 0; i--) if (isIsoDate(hits[i].date)) return hits[i].date as IsoDate;
  return null;
}

/** Free text from before the agreed format: one signal per ID mentioned, "A1.S7/A2.S2:" sharing one note. */
function legacyText(text: string): ParsedSignal[] {
  const re = new RegExp(SIGNAL_ID_RE.source, "gi");
  const hits = [...text.matchAll(re)].map((m) => ({ id: normalizeSignalId(m[0]), at: m.index ?? 0, len: m[0].length }));
  if (!hits.length) {
    const evidence = clean(text);
    if (!evidence) return [];
    return [{ id: "UNTAGGED", seenOn: null, undated: true, expired: false, evidence, url: URL_RE.exec(text)?.[0] ?? null, confidence: "likely", legacy: true, raw: text.trim() }];
  }
  // IDs written side by side ("A1.S7/A2.S2", "A1.S3, A2.S1") belong to one note.
  const groups: Array<Array<(typeof hits)[number]>> = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && /^\s*(?:[\/,&]|and)\s*$/i.test(text.slice(prev.at + prev.len, h.at))) last.push(h);
    else groups.push([h]);
  }
  return groups.flatMap((g, gi) => {
    const end = gi + 1 < groups.length ? groups[gi + 1][0].at : text.length;
    const lastHit = g[g.length - 1];
    const seg = text.slice(lastHit.at + lastHit.len, end).replace(/^[\s:\-]+/, "").replace(/[;\s]+$/, "");
    const seenOn = lastDateIn(seg);
    return g.map((h) => ({ id: h.id, seenOn, undated: !seenOn, expired: /\bexpired\b/i.test(seg), evidence: clean(seg), url: URL_RE.exec(seg)?.[0] ?? null, confidence: "likely" as const, legacy: true, raw: `${h.id}: ${seg}` }));
  });
}

export function parseSignals(text: string | null | undefined): ParsedSignal[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const out: ParsedSignal[] = [];
  const free: string[] = [];
  for (const line of t.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const p = line.includes("|") ? pipeLine(line) : null;
    if (p) out.push(p);
    else free.push(line);
  }
  if (free.length) out.push(...legacyText(free.join("\n")));
  // The same line twice counts once.
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.id}|${s.seenOn ?? ""}|${s.evidence.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
