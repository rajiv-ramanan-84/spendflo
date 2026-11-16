import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { WritingSettings } from "@/components/settings/writing-settings";
import { loadMailboxSettings } from "@/lib/google/mailbox-settings";
import { openSettings } from "@/lib/settings/open";
import { loadWritingRules, loadWritingSettings, writingPermissions } from "@/lib/writing/rules";

export default async function WritingRulesPage({ searchParams }: { searchParams: Promise<{ tab?: string; mailbox?: string }> }) {
  const sp = await searchParams;
  const { user, db, item, allowed, canManage } = await openSettings("rules");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const [rules, settings, perm, mail] = await Promise.all([loadWritingRules(db), loadWritingSettings(db), writingPermissions(db, user), loadMailboxSettings(db)]);
  const tab = sp.tab === "founder" && canManage ? "founder" : sp.tab === "persona" || sp.tab === "sender" || sp.tab === "mailbox" ? sp.tab : "team";
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "settings", actions: ["writing_rules_updated"] }}>
      <WritingSettings key={`${tab}${sp.mailbox ?? ""}`} rules={rules} {...settings} mailboxes={mail.mailboxes.map((m) => ({ id: m.id, email: m.email, writesAs: m.writesAs }))} perm={perm} meId={user.id ?? null} initialTab={tab} initialMailbox={sp.mailbox} />
    </PageFrame>
  );
}
