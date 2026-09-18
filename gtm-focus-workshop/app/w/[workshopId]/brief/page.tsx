'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getWorkshop,
  listTheses,
  listDecisions,
  listExperiments,
  listCards,
  listThesisScores,
} from '@/lib/data';
import type { Workshop, GTMThesis, Decision, Experiment, Card, ThesisScore, DecisionType } from '@/lib/types';
import { DECISION_TYPES, THESIS_DIMENSIONS } from '@/lib/types';

export default function BriefPage({ params }: { params: { workshopId: string } }) {
  const { workshopId } = params;
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [theses, setTheses] = useState<GTMThesis[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [scoresByThesis, setScoresByThesis] = useState<Record<string, ThesisScore[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [w, th, dec, exp, c] = await Promise.all([
        getWorkshop(workshopId),
        listTheses(workshopId),
        listDecisions(workshopId),
        listExperiments(workshopId),
        listCards(workshopId),
      ]);
      setWorkshop(w);
      setTheses(th);
      setDecisions(dec);
      setExperiments(exp);
      setCards(c);
      const scoreEntries = await Promise.all(th.map(async (t) => [t.id, await listThesisScores(t.id)] as const));
      setScoresByThesis(Object.fromEntries(scoreEntries));
      setLoading(false);
    })();
  }, [workshopId]);

  const latestDecisionByThesis = useMemo(() => {
    const map = new Map<string, Decision>();
    for (const d of decisions) {
      const existing = map.get(d.thesisId);
      if (!existing || new Date(d.createdAt) > new Date(existing.createdAt)) map.set(d.thesisId, d);
    }
    return map;
  }, [decisions]);

  const assumptionCards = cards.filter((c) => c.type === 'assumption' || c.type === 'open_question');

  function decisionLabel(type: DecisionType) {
    return DECISION_TYPES.find((d) => d.value === type)?.label ?? type;
  }

  function markdown(): string {
    if (!workshop) return '';
    const lines: string[] = [];
    lines.push(`# GTM Focus Brief - ${workshop.name}`);
    lines.push('');
    lines.push(`**Goal:** ${workshop.goal}`);
    if (workshop.companyContext) lines.push(`**Context:** ${workshop.companyContext}`);
    lines.push('');
    lines.push('## Decisions');
    for (const t of theses) {
      const d = latestDecisionByThesis.get(t.id);
      lines.push(`### ${t.name}`);
      lines.push(`- Decision: ${d ? decisionLabel(d.type) : 'Not yet decided'}`);
      if (d?.rationale) lines.push(`- Rationale: ${d.rationale}`);
      const scores = scoresByThesis[t.id] ?? [];
      if (scores.length) {
        lines.push('- Scorecard:');
        for (const dim of THESIS_DIMENSIONS) {
          const s = scores.find((x) => x.dimension === dim.value);
          if (s) lines.push(`  - ${dim.label}: ${s.score}/5 (${s.evidenceIds.length} evidence linked)`);
        }
      }
      lines.push('');
    }
    lines.push('## Experiments (30/60/90)');
    for (const e of experiments) {
      const t = theses.find((th) => th.id === e.thesisId);
      lines.push(`### ${t?.name ?? 'Unknown thesis'}`);
      lines.push(`- Hypothesis: ${e.hypothesis}`);
      lines.push(`- Owner: ${e.owner}${e.deadline ? ` · Deadline: ${e.deadline}` : ''}`);
      lines.push(`- Smallest test: ${e.smallestTest}`);
      lines.push(`- Evidence to collect: ${e.evidenceToCollect}`);
      lines.push(`- Success threshold: ${e.successThreshold}`);
      lines.push(`- Kill/revise threshold: ${e.killReviseThreshold}`);
      lines.push('');
    }
    lines.push('## Open assumptions & questions');
    for (const c of assumptionCards) {
      lines.push(`- [${c.type}] ${c.title}${c.body ? ` - ${c.body}` : ''}`);
    }
    return lines.join('\n');
  }

  function exportMarkdown() {
    const blob = new Blob([markdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(workshop?.name ?? 'gtm-focus-brief').toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <main className="p-10 text-sm text-gray-500">Loading...</main>;
  if (!workshop) return <main className="p-10 text-sm text-red-600">Workshop not found.</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">GTM Focus Brief</p>
          <h1 className="text-2xl font-bold">{workshop.name}</h1>
        </div>
        <button onClick={exportMarkdown} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
          Export Markdown
        </button>
      </div>

      <p className="mt-3 text-gray-700">{workshop.goal}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Decisions</h2>
        <div className="mt-3 space-y-4">
          {theses.map((t) => {
            const d = latestDecisionByThesis.get(t.id);
            const scores = scoresByThesis[t.id] ?? [];
            return (
              <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 card-shell">
                <div className="flex items-center justify-between">
                  <a href={`/w/${workshopId}/thesis/${t.id}`} className="font-semibold hover:underline">
                    {t.name}
                  </a>
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                    {d ? decisionLabel(d.type) : 'Not yet decided'}
                  </span>
                </div>
                {d?.rationale && <p className="mt-1 text-sm text-gray-600">{d.rationale}</p>}
                {scores.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-500 sm:grid-cols-4">
                    {THESIS_DIMENSIONS.map((dim) => {
                      const s = scores.find((x) => x.dimension === dim.value);
                      if (!s) return null;
                      return (
                        <span key={dim.value}>
                          {dim.label}: {s.score}/5
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {theses.length === 0 && <p className="text-sm text-gray-400">No theses created yet.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Experiments (30/60/90)</h2>
        <div className="mt-3 space-y-3">
          {experiments.map((e) => (
            <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-4 card-shell text-sm">
              <p className="font-semibold">{e.hypothesis}</p>
              <p className="mt-1 text-gray-600">
                Owner: {e.owner} {e.deadline && `· Deadline: ${e.deadline}`}
              </p>
              <p className="mt-1 text-gray-600">Success: {e.successThreshold}</p>
              <p className="mt-1 text-gray-600">Kill/revise: {e.killReviseThreshold}</p>
            </div>
          ))}
          {experiments.length === 0 && <p className="text-sm text-gray-400">No experiments recorded yet.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Open assumptions & questions</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {assumptionCards.map((c) => (
            <li key={c.id}>
              {c.title} {c.body && <span className="text-gray-500">- {c.body}</span>}
            </li>
          ))}
          {assumptionCards.length === 0 && <p className="text-sm text-gray-400">None flagged.</p>}
        </ul>
      </section>
    </main>
  );
}
