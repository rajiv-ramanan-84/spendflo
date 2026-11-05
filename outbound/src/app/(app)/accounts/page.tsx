import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function AccountsPage() {
  return (
    <>
      <PageHeader title="Accounts" subtitle="The whole book: tier, owner, personas engaged and next step." />
      <Card>
        <EmptyState icon={<Building2 size={20} />} title="The account book isn't synced yet" body="Once the Coupa account book is connected in Settings, all 118 accounts show up here, ready to assign." />
      </Card>
    </>
  );
}
