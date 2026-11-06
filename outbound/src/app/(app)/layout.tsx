import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Logo } from "@/components/ui/logo";
import { BottomNav, TopNav } from "@/components/shell/nav";
import { UserMenu } from "@/components/shell/user-menu";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lastSheetSync } from "@/lib/data/data-quality";

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const sync = db ? await lastSheetSync(db).catch(() => null) : null;

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-8">
          <div className="flex items-center gap-8">
            <Link href="/today">
              <Logo />
            </Link>
            <TopNav />
          </div>
          <div className="flex items-center gap-5">
            <Link href="/settings#data" className={`hidden text-xs lg:inline ${sync && !sync.ok ? "text-rose-600" : "text-ink-400"} hover:text-ink-700`}>
              {sync ? (sync.ok ? `Sheet synced ${ago(sync.at)}` : `Sheet sync failed ${ago(sync.at)}`) : "Sheet not synced yet"}
            </Link>
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      <BottomNav />
    </div>
  );
}
