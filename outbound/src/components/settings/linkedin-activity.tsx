import { Card } from "@/components/ui/card";

export type LinkedInEventRow = { id: string; kind: string; status: string; person_name: string | null; headline: string | null; detail: string | null; received_at: string; account_name: string | null };

const CHIP: Record<string, { label: string; cls: string }> = {
  applied: { label: "Applied", cls: "bg-emerald-50 text-emerald-700" },
  recorded: { label: "Reply card", cls: "bg-emerald-50 text-emerald-700" },
  ambiguous: { label: "Needs a look", cls: "bg-amber-50 text-amber-800" },
  unmatched: { label: "Not in a campaign", cls: "bg-canvas text-ink-500" },
};

/** What the mail scan did with each LinkedIn email, so nothing happens out of sight. */
export function LinkedInActivity({ rows }: { rows: LinkedInEventRow[] }) {
  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-lg font-semibold">LinkedIn activity</h2>
      <p className="mt-0.5 text-sm text-ink-500">What the mail scan did with accepted invites and messages. People who are not in a live campaign are listed and left alone.</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">Nothing yet. Accepted invites show here within 15 minutes of LinkedIn emailing you.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {rows.map((r) => {
            const chip = CHIP[r.status] ?? CHIP.unmatched;
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{r.person_name ?? "Unknown"} <span className="font-normal text-ink-500">{r.kind === "accepted" ? "accepted your invite" : "sent a message"}{r.account_name ? ` · ${r.account_name}` : ""}</span></p>
                  {r.detail ? <p className="text-xs text-ink-500">{r.detail}</p> : r.headline ? <p className="text-xs text-ink-400">{r.headline}</p> : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${chip.cls}`}>{chip.label}</span>
                  <span>{new Date(r.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
