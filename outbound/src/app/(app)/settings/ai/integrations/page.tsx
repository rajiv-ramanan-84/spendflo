import { IntegrationsSettings } from "@/components/settings/integrations-settings";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { listIntegrations } from "@/lib/agent/integrations";
import { openSettings } from "@/lib/settings/open";

export default async function IntegrationsPage() {
  const { db, item, allowed, canAdmin } = await openSettings("integrations");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const ints = await listIntegrations(db);
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "integration" }}>
      <IntegrationsSettings integrations={ints.integrations} tools={ints.tools} canEdit={canAdmin} />
    </PageFrame>
  );
}
