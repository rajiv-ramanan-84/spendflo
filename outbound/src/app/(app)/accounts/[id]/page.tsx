import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountResponses, getCockpit } from "@/lib/data/queries";
import { todayIn } from "@/lib/calendar/dates";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { CAMPAIGN_STATUS_LABEL, firstName } from "@/lib/format";
import { GenerateCard } from "@/components/cockpit/generate-card";
import { DraftPending } from "@/components/cockpit/draft-pending";
import { ReviewPanel } from "@/components/cockpit/review-panel";
import { ContactRows } from "@/components/cockpit/contact-rows";
import { ResponsePanel } from "@/components/cockpit/response-panel";
import type { ReviewFlag } from "@/lib/campaigns/launch";

export const dynamic = "force-dynamic";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-sm leading-relaxed text-ink-700">{children}</div>
    </div>
  );
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reply?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { reply } = await searchParams;
  const db = await createSupabaseServerClient();
  const data = await getCockpit(db, id).catch(() => null);
  if (!data) notFound();
  const { account, contacts, campaign, tracks, users } = data;
  const a = account as Record<string, string | null> & { id: string; name: string; owner_id: string | null; archived: boolean | null };
  const owner = users.find((u) => u.id === a.owner_id);
  const canEdit = user.role !== "member" || user.id === a.owner_id;

  const engaged = contacts.filter((c) => ["replied", "meeting"].includes(c.engagement_status)).length;
  const usable = contacts.filter((c) => !c.exclude && !c.do_not_contact && !c.sheet_deleted_at);
  const review = (campaign?.review ?? {}) as { flags?: ReviewFlag[]; notes?: Array<{ text: string }>; likely_reply?: string; main_weakness?: string; skipped?: Array<{ contactRef: string; reason: string }> };
  const cleared = (campaign?.review_flags_cleared as string[] | undefined) ?? [];
  const datedSteps = tracks.flatMap((t) => t.steps).filter((s) => s.due_date).length;
  const live = campaign && !["draft", "closed_no_response", "disqualified", "recycle"].includes(campaign.status) ? campaign : null;
  const inbox = await getAccountResponses(db, a.id, live?.id ?? null);
  // Drafts are written in the background: show progress, or the last failure.
  const { data: lastCall } = await db.from("claude_calls").select("status, created_at, error").eq("account_id", a.id).eq("call_type", "generate_campaign").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const pending = lastCall && ["queued", "running"].includes(lastCall.status) ? lastCall : null;
  const lastError = lastCall && ["failed", "invalid"].includes(lastCall.status) && (!campaign || campaign.created_at < lastCall.created_at) ? (lastCall.error as string | null) : null;

  return (
    <>
      <Link href="/accounts" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Accounts
      </Link>

      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
              <span>Tier {a.tier ?? "–"}</span><span className="text-ink-300">·</span><span>{a.icp_verdict?.replace("_", "-").toUpperCase()}</span>
              <span className="text-ink-300">·</span><span className="text-ink-400">{a.sheet_account_id}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.name}</h1>
            <div className="mt-1 text-sm text-ink-500">{[a.domain, a.hq, a.revenue, a.ownership].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-right">
              <div className="text-xs text-ink-400">Owner</div>
              <div className="mt-1 inline-flex items-center gap-2 font-medium">
                {owner ? <><Avatar name={owner.name} index={users.indexOf(owner)} size={22} />{firstName(owner.name)}</> : "Unassigned"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-400">Engaged</div>
              <div className="mt-1 font-semibold tabular-nums">{engaged} of {usable.length}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-400">Campaign</div>
              <div className="mt-1 font-semibold">{campaign ? CAMPAIGN_STATUS_LABEL[campaign.status as string] : "Not started"}</div>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-3">
          <Fact label="Coupa evidence">{a.coupa_evidence}</Fact>
          <Fact label="Trigger">{a.trigger}</Fact>
          <Fact label="Outreach angle">{(campaign?.angle as string) ?? a.outreach_angle}</Fact>
        </div>
      </Card>

      <div className="mt-5 grid gap-5">
        {pending ? <DraftPending startedAt={pending.created_at as string} regenerating={campaign?.status === "draft"} /> : null}
        {pending && campaign?.status !== "draft" ? null : !campaign || ["closed_no_response", "disqualified", "recycle"].includes(campaign.status) ? (
          <GenerateCard accountId={a.id} canGenerate={canEdit && !a.archived} usableContacts={usable.length} lastError={lastError} />
        ) : campaign.status === "draft" ? (
          <ReviewPanel
            campaignId={campaign.id}
            name={campaign.name as string}
            objective={campaign.objective as string}
            rationale={campaign.rationale as string}
            likelyReply={review.likely_reply ?? null}
            mainWeakness={review.main_weakness ?? null}
            flags={review.flags ?? []}
            cleared={cleared}
            notes={review.notes ?? []}
            skipped={review.skipped ?? []}
            datedSteps={datedSteps}
            canEdit={canEdit}
            accountId={a.id}
          />
        ) : null}

        {(live || inbox.responses.some((r) => r.state === "pending")) && (
          <ResponsePanel
            responses={inbox.responses}
            replan={inbox.replan}
            contacts={usable.map((c) => ({ id: c.id, full_name: c.full_name, title: c.title }))}
            campaignId={live?.id ?? null}
            campaignStatus={(live?.status as string) ?? null}
            focusId={reply ?? null}
            canEdit={canEdit}
          />
        )}

        <ContactRows
          today={todayIn()}
          contacts={contacts}
          tracks={tracks}
          users={users}
          campaignStatus={(campaign?.status as string) ?? null}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
