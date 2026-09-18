'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getWorkshop,
  listParticipants,
  listCards,
  listEvidence,
  listTheses,
  listDecisions,
} from '@/lib/data';
import { rowToCard } from '@/lib/mappers';
import type { Card, Workshop, Participant, Evidence, GTMThesis, Decision } from '@/lib/types';
import { PHASES } from '@/lib/types';
import { useRealtimeTable } from '@/lib/useRealtimeTable';
import { usePresence } from '@/lib/usePresence';
import { CardCanvas } from '@/components/CardCanvas';
import { AgendaPanel } from '@/components/AgendaPanel';
import { AIPanel } from '@/components/AIPanel';
import { DecisionRegister } from '@/components/DecisionRegister';
import { EvidenceModal } from '@/components/EvidenceModal';
import { CommentsModal } from '@/components/CommentsModal';

export default function RoomPage({ params }: { params: { workshopId: string } }) {
  const { workshopId } = params;
  const search = useSearchParams();
  const participantId = search.get('pid') ?? '';

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [theses, setTheses] = useState<GTMThesis[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [evidenceModalCard, setEvidenceModalCard] = useState<Card | null>(null);
  const [commentsModalCard, setCommentsModalCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const me = participants.find((p) => p.id === participantId);

  const refreshTheses = useCallback(() => {
    listTheses(workshopId).then(setTheses);
    listDecisions(workshopId).then(setDecisions);
  }, [workshopId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, p, c, ev, th, dec] = await Promise.all([
          getWorkshop(workshopId),
          listParticipants(workshopId),
          listCards(workshopId),
          listEvidence(workshopId),
          listTheses(workshopId),
          listDecisions(workshopId),
        ]);
        if (cancelled) return;
        setWorkshop(w);
        setParticipants(p);
        setCards(c);
        setEvidence(ev);
        setTheses(th);
        setDecisions(dec);
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

  // Realtime: cards
  useRealtimeTable('cards', workshopId, (payload) => {
    if (payload.eventType === 'INSERT') {
      setCards((prev) => (prev.some((c) => c.id === payload.new.id) ? prev : [...prev, rowToCard(payload.new)]));
    } else if (payload.eventType === 'UPDATE') {
      setCards((prev) => prev.map((c) => (c.id === payload.new.id ? rowToCard(payload.new) : c)));
    } else if (payload.eventType === 'DELETE') {
      setCards((prev) => prev.filter((c) => c.id !== payload.old.id));
    }
  });

  // Realtime: participants
  useRealtimeTable('participants', workshopId, () => {
    listParticipants(workshopId).then(setParticipants);
  });

  // Realtime: theses & decisions
  useRealtimeTable('gtm_theses', workshopId, () => refreshTheses());
  useRealtimeTable('decisions', workshopId, () => refreshTheses());

  // Realtime: workshop phase changes (polled via participants channel proxy - direct table below)
  useEffect(() => {
    const interval = setInterval(() => {
      getWorkshop(workshopId).then((w) => w && setWorkshop(w));
    }, 5000);
    return () => clearInterval(interval);
  }, [workshopId]);

  const { presentUsers } = usePresence(workshopId, participantId, me?.name ?? 'Guest', me?.role ?? 'participant');

  if (loading) return <main className="p-10 text-sm text-gray-500">Loading room...</main>;
  if (!workshop) return <main className="p-10 text-sm text-red-600">Workshop not found. {error}</main>;
  if (!me) {
    return (
      <main className="p-10 text-sm text-gray-600">
        You need to join from the <a className="text-blue-700 underline" href={`/w/${workshopId}/lobby`}>lobby</a> first.
      </main>
    );
  }

  const activePhase = PHASES.find((p) => p.id === workshop.activePhase) ?? PHASES[0];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div>
          <p className="text-sm font-bold">{workshop.name}</p>
          <p className="text-xs text-gray-500">
            Phase {activePhase.index}/{PHASES.length - 1}: {activePhase.name} · {activePhase.minutes} min suggested
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{presentUsers.length} online</span>
          <a href={`/w/${workshopId}/brief`} className="rounded-md border border-gray-300 px-3 py-1.5 font-semibold text-gray-700">
            Export
          </a>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[220px_1fr_320px] overflow-hidden">
        <aside className="overflow-hidden border-r border-gray-200 bg-white">
          <AgendaPanel
            workshopId={workshopId}
            activePhase={workshop.activePhase}
            isFacilitator={me.role === 'facilitator'}
            presentUsers={presentUsers}
            participants={participants}
          />
        </aside>

        <main className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <CardCanvas
              workshopId={workshopId}
              cards={cards}
              participants={participants}
              currentParticipantId={participantId}
              onOpenEvidence={setEvidenceModalCard}
              onOpenComments={setCommentsModalCard}
            />
          </div>
          <div className="max-h-72 overflow-y-auto border-t border-gray-200 bg-white scrollbar-thin">
            <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Decision register</p>
            <DecisionRegister
              workshopId={workshopId}
              theses={theses}
              decisions={decisions}
              currentParticipantName={me.name}
              onThesesChanged={refreshTheses}
            />
          </div>
        </main>

        <aside className="overflow-hidden border-l border-gray-200 bg-white">
          <AIPanel
            workshop={workshop}
            cards={cards}
            evidence={evidence}
            theses={theses}
            decisions={decisions}
            participants={participants}
            currentParticipantId={participantId}
            currentParticipantName={me.name}
          />
        </aside>
      </div>

      {evidenceModalCard && (
        <EvidenceModal
          workshopId={workshopId}
          card={evidenceModalCard}
          currentParticipantId={participantId}
          currentParticipantName={me.name}
          onClose={() => setEvidenceModalCard(null)}
        />
      )}
      {commentsModalCard && (
        <CommentsModal
          card={commentsModalCard}
          workshopId={workshopId}
          currentParticipantId={participantId}
          currentParticipantName={me.name}
          onClose={() => setCommentsModalCard(null)}
        />
      )}
    </div>
  );
}
