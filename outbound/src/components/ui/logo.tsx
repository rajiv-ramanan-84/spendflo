export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="grid place-items-center rounded-lg bg-brand-500 font-bold text-white shadow-sm"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        aria-hidden
      >
        S
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink-900">
        <span className="sm:hidden">Outbound</span>
        <span className="hidden sm:inline">Outbound Command Center</span>
      </span>
    </span>
  );
}
