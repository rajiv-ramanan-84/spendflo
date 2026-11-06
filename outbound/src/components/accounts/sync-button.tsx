"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Counts = { accountsActive?: number; accountsArchived?: number; accountsNew?: number; contactsImported?: number; contactsNew?: number; dqOpen?: number; autoDraftQueued?: number };

/** Pulls the sheet now instead of waiting for the hourly sync. Admins and the manager. */
export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/sync", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fatal?: string | string[] | null; counts?: Counts };
    setBusy(false);
    if (!res.ok || data.ok === false || !data.counts) return setMsg({ ok: false, text: data.error ?? (Array.isArray(data.fatal) ? data.fatal.join(" ") : data.fatal) ?? "The sync did not finish. Try again in a minute." });
    const c = data.counts;
    const parts = [
      `${c.accountsActive ?? 0} active accounts`,
      `${c.contactsImported ?? 0} contacts`,
      c.accountsNew ? `${c.accountsNew} new` : null,
      c.autoDraftQueued ? `${c.autoDraftQueued} queued for drafts` : null,
      c.dqOpen ? `${c.dqOpen} rows to check (Settings > Data)` : null,
    ].filter(Boolean);
    setMsg({ ok: true, text: `Synced: ${parts.join(", ")}.` });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" onClick={run} disabled={busy}>
        <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Syncing the sheet..." : "Sync now"}
      </Button>
      {msg ? <span className={`max-w-sm text-right text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span> : null}
    </div>
  );
}
