import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadChecklist } from "@/lib/checklist/service";
import { visibleNav } from "@/lib/settings/nav";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ToastHost } from "@/components/settings/kit";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const open = db ? (await loadChecklist(db, user).catch(() => null))?.open.length ?? 0 : 0;
  const items = visibleNav(user.role).map(({ id, label, href, group }) => ({ id, label, href, group }));
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={null}>
        <SettingsShell items={items} role={user.role} badge={{ me: open }}>{children}</SettingsShell>
      </Suspense>
      <ToastHost />
    </>
  );
}
