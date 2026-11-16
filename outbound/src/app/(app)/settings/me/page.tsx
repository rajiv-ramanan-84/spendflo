import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/settings/kit";
import { MySettings } from "@/components/settings/my-settings";
import { PageFrame, NoAccess } from "@/components/settings/page-frame";
import { SetupChecklist } from "@/components/settings/setup-checklist";
import { loadChecklist } from "@/lib/checklist/service";
import { loadMailboxSettings } from "@/lib/google/mailbox-settings";
import { loadHealth } from "@/lib/settings/health-load";
import { openSettings } from "@/lib/settings/open";
import { loadWritingRules, mailboxesRunBy } from "@/lib/writing/rules";

export default async function MySetup() {
  const { user, db, item, allowed } = await openSettings("me");
  if (!db || !allowed || !user.id) return <NoAccess item={item} db={db} />;
  const [tiles, rules, checklist, { data: me }, run, mail] = await Promise.all([loadHealth(db, user), loadWritingRules(db), loadChecklist(db, user), db.from("users").select("slack_user_id").eq("id", user.id).single(), mailboxesRunBy(db, user.id), loadMailboxSettings(db)]);
  const connections = tiles.filter((t) => ["gmail", "mailbox"].includes(t.id));
  const sender = rules.senders[user.id];
  return (
    <PageFrame item={item}>
      <Card className="divide-y divide-line">
        {connections.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0"><div className="text-sm font-medium">{t.label}</div>{t.detail ? <p className="text-sm text-ink-500">{t.detail}</p> : null}</div>
            <div className="flex items-center gap-3"><Chip tone={t.tone}>{t.value}</Chip>{t.cta ? <Link href={t.href} className="text-sm font-medium text-brand-700 hover:underline">{t.cta}</Link> : null}</div>
          </div>
        ))}
      </Card>
      <MySettings meId={user.id} slackUserId={(me?.slack_user_id as string | null) ?? ""} voice={sender?.voice ?? ""} signature={sender?.signature ?? ""} mailboxes={mail.mailboxes.filter((m) => run.includes(m.id)).map((m) => ({ id: m.id, email: m.email, writesAs: m.writesAs }))} />
      {checklist.total > 0 ? <SetupChecklist items={checklist.open} total={checklist.total} /> : null}
    </PageFrame>
  );
}
