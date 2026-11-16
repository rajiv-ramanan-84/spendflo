import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GROUPS, type NavItem } from "@/lib/settings/nav";

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** A page's heading: where it sits, what it is, and who last changed it. */
export async function PageFrame({ item, db, changed, action, children }: { item: Pick<NavItem, "label" | "blurb" | "group">; db?: SupabaseClient | null; changed?: { entityType: string; actions?: string[] }; action?: React.ReactNode; children: React.ReactNode }) {
  let last: { by: string; at: string } | null = null;
  if (db && changed) {
    let q = db.from("activity_log").select("actor_id, at").eq("entity_type", changed.entityType).order("id", { ascending: false }).limit(1);
    if (changed.actions?.length) q = q.in("action", changed.actions);
    const { data } = await q.maybeSingle();
    if (data) {
      const { data: u } = data.actor_id ? await db.from("users").select("name").eq("id", data.actor_id).maybeSingle() : { data: null };
      last = { by: (u?.name as string | undefined) ?? "the system", at: data.at as string };
    }
  }
  const group = GROUPS.find((g) => g.id === item.group)?.label;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          {group ? <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">{group}</div> : null}
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight md:text-2xl">{item.label}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">{item.blurb}</p>
          {last ? <p className="mt-1 text-xs text-ink-400">Last changed by {last.by}, {ago(last.at)}</p> : null}
        </div>
        {action}
      </div>
      <div className="grid gap-5">{children}</div>
    </div>
  );
}

/** Shown instead of a page the person's role does not include, with who can help. */
export async function NoAccess({ item, db }: { item: Pick<NavItem, "label">; db: SupabaseClient | null }) {
  const { data } = db ? await db.from("users").select("name").eq("role", "admin").eq("active", true) : { data: [] as Array<{ name: string }> };
  const names = (data ?? []).map((u) => u.name as string);
  return (
    <Card className="p-8 text-center">
      <Lock size={22} className="mx-auto text-ink-400" />
      <h1 className="mt-3 text-lg font-semibold">{item.label} is not part of your role</h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{names.length ? `Ask ${names.join(" or ")} if something here needs changing.` : "Ask an admin if something here needs changing."}</p>
      <Link href="/settings" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Back to Overview</Link>
    </Card>
  );
}
