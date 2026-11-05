import { Inbox, Target, ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/chip";

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const user = await requireUser();
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);

  return (
    <>
      <PageHeader eyebrow={dateLabel} title={`${greeting(now)}, ${user.name.split(" ")[0]}`} subtitle="Here's what moves today." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Due today" value={0} />
        <StatTile label="Done today" value={0} tone="brand" />
        <StatTile label="Overdue" value={0} />
        <StatTile label="Replies waiting" value={0} />
      </div>

      <div className="mt-6 grid gap-5">
        <Card>
          <CardHeader title="Replies waiting" hint="Always on top, so a response never sits." />
          <EmptyState icon={<Inbox size={20} />} title="No replies waiting" body="When a prospect replies, a confirm card shows up here within 15 minutes." />
        </Card>

        <Card>
          <CardHeader title="Focus Today" hint="Your top 10 accounts, ranked, with the reason for each." />
          <EmptyState icon={<Target size={20} />} title="No accounts yet" body="Ask Mouli to assign your slice. Once the sheet is synced, your ranked list lands here." />
        </Card>

        <Card>
          <CardHeader
            title="Steps"
            action={
              <div className="hidden gap-2 sm:flex">
                <Chip>LinkedIn 0</Chip>
                <Chip>Email 0</Chip>
                <Chip>Call 0</Chip>
              </div>
            }
          />
          <div className="flex gap-2 px-5 pt-4 text-sm">
            {["Overdue", "Today", "Tomorrow", "This week"].map((b, i) => (
              <span key={b} className={i === 1 ? "rounded-full bg-ink-900 px-3 py-1 font-medium text-white" : "rounded-full px-3 py-1 text-ink-500"}>
                {b}
              </span>
            ))}
          </div>
          <EmptyState icon={<ListChecks size={20} />} title="Nothing due yet" body="Launched campaigns put every step here on its working day, one click to act." />
        </Card>
      </div>
    </>
  );
}
