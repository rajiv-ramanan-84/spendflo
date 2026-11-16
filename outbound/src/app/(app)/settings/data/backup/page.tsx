import { Card } from "@/components/ui/card";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { openSettings } from "@/lib/settings/open";

export default async function BackupPage() {
  const { db, item, allowed } = await openSettings("backup");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  return (
    <PageFrame item={item}>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
        <div className="max-w-2xl">
          <h2 className="text-[15px] font-semibold">Monthly backup</h2>
          <p className="mt-1 text-sm text-ink-500">The free database plan keeps no backups. Download one on the first working day of each month and save it to Google Drive. Accounts and contacts can always be re-synced from the sheet. Campaigns, replies and history live only here.</p>
        </div>
        <a href="/api/settings/backup" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink-900 hover:border-brand-200 hover:bg-brand-50">Download backup</a>
      </Card>
    </PageFrame>
  );
}
