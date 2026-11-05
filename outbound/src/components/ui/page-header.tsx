export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</div> : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatTile({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "neutral" | "brand" | "warn" }) {
  const color = tone === "brand" ? "text-brand-600" : tone === "warn" ? "text-warning" : "text-ink-900";
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs font-medium text-ink-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-500">{icon}</div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>
    </div>
  );
}
