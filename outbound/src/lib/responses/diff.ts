/**
 * Side-by-side re-plan diff (PRD M6): steps kept, changed, removed, added.
 * Pure. Done steps are never part of the comparison: they never change.
 */

export type PlanStep = { contactId: string; sequenceNo: number; channel: string; date: string | null; offset: number | null; subject: string | null; body: string | null };
export type DiffRow =
  | { kind: "kept"; old: PlanStep; next: PlanStep }
  | { kind: "changed"; old: PlanStep; next: PlanStep; what: string[] }
  | { kind: "removed"; old: PlanStep }
  | { kind: "added"; next: PlanStep };

const squash = (t: string | null) => (t ?? "").replace(/\s+/g, " ").trim();
const daysApart = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));

export function diffPlans(oldOpen: readonly PlanStep[], next: readonly PlanStep[]): DiffRow[] {
  const rows: DiffRow[] = [];
  const contacts = [...new Set([...oldOpen, ...next].map((s) => s.contactId))];
  for (const c of contacts) {
    const a = oldOpen.filter((s) => s.contactId === c).sort((x, y) => x.sequenceNo - y.sequenceNo);
    const b = next.filter((s) => s.contactId === c).sort((x, y) => x.sequenceNo - y.sequenceNo);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const o = a[i];
      const x = b[i];
      if (o && !x) rows.push({ kind: "removed", old: o });
      else if (!o && x) rows.push({ kind: "added", next: x });
      else if (o && x) {
        const what: string[] = [];
        if (o.channel !== x.channel) what.push("channel");
        // A one-day nudge on an otherwise identical step is noise, not a change.
        const dateChanged = (o.date ?? `+${o.offset}`) !== (x.date ?? `+${x.offset}`);
        const nudge = dateChanged && o.date && x.date && daysApart(o.date, x.date) <= 1;
        if (dateChanged && !nudge) what.push("date");
        if (squash(o.subject) !== squash(x.subject)) what.push("subject");
        if (squash(o.body) !== squash(x.body)) what.push("copy");
        rows.push(what.length ? { kind: "changed", old: o, next: x, what } : { kind: "kept", old: o, next: x });
      }
    }
  }
  return rows;
}

export function diffSummary(rows: readonly DiffRow[]) {
  return {
    kept: rows.filter((r) => r.kind === "kept").length,
    changed: rows.filter((r) => r.kind === "changed").length,
    removed: rows.filter((r) => r.kind === "removed").length,
    added: rows.filter((r) => r.kind === "added").length,
  };
}
