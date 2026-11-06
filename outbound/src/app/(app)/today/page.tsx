import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCalendarContext } from "@/lib/calendar/context";
import { todayIn } from "@/lib/calendar/dates";
import { loadToday } from "@/lib/data/today";
import { listUsers } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/page-header";
import { TodayBoard } from "@/components/today/today-board";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUser();
  const { scope: rawScope } = await searchParams;
  const scope = rawScope === "team" ? "team" : "mine";
  const db = await createSupabaseServerClient();
  const today = todayIn(user.role ? "Asia/Kolkata" : "Asia/Kolkata");
  const year = Number(today.slice(0, 4));
  const [ctx, users] = await Promise.all([loadCalendarContext(db, [year, year + 1]), listUsers(db)]);
  const data = await loadToday(db, { userId: user.id, scope, today, ctx });
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <>
      <PageHeader eyebrow={dateLabel} title={`${greeting()}, ${user.name.split(" ")[0]}`} subtitle={data.header.replies ? "Replies first, then your day." : "Here's what moves today."} />
      <TodayBoard data={data} me={user.id} users={users.filter((u) => u.active)} scope={scope} today={today} />
    </>
  );
}
