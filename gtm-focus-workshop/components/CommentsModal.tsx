'use client';

import { useEffect, useState } from 'react';
import type { Card, Comment } from '@/lib/types';
import { listCardComments, addComment } from '@/lib/data';

export function CommentsModal({
  card,
  workshopId,
  currentParticipantId,
  currentParticipantName,
  onClose,
}: {
  card: Card;
  workshopId: string;
  currentParticipantId: string;
  currentParticipantName: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    listCardComments(card.id).then(setComments);
  }, [card.id]);

  async function submit() {
    if (!text.trim()) return;
    const c = await addComment(workshopId, card.id, currentParticipantId, text);
    setComments((prev) => [...prev, c]);
    setText('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <p className="text-lg font-bold">Comments: {card.title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-gray-50 p-2 text-xs">
              {c.body}
            </li>
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-400">No comments yet.</p>}
        </ul>
        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            placeholder={`Comment as ${currentParticipantName}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button onClick={submit} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
