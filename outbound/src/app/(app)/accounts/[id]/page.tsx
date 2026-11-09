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
import { ContactFinder } from "@/components/cockpit/contact-finder";
import { AccountTimeline } from "@/components/cockpit/account-timeline";
import { CampaignStatusBar } from "@/components/cockpit/campaign-status-bar";
import { projectTriggeredTracks } from "@/lib/campaigns/projection";
import { loadCalendarContext } from "@/lib/calendar/context";
import { DEFAULT_CAPS } from "@/lib/caps/schedule";
import { ReviewPanel } from "@/components/cockpit/review-panel";
import { ContactRows } from "@/components/cockpit/contact-rows";
import { ResponsePanel } from "@/components/cockpit/response-panel";
import type { ReviewFlag } from "@/lib/campaigns/launch";
import { buildAttackPlan, DEFAULT_ACTIVE_CAP, PERSON_COLORS } from "@/lib/campaigns/attack-plan";
import { AttackPlanCard } from "@/components/cockpit/attack-plan";
import { AccountTabs } from "@/components/cockpit/account-tabs";
import { ActivityFeed, type ActivityItem } from "@/components/cockpit/activity-feed";
import { fmtDate } from "@/lib/format";
import { playForAccount } from "@/lib/playbook/payload";
import { LevelChip, WhyThisPlan } from "@/components/cockpit/why-this-plan";

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
  // Where tracks waiting on a trigger will land, and any that can no longer start.
  const today = todayIn();
  const calCtx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const playResult = playForAccount(a as unknown as { signals: string | null; outreach_angle: string | null; archived: boolean | null; icp_verdict: string | null; do_not_contact: boolean | null }, today);
  const firstNames = new Map(contacts.map((c) => [c.id, firstName(c.full_name)]));
  const projections = projectTriggeredTracks(tracks, firstNames, calCtx);
  const fullNames = new Map(contacts.map((c) => [c.id, c.full_name]));
  // A positive reply on this campaign is the headline of the page.
  const pos = live ? inbox.responses.find((r) => r.state === "confirmed" && r.classification === "positive" && r.campaign_id === live.id) : null;
  const positive = pos ? {
    contactId: pos.contact_id, who: pos.contact_id ? (fullNames.get(pos.contact_id) ?? "A contact") : (pos.from_address ?? "Someone"),
    when: new Date(pos.received_at).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" }), summary: pos.summary,
  } : null;
  const others = tracks.filter((t) => !pos?.contact_id || t.contact_id !== pos.contact_id);
  const pausedTracks = others.filter((t) => t.status === "paused").map((t) => ({ name: firstName(fullNames.get(t.contact_id) ?? ""), reason: t.pause_reason ?? null }));
  const runningTracks = others.filter((t) => t.status === "active" || (t.status === "not_started" && t.start_trigger_type !== "fixed")).length;
  // Drafts are written in the background: show progress, or the last failure.
  const { data: lastCall } = await db.from("claude_calls").select("status, created_at, error").eq("account_id", a.id).eq("call_type", "generate_campaign").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const pending = lastCall && ["queued", "running"].includes(lastCall.status) ? lastCall : null;
  const lastError = lastCall && ["failed", "invalid"].includes(lastCall.status) && (!campaign || campaign.created_at < lastCall.created_at) ? (lastCall.error as string | null) : null;

  // The attack plan: waves from the real dates and triggers, the rest in nurture.
  const { data: settings } = await db.from("app_settings").select("caps").maybeSingle();
  const cap = Number((settings?.caps as Record<string, number> | null)?.active_contacts_per_account) || DEFAULT_ACTIVE_CAP;
  const plan = campaign && tracks.length ? buildAttackPlan({ tracks, contacts, projections, skipped: review.skipped ?? [], cap }) : null;
  const planOrder = plan ? plan.active.map((p) => p.trackId) : [];
  const orderedTracks = [...tracks].filter((t) => t.status !== "nurture").sort((x, y) => (planOrder.indexOf(x.id) + 1 || 999) - (planOrder.indexOf(y.id) + 1 || 999));
  const colorOf = Object.fromEntries(orderedTracks.map((t, i) => [t.contact_id, PERSON_COLORS[i % PERSON_COLORS.length]]));
  const groups = plan ? [
    ...plan.waves.map((w) => ({ key: `w${w.wave}`, label: w.label, hint: w.from ? `from ${fmtDate(w.from)}` : w.hint, contactIds: w.people.map((p) => p.contactId) })),
    { key: "nurture", label: "Nurture", hint: "held back, no touches", contactIds: plan.nurture.map((n) => n.contactId), collapsed: true },
    { key: "outside", label: "Not contacted", hint: "excluded or do not contact", contactIds: plan.outside.map((o) => o.contactId), collapsed: true },
  ] : undefined;

  // History for the Activity tab.
  const stepIds = tracks.flatMap((t) => t.steps.map((x) => x.id));
  const entityIds = [...(campaign ? [campaign.id] : []), ...tracks.map((t) => t.id), ...stepIds];
  const { data: logRows } = entityIds.length
    ? await db.from("activity_log").select("id, at, action, actor_id, entity_type, entity_id, before, after").in("entity_id", entityIds).order("at", { ascending: false }).limit(60)
    : { data: [] as Array<{ id: number; at: string; action: string; actor_id: string | null; entity_type: string; entity_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }> };
  const stepOf = new Map(tracks.flatMap((t) => t.steps.map((x) => [x.id, { contactId: t.contact_id, channel: x.channel }] as const)));
  const trackContact = new Map(tracks.map((t) => [t.id, t.contact_id]));
  const activity: ActivityItem[] = (logRows ?? []).map((r) => {
    const st = stepOf.get(r.entity_id);
    const cid = st?.contactId ?? trackContact.get(r.entity_id) ?? null;
    const after = (r.after ?? {}) as Record<string, unknown>;
    const before = (r.before ?? {}) as Record<string, unknown>;
    const detail = typeof after.reason === "string" ? after.reason
      : typeof after.skip_reason === "string" ? after.skip_reason
      : r.action === "pulled_forward" && before.due_date ? `Was due ${fmtDate(String(before.due_date))}`
      : r.action === "snoozed" && after.due_date ? `To ${fmtDate(String(after.due_date))}`
      : null;
    return { id: r.id, at: r.at, action: r.action, actor: users.find((u) => u.id === r.actor_id)?.name.split(" ")[0] ?? null, who: cid ? fullNames.get(cid) ?? null : null, channel: st?.channel ?? null, detail };
  });
  const pendingReplies = inbox.responses.filter((r) => r.state === "pending").length;

  // Data issues on this account's rows in the sheet.
  const keys = [a.sheet_account_id, ...contacts.map((c) => c.sheet_contact_key)].filter(Boolean) as string[];
  const { data: dq } = keys.length ? await db.from("data_quality_issues").select("id, issue_type, details, sheet_tab, sheet_row").in("sheet_key", keys).eq("status", "open").limit(30) : { data: [] as Array<{ id: string; issue_type: string; details: string | null; sheet_tab: string; sheet_row: number | null }> };
  const discovery = (campaign?.discovery_questions as string[] | undefined) ?? [];

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
              <span className="text-ink-300">·</span><LevelChip level={playResult.level} />
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
      </Card>

      {live ? <div className="mt-5"><CampaignStatusBar campaignId={live.id} status={live.status as string} canEdit={canEdit} positive={positive} paused={pausedTracks} running={runningTracks} /></div> : null}

      <div className="mt-5">
        <AccountTabs
          initial={reply ? "activity" : "plan"}
          tabs={[
            { id: "plan", label: "Plan" },
            { id: "contacts", label: "Contacts", badge: contacts.length },
            { id: "activity", label: "Activity", badge: pendingReplies || undefined, tone: "alert" },
            { id: "notes", label: "Notes" },
            { id: "details", label: "Details", badge: dq?.length || undefined },
          ]}
          panels={{
            plan: (
              <>
                <WhyThisPlan result={playResult} draftPlay={(campaign?.play as string | null) ?? null} />
                {pending ? <DraftPending startedAt={pending.created_at as string} regenerating={campaign?.status === "draft"} /> : null}
                {pending && campaign?.status !== "draft" ? null : !campaign || ["closed_no_response", "disqualified", "recycle"].includes(campaign.status) ? (
                  <GenerateCard accountId={a.id} canGenerate={canEdit && !a.archived} usableContacts={usable.length} lastError={lastError} level={playResult.level} pointsTo={playResult.pointsTo} />
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
                {plan ? (
                  <AttackPlanCard plan={plan} job={(campaign?.name as string) ?? null} objective={(campaign?.objective as string) ?? null} campaignId={campaign?.id ?? null}
                    campaignStatus={(campaign?.status as string) ?? null} canEdit={canEdit} colorOf={colorOf} today={today} />
                ) : null}
                {orderedTracks.length ? <AccountTimeline tracks={orderedTracks} names={fullNames} projections={projections} today={today} weeklyCap={DEFAULT_CAPS.touches_per_account_per_week} /> : null}
              </>
            ),
            contacts: (
              <>
                {canEdit && !a.archived ? <ContactFinder accountId={a.id} accountName={a.name} /> : null}
                <ContactRows today={todayIn()} contacts={contacts} tracks={tracks} users={users} campaignStatus={(campaign?.status as string) ?? null} canEdit={canEdit} projections={projections} groups={groups} />
              </>
            ),
            activity: (
              <>
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
                <ActivityFeed items={activity} />
              </>
            ),
            notes: (
              <Card className="p-5 md:p-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <Fact label="Why this plan">{campaign?.rationale as string}</Fact>
                  <Fact label="Outreach angle">{(campaign?.angle as string) ?? a.outreach_angle}</Fact>
                  <Fact label="Likely reply">{review.likely_reply ? `${review.likely_reply[0].toUpperCase()}${review.likely_reply.slice(1)}` : null}</Fact>
                  <Fact label="Main weakness">{review.main_weakness}</Fact>
                  <Fact label="Who to target (from the sheet)">{a.target_contact_notes}</Fact>
                  {discovery.length ? <Fact label="Questions for the first call"><ul className="list-disc pl-5">{discovery.map((d) => <li key={d}>{d}</li>)}</ul></Fact> : null}
                </div>
                {!campaign ? <p className="text-sm text-ink-400">Notes appear once a campaign is drafted.</p> : null}
              </Card>
            ),
            details: (
              <>
                <Card className="p-5 md:p-6">
                  <div className="grid gap-5 md:grid-cols-3">
                    <Fact label="Coupa evidence">{a.coupa_evidence}</Fact>
                    <Fact label="Trigger">{a.trigger}</Fact>
                    <Fact label="Signals">{a.signals}</Fact>
                    <Fact label="Revenue">{a.revenue}</Fact>
                    <Fact label="Employees">{a.employees}</Fact>
                    <Fact label="HQ">{a.hq}</Fact>
                    <Fact label="Ownership">{a.ownership}</Fact>
                    <Fact label="Segment">{a.segment}</Fact>
                    <Fact label="Disqualifier flags">{a.disqualifier_flags}</Fact>
                  </div>
                </Card>
                {dq?.length ? (
                  <Card className="p-5 md:p-6">
                    <h2 className="text-[15px] font-semibold">Data to fix in the sheet</h2>
                    <ul className="mt-3 divide-y divide-line text-sm">
                      {dq.map((d) => <li key={d.id} className="py-2"><b className="font-medium">{d.issue_type.replace(/_/g, " ")}</b> <span className="text-ink-500">· {d.sheet_tab}{d.sheet_row ? ` row ${d.sheet_row}` : ""}</span>{d.details ? <div className="text-ink-600">{d.details}</div> : null}</li>)}
                    </ul>
                  </Card>
                ) : null}
              </>
            ),
          }}
        />
      </div>
    </>
  );
}
