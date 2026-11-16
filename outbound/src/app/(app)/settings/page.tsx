import { Suspense } from "react";
import { PageFrame } from "@/components/settings/page-frame";
import { Overview } from "@/components/settings/overview";
import { SetupChecklist } from "@/components/settings/setup-checklist";
import { LegacyHashRedirect } from "@/components/settings/legacy-redirect";
import { loadChecklist } from "@/lib/checklist/service";
import { loadHealth } from "@/lib/settings/health-load";
import { openSettings } from "@/lib/settings/open";

export default async function SettingsOverview() {
  const { user, db, item } = await openSettings("overview");
  if (!db) return null;
  const [tiles, checklist] = await Promise.all([loadHealth(db, user), loadChecklist(db, user)]);
  return (
    <PageFrame item={item}>
      <Suspense fallback={null}><LegacyHashRedirect /></Suspense>
      <Overview tiles={tiles} name={user.name} />
      {checklist.total > 0 ? <SetupChecklist items={checklist.open} total={checklist.total} /> : null}
    </PageFrame>
  );
}
