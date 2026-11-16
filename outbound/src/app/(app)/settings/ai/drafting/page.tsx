import { ClaudeSpend } from "@/components/settings/claude-spend";
import { NoAccess, PageFrame } from "@/components/settings/page-frame";
import { monthSpend } from "@/lib/claude/budget";
import { DEFAULT_BULK_MAX } from "@/lib/claude/models";
import { openSettings } from "@/lib/settings/open";

export default async function DraftingPage() {
  const { db, item, allowed, canAdmin } = await openSettings("drafting");
  if (!db || !allowed) return <NoAccess item={item} db={db} />;
  const [spend, auto] = await Promise.all([monthSpend(db), db.from("app_settings").select("auto_draft, default_model, tier_a_model, caps").maybeSingle()]);
  return (
    <PageFrame item={item} db={db} changed={{ entityType: "settings", actions: ["claude_spend_updated"] }}>
      <ClaudeSpend {...spend} autoDraft={((auto.data?.auto_draft as "off" | "a" | "ab" | undefined) ?? "off")} defaultModel={(auto.data?.default_model as string | undefined) ?? "claude-sonnet-5-5"} tierAModel={(auto.data?.tier_a_model as string | undefined) ?? "claude-opus-5-5"} bulkMax={Number((auto.data?.caps as Record<string, number> | null)?.bulk_generate_max) || DEFAULT_BULK_MAX} canEdit={canAdmin} />
    </PageFrame>
  );
}
