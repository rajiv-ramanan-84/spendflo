import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { WritingSettings } from "@/components/settings/writing-settings";
import { openSettings } from "@/lib/settings/open";
import { loadWritingRules, loadWritingSettings } from "@/lib/writing/rules";

export default async function WritingRulesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const { db, item, allowed, canAdmin, canManage } = await openSettings("rules");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const [rules, settings] = await Promise.all([loadWritingRules(db), loadWritingSettings(db)]);
  const tab = sp.tab === "founder" && canManage ? "founder" : sp.tab === "persona" || sp.tab === "sender" ? sp.tab : "team";
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "settings", actions: ["writing_rules_updated"] }}>
      <WritingSettings key={tab} rules={rules} {...settings} canEdit={canAdmin} initialTab={tab} />
    </PageFrame>
  );
}
