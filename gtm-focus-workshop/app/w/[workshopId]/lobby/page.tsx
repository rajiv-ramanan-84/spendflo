'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getWorkshop, joinWorkshop, listParticipants, listCards, setActivePhase } from '@/lib/data';
import type { Workshop, Participant, Card } from '@/lib/types';
import { PROOF_GRADE_RUBRIC } from '@/lib/types';

export default function LobbyPage({ params }: { params: { workshopId: string } }) {
  const { workshopId } = params;
  const router = useRouter();
  const search = useSearchParams();
  const existingPid = search.get('pid') ?? undefined;
  const existingToken = search.get('token') ?? undefined;

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [segmentCards, setSegmentCards] = useState<Card[]>([]);
  const [participantId, setParticipantId] = useState<string | undefined>(existingPid);
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, p, c] = await Promise.all([getWorkshop(workshopId), listParticipants(workshopId), listCards(workshopId)]);
        if (cancelled) return;
        setWorkshop(w);
        setParticipants(p);
        setSegmentCards(c.filter((card) => card.type === 'segment'));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  async function handleJoin() {
    if (!joinName) return;
    setError(null);
    try {
      const p = await joinWorkshop(workshopId, joinName, 'participant');
      setParticipantId(p.id);
      setParticipants((prev) => [...prev, p]);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleStart() {
    try {
      await setActivePhase(workshopId, 'decision_boundary');
      router.push(`/w/${workshopId}/room?pid=${participantId}&token=${existingToken ?? ''}`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const me = participants.find((p) => p.id === participantId);
  const isFacilitator = me?.role === 'facilitator';

  if (loading) return <main className="p-10 text-sm text-gray-500">Loading...</main>;
  if (!workshop) return <main className="p-10 text-sm text-red-600">Workshop not found. {error}</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Lobby</p>
      <h1 className="mt-1 text-2xl font-bold">{workshop.name}</h1>
      <p className="mt-2 text-gray-700">{workshop.goal}</p>
      {workshop.companyContext && <p className="mt-2 text-sm text-gray-500">{workshop.companyContext}</p>}

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 card-shell">
        <h2 className="text-sm font-semibold text-gray-700">Candidate segments so far</h2>
        {segmentCards.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">None yet - the first phase will ask the group to propose these.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {segmentCards.map((c) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 card-shell">
        <h2 className="text-sm font-semibold text-gray-700">What counts as proof</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(['A', 'B', 'C', 'D'] as const).map((grade) => (
            <div key={grade} className="rounded-lg border border-gray-100 p-3 text-xs">
              <span className="font-semibold">
                {grade} - {PROOF_GRADE_RUBRIC[grade].label}
              </span>
              <p className="mt-1 text-gray-600">{PROOF_GRADE_RUBRIC[grade].description}</p>
              <p className="mt-1 text-gray-400">{PROOF_GRADE_RUBRIC[grade].supports}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 card-shell">
        <h2 className="text-sm font-semibold text-gray-700">Participants ({participants.length})</h2>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${p.role === 'facilitator' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {p.name} {p.role === 'facilitator' && <span className="text-xs text-gray-400">(facilitator)</span>}
            </li>
          ))}
        </ul>

        {!participantId && (
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Your name"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
            />
            <button onClick={handleJoin} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
              Join
            </button>
          </div>
        )}
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 flex justify-end gap-3">
        {participantId && (
          <a
            href={`/w/${workshopId}/room?pid=${participantId}&token=${existingToken ?? ''}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
          >
            Enter room
          </a>
        )}
        {isFacilitator && (
          <button onClick={handleStart} className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white">
            Start workshop
          </button>
        )}
      </div>
      {!isFacilitator && participantId && (
        <p className="mt-2 text-right text-xs text-gray-400">Only the facilitator can start the workshop clock.</p>
      )}
    </main>
  );
}
