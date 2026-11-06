"use client";

import { useEffect } from "react";

export type UndoState = { stepId: string; label: string; at: number };

/** Undo, not confirm (PRD section 12): every done, skip and snooze can be undone for 10 seconds. */
export function UndoToast({ state, onUndo, onExpire }: { state: UndoState; onUndo: () => void; onExpire: () => void }) {
  useEffect(() => {
    const t = setTimeout(onExpire, 10_000);
    return () => clearTimeout(t);
  }, [state, onExpire]);
  return (
    <div role="status" className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit items-center gap-4 rounded-full bg-ink-900 px-5 py-3 text-sm text-white shadow-[var(--shadow-lift)] md:bottom-8">
      <span>{state.label}</span>
      <button onClick={onUndo} className="font-semibold text-brand-200 hover:text-white">Undo</button>
    </div>
  );
}
