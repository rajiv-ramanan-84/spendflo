import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAccounts, listUsers } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/page-header";
import { AccountsTable } from "@/components/accounts/accounts-table";
import { SyncButton } from "@/components/accounts/sync-button";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireUser();
  const db = await createSupabaseServerClient();
  const [accounts, users] = await Promise.all([listAccounts(db, { includeArchived: true }), listUsers(db)]);
  const active = accounts.filter((a) => !a.archived);

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`${active.length} active accounts, ${accounts.length - active.length} archived for reference. Synced from the Coupa account book every hour.`}
        action={user.role !== "member" ? <SyncButton /> : undefined}
      />
      <AccountsTable accounts={accounts} users={users.filter((u) => u.active)} me={user.id} canAssign={user.role !== "member"} />
    </>
  );
}
