"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Shown while Claude writes a draft in the background. Refreshes until it lands. */
export function DraftPending({ startedAt, regenerating }: { startedAt: string; regenerating: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const refresh = setInterval(() => router.refresh(), 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);
  const mins = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60_000));

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <Loader2 size={18} className="mt-0.5 animate-spin text-brand-500" />
        <div>
          <h2 className="text-[15px] font-semibold">{regenerating ? "Claude is rewriting this draft" : "Claude is writing this campaign"}</h2>
          <p className="mt-1 text-sm text-ink-600">
            Started {mins === 0 ? "just now" : `${mins} minute${mins === 1 ? "" : "s"} ago`}. Drafts usually take 5 to 10 minutes. You can leave this page: it shows up here and in Today when it is ready.
          </p>
        </div>
      </div>
    </Card>
  );
}
