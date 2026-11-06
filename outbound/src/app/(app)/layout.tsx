import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Logo } from "@/components/ui/logo";
import { BottomNav, TopNav } from "@/components/shell/nav";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

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
            <span className="hidden text-xs text-ink-400 lg:inline" title="Sheet sync arrives in milestone 4">
              Sheet sync: not connected
            </span>
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      <BottomNav />
    </div>
  );
}
