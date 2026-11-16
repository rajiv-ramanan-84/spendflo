import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { SkillSettings } from "@/components/settings/skill-settings";
import { loadSkillSettings } from "@/lib/claude/skill-settings";
import { openSettings } from "@/lib/settings/open";

export default async function PlaybookPage() {
  const { db, item, allowed, canAdmin } = await openSettings("playbook");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const skill = await loadSkillSettings(db);
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "settings", actions: ["skill_updated"] }}>
      <SkillSettings {...skill} canEdit={canAdmin} />
    </PageFrame>
  );
}
