import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/settings/kit";
import { PageFrame, NoAccess } from "@/components/settings/page-frame";
import { SetupChecklist } from "@/components/settings/setup-checklist";
import { loadChecklist } from "@/lib/checklist/service";
import { loadHealth } from "@/lib/settings/health-load";
import { openSettings } from "@/lib/settings/open";
import { loadWritingRules } from "@/lib/writing/rules";

export default async function MySetup() {
  const { user, db, item, allowed, canAdmin } = await openSettings("me");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const [tiles, rules, checklist, { data: admins }] = await Promise.all([loadHealth(db, user), loadWritingRules(db), loadChecklist(db, user), db.from("users").select("name").eq("role", "admin").eq("active", true)]);
  const mine = tiles.filter((t) => ["gmail", "mailbox", "me-slack", "signature"].includes(t.id));
  const sender = rules.senders[user.id ?? ""];
  const adminNames = (admins ?? []).map((a) => a.name as string).join(" or ");
  return (
    <PageFrame item={item}>
      <Card className="divide-y divide-line">
        {mine.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0"><div className="text-sm font-medium">{t.label}</div>{t.detail ? <p className="text-sm text-ink-500">{t.detail}</p> : null}</div>
            <div className="flex items-center gap-3"><Chip tone={t.tone}>{t.value}</Chip>{t.cta ? <Link href={t.href} className="text-sm font-medium text-brand-700 hover:underline">{t.cta}</Link> : null}</div>
          </div>
        ))}
      </Card>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-[15px] font-semibold">Your signature and voice</h2><p className="mt-0.5 text-sm text-ink-500">Added to every email you send. Claude writes in your voice and never writes the signature.</p></div>
          <Link href="/settings/writing/rules" className="shrink-0 text-sm font-medium text-brand-700 hover:underline">{canAdmin ? "Edit" : "View"}</Link>
        </div>
        {sender?.signature?.trim() ? <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-3 font-sans text-sm">{sender.signature}</pre> : <p className="mt-3 text-sm text-amber-800">No signature yet.</p>}
        {sender?.voice?.trim() ? <p className="mt-3 line-clamp-3 text-sm text-ink-600">{sender.voice}</p> : null}
        {!canAdmin ? <p className="mt-3 text-xs text-ink-400">Only admins change these{adminNames ? `. Ask ${adminNames}.` : "."}</p> : null}
      </Card>
      {checklist.total > 0 ? <SetupChecklist items={checklist.open} total={checklist.total} /> : null}
    </PageFrame>
  );
}
