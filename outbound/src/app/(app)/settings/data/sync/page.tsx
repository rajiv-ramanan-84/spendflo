import { DataSettings } from "@/components/settings/data-settings";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { loadDataSettings } from "@/lib/data/data-quality";
import { openSettings } from "@/lib/settings/open";

export default async function SyncPage() {
  const { db, item, allowed, canManage } = await openSettings("sync");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const data = await loadDataSettings(db);
  return <PageFrame item={item}><DataSettings {...data} canEdit={canManage} /></PageFrame>;
}
