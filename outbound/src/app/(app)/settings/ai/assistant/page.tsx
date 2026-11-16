import { AgentSettings } from "@/components/settings/agent-settings";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { loadAgentConfig, monthTotals } from "@/lib/agent/store";
import { openSettings } from "@/lib/settings/open";

export default async function AssistantPage() {
  const { db, item, allowed, canAdmin } = await openSettings("assistant");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const [cfg, totals] = await Promise.all([loadAgentConfig(db), monthTotals(db)]);
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "agent_config" }}>
      <AgentSettings cfg={cfg} usd={totals.usd} credits={totals.credits} canEdit={canAdmin} />
    </PageFrame>
  );
}
