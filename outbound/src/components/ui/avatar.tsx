import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

const TONES = ["bg-brand-100 text-brand-700", "bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800"];

export function Avatar({ name, size = 24, index = 0, title }: { name: string; size?: number; index?: number; title?: string }) {
  return (
    <span
      title={title ?? name}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", TONES[index % TONES.length])}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}
