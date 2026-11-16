import { MailboxSettings } from "@/components/settings/mailbox-settings";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { loadMailboxSettings } from "@/lib/google/mailbox-settings";
import { openSettings } from "@/lib/settings/open";

export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ mailbox_connected?: string; mailbox_error?: string }> }) {
  const sp = await searchParams;
  const { user, db, item, allowed, canAdmin } = await openSettings("mailboxes");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const mail = await loadMailboxSettings(db);
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "mailbox" }}>
      <MailboxSettings {...mail} canEdit={canAdmin} meId={user.id ?? null} flash={sp.mailbox_connected ? "connected" : (sp.mailbox_error ?? null)} />
    </PageFrame>
  );
}
