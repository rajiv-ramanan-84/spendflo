import type { SessionUser } from "@/lib/auth/session";

export function UserMenu({ user }: { user: SessionUser }) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="text-sm font-medium leading-tight">{user.name}</div>
        <div className="text-xs text-ink-400">{user.email}</div>
      </div>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-line" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials}</span>
      )}
      <form action="/auth/signout" method="post">
        <button className="rounded-lg px-2 py-1 text-xs font-medium text-ink-500 hover:bg-canvas hover:text-ink-900">Sign out</button>
      </form>
    </div>
  );
}
