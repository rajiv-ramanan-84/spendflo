"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Building2, LayoutDashboard, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/today", label: "Tasks", icon: CalendarCheck },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/team", label: "Team", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:bg-canvas hover:text-ink-900",
            )}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Today must work one-handed on a phone, so mobile gets a bottom tab bar. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-brand-600" : "text-ink-500")}
          >
            <Icon size={20} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
