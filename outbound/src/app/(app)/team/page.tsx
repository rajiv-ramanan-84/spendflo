import { PageHeader, StatTile } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";

const KPIS = ["Accounts assigned", "Campaigns live", "Penetration rate", "Replies this week", "Meetings booked", "Steps due today", "On-time completion"];
const FUNNEL = ["Assigned", "Touched", "Connected", "Engaged", "Meeting"];

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Command Center" subtitle="One shared picture of everything in motion." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {KPIS.map((k) => (
          <StatTile key={k} label={k} value={k.includes("rate") || k.includes("completion") ? "0%" : 0} />
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader title="Penetration funnel" hint="Penetration = at least one persona replied or met." />
        <div className="grid grid-cols-5 gap-2 p-5">
          {FUNNEL.map((stage, i) => (
            <div key={stage} className="text-center">
              <div className="mx-auto h-24 rounded-xl bg-brand-50" style={{ opacity: 1 - i * 0.15 }} />
              <div className="mt-2 text-xs font-medium text-ink-500">{stage}</div>
              <div className="text-sm font-semibold tabular-nums">0</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
