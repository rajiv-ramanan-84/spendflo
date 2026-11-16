import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { SlackSettings } from "@/components/settings/slack-settings";
import { loadSlackSettings } from "@/lib/slack/settings";
import { openSettings } from "@/lib/settings/open";

export default async function SlackPage() {
  const { db, item, allowed, canAdmin } = await openSettings("slack");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const slack = await loadSlackSettings(db);
  return <PageFrame item={item} db={db} changed={{ entityType: "settings", actions: ["slack_updated"] }}><SlackSettings {...slack} canEdit={canAdmin} /></PageFrame>;
}
