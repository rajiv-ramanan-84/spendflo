import { MailboxSettings } from "@/components/settings/mailbox-settings";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { DomainsCard, LimitsCard, type DomainRow } from "@/components/sending/limits-card";
import { loadMailboxSettings } from "@/lib/google/mailbox-settings";
import { openSettings } from "@/lib/settings/open";
import { outreachInboxExists } from "@/lib/sending/guard";
import { coreDomainSet, isCoreAddress } from "@/lib/sending/rules";
import { allMailboxUsage } from "@/lib/sending/usage";

export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ mailbox_connected?: string; mailbox_error?: string }> }) {
  const sp = await searchParams;
  const { user, db, item, allowed, canAdmin } = await openSettings("mailboxes");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const [mail, usage, { data: doms }, { data: logins }] = await Promise.all([loadMailboxSettings(db), allMailboxUsage(db), db.from("sending_domains").select("domain, kind, spf, dkim, dmarc, checked_at").order("kind").order("domain"), db.from("users").select("email").eq("active", true)]);
  const core = coreDomainSet(usage.cfg, (logins ?? []).map((u) => u.email as string));
  const armed = usage.cfg.protectCore !== "off" && (await outreachInboxExists(db, (e) => isCoreAddress(e, core)));
  const domains: DomainRow[] = (doms ?? []).map((d) => ({ domain: String(d.domain), kind: d.kind as "core" | "outreach", spf: d.spf as string | null, dkim: d.dkim as string | null, dmarc: d.dmarc as string | null, checkedAt: d.checked_at as string | null }));
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "mailbox" }}>
      <LimitsCard cfg={usage.cfg} canEdit={canAdmin} armed={armed} />
      <MailboxSettings {...mail} canEdit={canAdmin} meId={user.id ?? null} flash={sp.mailbox_connected ? "connected" : (sp.mailbox_error ?? null)} usage={Object.fromEntries(usage.inboxes.map((i) => [i.mailboxId!, i]))} />
      <DomainsCard domains={domains} canCheck />
    </PageFrame>
  );
}
