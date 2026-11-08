import { CHANNEL_LABEL, fmtDate } from "@/lib/format";

export type ActivityItem = { id: number; at: string; action: string; actor: string | null; who: string | null; channel: string | null; detail: string | null };

const VERB: Record<string, string> = {
  done: "marked done",
  skipped: "skipped",
  snoozed: "snoozed",
  pulled_forward: "pulled forward to today",
  gmail_draft_created: "created the Gmail draft",
  launched: "launched the campaign",
  launched_with_open_flags: "launched with open flags",
  paused_all: "paused the tracks",
  resumed: "resumed the tracks",
  moved_to_nurture: "moved to nurture",
  made_active: "made active",
  pinned_to_dates: "set fixed dates",
  meeting_booked: "marked the meeting booked",
};

/** What happened on this account, newest first: sends, moves, pauses and plan changes. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white shadow-[var(--shadow-soft)]">
      <div className="px-5 pb-2 pt-5">
        <h2 className="text-[15px] font-semibold">History</h2>
        <p className="text-sm text-ink-500">Everything done on this account, by whom and when.</p>
      </div>
      {items.length ? (
        <ol className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex gap-4 px-5 py-2.5 text-sm">
              <span className="w-24 shrink-0 tabular-nums text-ink-400">{fmtDate(i.at.slice(0, 10))}</span>
              <span className="min-w-0 text-ink-700">
                <b className="font-medium text-ink-900">{i.actor ?? "The app"}</b> {VERB[i.action] ?? i.action.replace(/_/g, " ")}
                {i.who ? <> · {i.who}</> : null}
                {i.channel ? <span className="text-ink-500"> · {CHANNEL_LABEL[i.channel] ?? i.channel}</span> : null}
                {i.detail ? <span className="block text-xs text-ink-500">{i.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="px-5 pb-5 text-sm text-ink-400">Nothing yet. Sends, skips and plan changes show up here.</p>}
    </section>
  );
}
