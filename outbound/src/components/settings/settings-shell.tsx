"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { GROUPS, searchSettings, type NavItem, type Role } from "@/lib/settings/nav";

type Item = Pick<NavItem, "id" | "label" | "href" | "group">;

/** The settings frame: a left menu on desktop, a picker on a phone, and "find a setting". */
export function SettingsShell({ items, role, badge, children }: { items: Item[]; role: Role; badge: Record<string, number>; children: React.ReactNode }) {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchSettings(q, role), [q, role]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !t?.isContentEditable) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const tab = sp.get("tab");
  const active = (i: Item) => {
    const [p, query] = i.href.split("?");
    if (p !== path) return false;
    const want = new URLSearchParams(query ?? "").get("tab");
    return want ? tab === want : !(path === "/settings/writing/rules" && tab);
  };
  const current = items.find(active) ?? items.find((i) => i.href.split("?")[0] === path);

  function go(href: string) { setOpen(false); setQ(""); router.push(href); }

  return (
    <div className="grid gap-6 md:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
      <aside className="md:sticky md:top-24 md:self-start">
        <div className="relative">
          <label htmlFor="settings-search" className="sr-only">Find a setting</label>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            id="settings-search" ref={input} value={q} autoComplete="off" placeholder="Find a setting"
            onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) go(hits[0].href); if (e.key === "Escape") { setQ(""); input.current?.blur(); } }}
            className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-8 text-sm placeholder:text-ink-400 focus:border-brand-300 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-ink-400 md:block">/</kbd>
          {open && q.trim() ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
              {hits.length === 0 ? <p className="px-3 py-3 text-sm text-ink-500">Nothing matches &ldquo;{q}&rdquo;.</p> : hits.map((h) => (
                <button key={h.label + h.href} onMouseDown={(e) => e.preventDefault()} onClick={() => go(h.href)} className="block w-full px-3 py-2 text-left hover:bg-canvas">
                  <span className="block text-sm font-medium">{h.label}</span><span className="block text-xs text-ink-400">{h.where}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="mt-4 block md:hidden">
          <span className="sr-only">Settings section</span>
          <select value={current ? current.href : "/settings"} onChange={(e) => go(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium">
            {GROUPS.map((g) => { const list = items.filter((i) => i.group === g.id); return list.length ? <optgroup key={g.id} label={g.label ?? "Settings"}>{list.map((i) => <option key={i.id} value={i.href}>{i.label}</option>)}</optgroup> : null; })}
          </select>
        </label>

        <nav className="mt-5 hidden md:block" aria-label="Settings">
          {GROUPS.map((g) => {
            const list = items.filter((i) => i.group === g.id);
            if (!list.length) return null;
            return (
              <div key={g.id} className="mb-4">
                {g.label ? <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g.label}</div> : null}
                <ul className="grid gap-0.5">
                  {list.map((i) => (
                    <li key={i.id}>
                      <Link href={i.href} aria-current={active(i) ? "page" : undefined} className={cn("flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors", active(i) ? "bg-brand-50 font-medium text-brand-700" : "text-ink-600 hover:bg-canvas hover:text-ink-900")}>
                        {i.label}
                        {badge[i.id] ? <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{badge[i.id]}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
