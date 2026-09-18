'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, Evidence, GTMThesis, Decision, ChatMessage, ProposedAction, FacilitationContext, Workshop, Participant } from '@/lib/types';
import { PHASES } from '@/lib/types';
import { addChatMessage, listChatMessages, createProposal, setProposalStatus } from '@/lib/data';
import { applyProposedAction } from '@/lib/applyProposedAction';

type Channel = 'facilitator' | 'evidence_coach';

export function AIPanel({
  workshop,
  cards,
  evidence,
  theses,
  decisions,
  participants,
  currentParticipantId,
  currentParticipantName,
}: {
  workshop: Workshop;
  cards: Card[];
  evidence: Evidence[];
  theses: GTMThesis[];
  decisions: Decision[];
  participants: Participant[];
  currentParticipantId: string;
  currentParticipantName: string;
}) {
  const [channel, setChannel] = useState<Channel>('facilitator');
  const [messages, setMessages] = useState<Record<Channel, ChatMessage[]>>({ facilitator: [], evidence_coach: [] });
  const [input, setInput] = useState('');
  const [pendingActions, setPendingActions] = useState<{ actions: ProposedAction[]; proposalId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listChatMessages(workshop.id, 'facilitator').then((m) => setMessages((prev) => ({ ...prev, facilitator: m })));
    listChatMessages(workshop.id, 'evidence_coach').then((m) => setMessages((prev) => ({ ...prev, evidence_coach: m })));
  }, [workshop.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, channel]);

  const activePhase = PHASES.find((p) => p.id === workshop.activePhase) ?? PHASES[0];

  async function send() {
    if (!input.trim() || busy) return;
    setError(null);
    const userText = input;
    setInput('');
    setBusy(true);

    const userMsg = await addChatMessage({ workshopId: workshop.id, channel, role: 'user', authorName: currentParticipantName, content: userText });
    setMessages((prev) => ({ ...prev, [channel]: [...prev[channel], userMsg] }));

    const context: FacilitationContext = {
      workshop: { goal: workshop.goal, companyContext: workshop.companyContext },
      activePhase: { id: activePhase.id, name: activePhase.name, prompt: activePhase.prompt, minutesRemaining: activePhase.minutes },
      participants: participants.map((p) => ({ name: p.name, role: p.role, presence: 'online' })),
      cards,
      evidence,
      theses,
      decisions,
      recentMessages: messages[channel].slice(-10),
    };

    try {
      const endpoint = channel === 'facilitator' ? '/api/facilitator' : '/api/evidence-coach';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, userMessage: userText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'AI request failed');

      const assistantMsg = await addChatMessage({ workshopId: workshop.id, channel, role: 'assistant', content: json.message });
      setMessages((prev) => ({ ...prev, [channel]: [...prev[channel], assistantMsg] }));

      const actions: ProposedAction[] = json.proposedActions ?? [];
      if (actions.length > 0) {
        const proposal = await createProposal({ workshopId: workshop.id, channel, actions, createdBy: 'ai' });
        setPendingActions({ actions, proposalId: proposal.id });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptAction(action: ProposedAction, index: number) {
    try {
      await applyProposedAction(workshop.id, workshop.activePhase, currentParticipantId, action);
      if (pendingActions) {
        const remaining = pendingActions.actions.filter((_, i) => i !== index);
        if (remaining.length === 0) {
          await setProposalStatus(pendingActions.proposalId, 'accepted');
          setPendingActions(null);
        } else {
          setPendingActions({ ...pendingActions, actions: remaining });
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function rejectAction(index: number) {
    if (!pendingActions) return;
    const remaining = pendingActions.actions.filter((_, i) => i !== index);
    if (remaining.length === 0) {
      await setProposalStatus(pendingActions.proposalId, 'rejected');
      setPendingActions(null);
    } else {
      setPendingActions({ ...pendingActions, actions: remaining });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-gray-200">
        {(['facilitator', 'evidence_coach'] as Channel[]).map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`flex-1 px-3 py-2 text-xs font-semibold ${channel === c ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400'}`}
          >
            {c === 'facilitator' ? 'Facilitator' : 'Evidence Coach'}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin">
        {messages[channel].length === 0 && (
          <p className="text-xs text-gray-400">
            {channel === 'facilitator'
              ? 'Ask the facilitator for the next question, a missing dimension, or to propose board changes.'
              : 'Paste a claim or point at a card and ask the Evidence Coach to grade its proof quality.'}
          </p>
        )}
        {messages[channel].map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${m.role === 'user' ? 'ml-6 bg-gray-900 text-white' : 'mr-6 bg-gray-100 text-gray-800'}`}>
            {m.role === 'user' && m.authorName && <p className="mb-0.5 text-[10px] font-semibold opacity-70">{m.authorName}</p>}
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {pendingActions && pendingActions.actions.length > 0 && (
        <div className="max-h-64 space-y-2 overflow-y-auto border-t border-gray-200 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-800">Proposed actions - review before they change the board</p>
          {pendingActions.actions.map((a, i) => (
            <div key={i} className="rounded-md border border-amber-200 bg-white p-2 text-xs">
              <p className="font-semibold text-gray-800">{a.kind.replace(/_/g, ' ')}</p>
              <p className="mt-0.5 text-gray-600">{a.summary}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => acceptAction(a, i)} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">
                  Accept
                </button>
                <button onClick={() => rejectAction(i)} className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="px-3 pb-1 text-[11px] text-red-600">{error}</p>}

      <div className="flex gap-2 border-t border-gray-200 p-2">
        <input
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
          placeholder={busy ? 'Thinking...' : 'Message the AI...'}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} disabled={busy} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}
