import { LinkedInActivity, type LinkedInEventRow } from "@/components/settings/linkedin-activity";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { openSettings } from "@/lib/settings/open";

export default async function LinkedInPage() {
  const { db, item, allowed } = await openSettings("linkedin");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const { data: ev } = await db.from("linkedin_events").select("id, kind, status, person_name, headline, detail, received_at, account_id").order("received_at", { ascending: false }).limit(30);
  const ids = [...new Set((ev ?? []).map((e) => e.account_id as string | null).filter((v): v is string => !!v))];
  const { data: accts } = ids.length ? await db.from("accounts").select("id, name").in("id", ids) : { data: [] as Array<{ id: string; name: string }> };
  const nameOf = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
  const rows: LinkedInEventRow[] = (ev ?? []).map((e) => ({ id: e.id, kind: e.kind, status: e.status, person_name: e.person_name, headline: e.headline, detail: e.detail, received_at: e.received_at, account_name: e.account_id ? nameOf.get(e.account_id as string) ?? null : null }));
  return <PageFrame item={item}><LinkedInActivity rows={rows} /></PageFrame>;
}
