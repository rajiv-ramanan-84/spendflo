import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)]", className)} {...props} />;
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
