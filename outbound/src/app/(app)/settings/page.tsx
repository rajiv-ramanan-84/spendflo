import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const SECTIONS = [
  { title: "Users", body: "Add or deactivate teammates, set roles and out-of-office.", milestone: 2 },
  { title: "Calendars and holidays", body: "US federal, India team holidays, quiet periods.", milestone: 3 },
  { title: "Data", body: "Sheet connection, last sync and the data quality queue.", milestone: 4 },
  { title: "Claude", body: "Skill text, model, approved proof points and monthly spend.", milestone: 5 },
  { title: "Caps and priority", body: "Touch caps, daily load and Focus Today weights.", milestone: 7 },
  { title: "Slack", body: "#outbound-command posts and @mention mapping.", milestone: 9 },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Admins run the setup. Mouli sees the Data tab." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{s.title}</h2>
              <span className="text-xs text-ink-400">Milestone {s.milestone}</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-500">{s.body}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
