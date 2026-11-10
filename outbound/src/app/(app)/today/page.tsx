import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCalendarContext } from "@/lib/calendar/context";
import { todayIn } from "@/lib/calendar/dates";
import { loadToday } from "@/lib/data/today";
import { listUsers } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/page-header";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { FocusStrip, RepliesStrip, SignalsStrip, UrgentStrip } from "@/components/tasks/today-extras";
import { fromQuery } from "@/lib/tasks/view";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = sp.scope === "team" ? "team" : "mine";
  const db = await createSupabaseServerClient();
  const today = todayIn("Asia/Kolkata");
  const year = Number(today.slice(0, 4));
  const [ctx, users] = await Promise.all([loadCalendarContext(db, [year, year + 1]), listUsers(db)]);
  const data = await loadToday(db, { userId: user.id, scope, today, ctx });
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow={dateLabel} title={`${greeting()}, ${user.name.split(" ")[0]}`} subtitle={data.header.replies ? "Replies first, then your tasks." : "Here's what moves today."} />
        <div className="mb-6 flex gap-1 text-sm">
          {(["mine", "team"] as const).map((s) => (
            <Link key={s} href={s === "mine" ? "/today" : "/today?scope=team"} className={cn("rounded-full px-3 py-1.5 font-medium", scope === s ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-white")}>
              {s === "mine" ? "My tasks" : "Whole team"}
            </Link>
          ))}
        </div>
      </div>
      <RepliesStrip replies={data.replies} />
      <UrgentStrip urgent={data.urgent} today={today} />
      <SignalsStrip cards={data.signalCards} />
      <FocusStrip focus={data.focus} />
      <TasksWorkspace tasks={data.steps} users={users.filter((u) => u.active)} me={user.id} today={today} doneToday={data.header.doneToday} scope={scope} initial={fromQuery(sp)} />
    </>
  );
}
