import { FeedSettings } from "@/components/settings/feed-settings";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { loadFeedSettings } from "@/lib/signals-feed/settings";
import { openSettings } from "@/lib/settings/open";

export default async function SignalsPage() {
  const { db, item, allowed } = await openSettings("signals");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const feed = await loadFeedSettings(db);
  return <PageFrame item={item}><FeedSettings {...feed} /></PageFrame>;
}
