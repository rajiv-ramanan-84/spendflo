'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getThesis,
  listThesisScores,
  upsertThesisScore,
  listCards,
  listEvidence,
  listDecisions,
  listParticipants,
  createExperiment,
  listExperiments,
} from '@/lib/data';
import type { GTMThesis, ThesisScore, Card, Evidence, Decision, Experiment, Participant } from '@/lib/types';
import { THESIS_DIMENSIONS } from '@/lib/types';

export default function ThesisPage({ params }: { params: { workshopId: string; thesisId: string } }) {
  const { workshopId, thesisId } = params;
  const search = useSearchParams();
  const participantId = search.get('pid') ?? '';

  const [thesis, setThesis] = useState<GTMThesis | null>(null);
  const [scores, setScores] = useState<ThesisScore[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expForm, setExpForm] = useState({
    hypothesis: '',
    owner: '',
    deadline: '',
    targetSegmentPersona: '',
    smallestTest: '',
    evidenceToCollect: '',
    successThreshold: '',
    killReviseThreshold: '',
  });

  useEffect(() => {
    Promise.all([
      getThesis(thesisId),
      listThesisScores(thesisId),
      listCards(workshopId),
      listEvidence(workshopId),
      listDecisions(workshopId),
      listExperiments(workshopId),
      listParticipants(workshopId),
    ]).then(([t, s, c, ev, dec, exp, p]) => {
      setThesis(t);
      setScores(s);
      setCards(c);
      setEvidence(ev);
      setDecisions(dec.filter((d) => d.thesisId === thesisId));
      setExperiments(exp.filter((e) => e.thesisId === thesisId));
      setParticipants(p);
      setLoading(false);
    });
  }, [workshopId, thesisId]);

  const me = participants.find((p) => p.id === participantId);

  async function setScore(dimension: (typeof THESIS_DIMENSIONS)[number]['value'], score: number) {
    const updated = await upsertThesisScore({ thesisId, dimension, score });
    setScores((prev) => [...prev.filter((s) => s.dimension !== dimension), updated]);
  }

  async function submitExperiment() {
    if (!expForm.hypothesis || !expForm.owner || !expForm.smallestTest) return;
    const exp = await createExperiment({
      workshopId,
      thesisId,
      hypothesis: expForm.hypothesis,
      owner: expForm.owner,
      deadline: expForm.deadline || undefined,
      targetSegmentPersona: expForm.targetSegmentPersona || undefined,
      smallestTest: expForm.smallestTest,
      evidenceToCollect: expForm.evidenceToCollect,
      successThreshold: expForm.successThreshold,
      killReviseThreshold: expForm.killReviseThreshold,
    });
    setExperiments((prev) => [...prev, exp]);
    setExpForm({
      hypothesis: '',
      owner: '',
      deadline: '',
      targetSegmentPersona: '',
      smallestTest: '',
      evidenceToCollect: '',
      successThreshold: '',
      killReviseThreshold: '',
    });
  }

  const linkedCards = cards.filter((c) => c.thesisId === thesisId);
  const linkedEvidenceCount = linkedCards.reduce((sum, c) => sum + c.sourceIds.length, 0);
  const latestDecision = decisions[decisions.length - 1];

  if (loading) return <main className="p-10 text-sm text-gray-500">Loading...</main>;
  if (!thesis) return <main className="p-10 text-sm text-red-600">Thesis not found.</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href={`/w/${workshopId}/room?pid=${participantId}`} className="text-xs text-blue-700">
        ← Back to room
      </a>
      <h1 className="mt-2 text-2xl font-bold">{thesis.name}</h1>
      {thesis.summary && <p className="mt-1 text-gray-600">{thesis.summary}</p>}
      {latestDecision && (
        <p className="mt-2 inline-block rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
          Decision: {latestDecision.type.replace('_', ' ')}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 card-shell">
        <h2 className="text-sm font-semibold text-gray-700">Scorecard</h2>
        <p className="text-xs text-gray-400">{linkedCards.length} linked cards · {linkedEvidenceCount} linked evidence items</p>
        <div className="mt-3 space-y-3">
          {THESIS_DIMENSIONS.map((d) => {
            const s = scores.find((x) => x.dimension === d.value);
            return (
              <div key={d.value} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 text-sm">
                <span className="text-gray-700">{d.label}</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setScore(d.value, n)}
                      className={`h-6 w-6 rounded-full text-xs font-semibold ${
                        (s?.score ?? 0) >= n ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-gray-400">{s?.evidenceIds.length ?? 0} evid.</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 card-shell">
        <h2 className="text-sm font-semibold text-gray-700">Linked cards</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {linkedCards.map((c) => (
            <li key={c.id} className="text-gray-700">
              <span className="text-xs uppercase text-gray-400">{c.type}</span> - {c.title}
            </li>
          ))}
          {linkedCards.length === 0 && <p className="text-xs text-gray-400">No cards linked to this thesis yet. Set a card's thesisId from the room.</p>}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 card-shell">
        <h2 className="text-sm font-semibold text-gray-700">Experiments ({experiments.length})</h2>
        <ul className="mt-2 space-y-2">
          {experiments.map((e) => (
            <li key={e.id} className="rounded-md border border-gray-100 p-3 text-xs">
              <p className="font-semibold">{e.hypothesis}</p>
              <p className="mt-1 text-gray-600">Owner: {e.owner} {e.deadline && `· Deadline: ${e.deadline}`}</p>
              <p className="mt-1 text-gray-600">Smallest test: {e.smallestTest}</p>
              <p className="mt-1 text-gray-600">Success: {e.successThreshold}</p>
              <p className="mt-1 text-gray-600">Kill/revise: {e.killReviseThreshold}</p>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500">New experiment (for Double-down / Validate-Fix theses)</p>
          <textarea className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Hypothesis" value={expForm.hypothesis} onChange={(e) => setExpForm({ ...expForm, hypothesis: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Owner" value={expForm.owner} onChange={(e) => setExpForm({ ...expForm, owner: e.target.value })} />
            <input type="date" className="rounded-md border border-gray-300 px-2 py-1.5 text-xs" value={expForm.deadline} onChange={(e) => setExpForm({ ...expForm, deadline: e.target.value })} />
          </div>
          <input className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Target segment/persona" value={expForm.targetSegmentPersona} onChange={(e) => setExpForm({ ...expForm, targetSegmentPersona: e.target.value })} />
          <textarea className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Smallest test" value={expForm.smallestTest} onChange={(e) => setExpForm({ ...expForm, smallestTest: e.target.value })} />
          <textarea className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Evidence to collect" value={expForm.evidenceToCollect} onChange={(e) => setExpForm({ ...expForm, evidenceToCollect: e.target.value })} />
          <input className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Success threshold" value={expForm.successThreshold} onChange={(e) => setExpForm({ ...expForm, successThreshold: e.target.value })} />
          <input className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" placeholder="Kill/revise threshold" value={expForm.killReviseThreshold} onChange={(e) => setExpForm({ ...expForm, killReviseThreshold: e.target.value })} />
          <button onClick={submitExperiment} className="w-full rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white">
            Add experiment
          </button>
        </div>
      </section>

      {!me && <p className="mt-4 text-xs text-gray-400">Join from the lobby to make changes here.</p>}
    </main>
  );
}
