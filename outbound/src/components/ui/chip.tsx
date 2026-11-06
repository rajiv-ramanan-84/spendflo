import { cn } from "@/lib/cn";

export const ENGAGEMENT = {
  not_contacted: { label: "Not contacted", dot: "bg-eng-not-contacted" },
  contacted: { label: "Contacted", dot: "bg-eng-contacted" },
  connected: { label: "Connected", dot: "bg-eng-connected" },
  replied: { label: "Replied", dot: "bg-eng-replied" },
  meeting: { label: "Meeting", dot: "bg-eng-meeting" },
  stopped: { label: "Stopped", dot: "bg-eng-stopped" },
} as const;

export type EngagementStatus = keyof typeof ENGAGEMENT;

export function EngagementChip({ status }: { status: EngagementStatus }) {
  const s = ENGAGEMENT[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink-700">
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-700 border border-line",
      )}
    >
      {children}
    </span>
  );
}
