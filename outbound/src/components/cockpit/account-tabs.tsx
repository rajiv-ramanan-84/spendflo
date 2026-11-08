"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type AccountTab = { id: string; label: string; badge?: number; tone?: "alert" };

/** One screen per tab, chosen by the link's #hash so a Slack or Tasks link lands on the right one. */
const ALIASES: Record<string, string> = { responses: "activity" };

export function AccountTabs({ tabs, panels, initial }: { tabs: AccountTab[]; panels: Record<string, React.ReactNode>; initial: string }) {
  const [tab, setTab] = useState(initial);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      const id = ALIASES[h] ?? h;
      if (tabs.some((t) => t.id === id)) setTab(id);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [tabs]);

  function go(id: string) {
    setTab(id);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  }

  return (
    <>
      <div role="tablist" aria-label="Account sections" className="sticky top-0 z-20 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur md:mx-0 md:px-0">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}
            className={cn("inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-3 text-sm font-medium", tab === t.id ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>
            {t.label}
            {t.badge ? <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", t.tone === "alert" ? "bg-emerald-100 text-emerald-800" : "bg-white text-ink-500 ring-1 ring-line")}>{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={tab !== t.id} className="grid gap-5">{panels[t.id]}</div>
      ))}
    </>
  );
}
