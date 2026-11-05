import { addDays, type IsoDate } from "@/lib/calendar/dates";

/**
 * Command Center numbers (PRD section 8). Pure: one snapshot in, every
 * number and the list behind it out, so the page and the tests agree.
 *
 * Penetration = assigned accounts with at least one persona at Replied or
 * Meeting. One definition, used everywhere.
 */

export type MAccount = { id: string; name: string; tier: string | null; segment: string | null; owner_id: string | null; archived: boolean };
export type MContact = { id: string; account_id: string; engagement_status: string };
export type MCampaign = { id: string; account_id: string; owner_id: string; status: string; updated_at: string };
export type MTrack = { id: string; status: string };
export type MStep = { id: string; campaign_id: string; track_id: string; contact_id: string; assignee_id: string | null; channel: string; status: string; due_date: string | null; completed_at: string | null; completed_by: string | null };
export type MResponse = { id: string; account_id: string | null; campaign_id: string | null; contact_id: string | null; channel: string; classification: string | null; state: string; received_at: string; confirmed_at: string | null };
export type MVersion = { campaign_id: string; reason: string; created_at: string };
export type MUser = { id: string; name: string };

export type Snapshot = { accounts: MAccount[]; contacts: MContact[]; campaigns: MCampaign[]; tracks: MTrack[]; steps: MStep[]; responses: MResponse[]; versions: MVersion[]; users: MUser[] };
export type Filters = { ownerId?: string | null; tier?: string | null; segment?: string | null; from: IsoDate; today: IsoDate; now: Date };

const LIVE = new Set(["active", "responded", "meeting_booked"]);
const OPEN = new Set(["upcoming", "due", "overdue"]);
const ENGAGED = new Set(["replied", "meeting"]);
const CONNECTED_OR_BEYOND = new Set(["connected", "replied", "meeting"]);
const NOT_A_REPLY = new Set(["auto_reply", "bounce"]);

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export type Drill = { kind: "accounts" | "campaigns" | "steps"; ids: string[] };

export type OwnerRow = {
  userId: string;
  name: string;
  accounts: number;
  live: number;
  dueToday: number;
  overdue: number;
  doneInRange: number;
  replies: number;
  meetings: number;
  penetration: number;
  onTime: number | null;
  replanHours: number | null;
};

export type MotionRow = {
  campaignId: string;
  accountId: string;
  accountName: string;
  tier: string | null;
  ownerId: string;
  status: string;
  day: number;
  span: number;
  lastTouch: string | null;
  nextStep: string | null;
  overdue: number;
  repliesWaiting: number;
  attention: number;
  stalledReason: string | null;
};

export function computeMetrics(s: Snapshot, f: Filters) {
  const inScope = (a: MAccount) => !a.archived && (!f.ownerId || a.owner_id === f.ownerId) && (!f.tier || a.tier === f.tier) && (!f.segment || a.segment === f.segment);
  const accounts = s.accounts.filter(inScope);
  const accountIds = new Set(accounts.map((a) => a.id));
  const accountById = new Map(s.accounts.map((a) => [a.id, a]));
  const assigned = accounts.filter((a) => a.owner_id);
  const assignedIds = new Set(assigned.map((a) => a.id));

  const campaigns = s.campaigns.filter((c) => accountIds.has(c.account_id));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const live = campaigns.filter((c) => LIVE.has(c.status));
  const trackStatus = new Map(s.tracks.map((t) => [t.id, t.status]));
  const steps = s.steps.filter((x) => campaignById.has(x.campaign_id));
  const accountOfStep = (x: MStep) => campaignById.get(x.campaign_id)!.account_id;
  const contacts = s.contacts.filter((c) => assignedIds.has(c.account_id));
  const inRange = (iso: string | null) => !!iso && day(iso)! >= f.from && day(iso)! <= f.today;
  const replies = s.responses.filter((r) => r.account_id && accountIds.has(r.account_id) && r.state !== "dismissed" && !NOT_A_REPLY.has(r.classification ?? "") && inRange(r.received_at));

  // A step counts as due today only where the Today screen would show it: live campaign, active track.
  const onToday = (x: MStep) => LIVE.has(campaignById.get(x.campaign_id)!.status) && trackStatus.get(x.track_id) === "active";
  const dueToday = steps.filter((x) => OPEN.has(x.status) && x.due_date === f.today && onToday(x));
  const overdue = steps.filter((x) => OPEN.has(x.status) && !!x.due_date && x.due_date < f.today && onToday(x));
  const doneInRange = steps.filter((x) => x.status === "done" && inRange(x.completed_at));
  const dueInRange = steps.filter((x) => x.due_date && x.due_date >= f.from && x.due_date <= f.today && x.status !== "superseded" && x.status !== "skipped");
  const onTimeDone = dueInRange.filter((x) => x.status === "done" && day(x.completed_at)! <= x.due_date!);

  // Funnel, by account. Each stage includes the ones after it.
  const touched = new Set(steps.filter((x) => x.status === "done").map(accountOfStep).filter((id) => assignedIds.has(id)));
  const byAccount = (pred: (status: string) => boolean) => new Set(contacts.filter((c) => pred(c.engagement_status)).map((c) => c.account_id));
  const meetingCampaignAccounts = new Set(campaigns.filter((c) => c.status === "meeting_booked").map((c) => c.account_id));
  const meeting = new Set([...byAccount((x) => x === "meeting"), ...[...meetingCampaignAccounts].filter((id) => assignedIds.has(id))]);
  const engaged = new Set([...byAccount((x) => ENGAGED.has(x)), ...meeting]);
  const connected = new Set([...byAccount((x) => CONNECTED_OR_BEYOND.has(x)), ...engaged]);
  for (const id of connected) touched.add(id);

  const engagedPerAccount = new Map<string, number>();
  for (const c of contacts) if (ENGAGED.has(c.engagement_status)) engagedPerAccount.set(c.account_id, (engagedPerAccount.get(c.account_id) ?? 0) + 1);
  const multiThreaded = [...engagedPerAccount.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  const meetingsInRange = campaigns.filter((c) => c.status === "meeting_booked" && inRange(c.updated_at));
  const coverage = assigned.filter((a) => live.some((c) => c.account_id === a.id));

  const kpis = {
    assigned: assigned.length,
    live: live.length,
    coverage: pct(coverage.length, assigned.length),
    penetration: pct(engaged.size, assigned.length),
    replies: replies.length,
    meetings: meetingsInRange.length,
    dueToday: dueToday.length,
    onTime: pct(onTimeDone.length, dueInRange.length),
    multiThreaded: multiThreaded.length,
  };

  const funnel = [
    { key: "assigned", label: "Assigned", value: assigned.length, ids: assigned.map((a) => a.id) },
    { key: "touched", label: "Touched", value: touched.size, ids: [...touched] },
    { key: "connected", label: "Connected", value: connected.size, ids: [...connected] },
    { key: "engaged", label: "Engaged", value: engaged.size, ids: [...engaged] },
    { key: "meeting", label: "Meeting", value: meeting.size, ids: [...meeting] },
  ];

  // Reply rate by channel: personas who replied on a channel / personas contacted on it.
  const contactedOn = new Map<string, Set<string>>();
  for (const x of steps) if (x.status === "done") {
    const ch = x.channel.startsWith("linkedin") ? "linkedin" : x.channel;
    if (!contactedOn.has(ch)) contactedOn.set(ch, new Set());
    contactedOn.get(ch)!.add(x.contact_id);
  }
  const repliedOn = new Map<string, Set<string>>();
  for (const r of s.responses) if (r.contact_id && r.account_id && accountIds.has(r.account_id) && r.state !== "dismissed" && !NOT_A_REPLY.has(r.classification ?? "")) {
    const ch = r.channel.startsWith("linkedin") ? "linkedin" : r.channel;
    if (!repliedOn.has(ch)) repliedOn.set(ch, new Set());
    repliedOn.get(ch)!.add(r.contact_id);
  }
  const replyRate = (["email", "linkedin", "call"] as const).map((ch) => {
    const contacted = contactedOn.get(ch)?.size ?? 0;
    const repliedN = [...(repliedOn.get(ch) ?? [])].filter((id) => contactedOn.get(ch)?.has(id)).length;
    return { channel: ch, contacted, replied: repliedN, rate: pct(repliedN, contacted) };
  });

  // Reply-to-replan: confirmed reply to the next version applied for that campaign.
  const replanHours = (ownerId: string) => {
    const hrs: number[] = [];
    for (const r of s.responses) {
      if (!r.campaign_id || !r.confirmed_at || r.state !== "confirmed" || !inRange(r.received_at)) continue;
      const c = campaignById.get(r.campaign_id);
      if (!c || c.owner_id !== ownerId) continue;
      const v = s.versions.filter((x) => x.campaign_id === r.campaign_id && x.reason === "response" && x.created_at >= r.received_at).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (v) hrs.push((Date.parse(v.created_at) - Date.parse(r.received_at)) / 36e5);
    }
    return hrs.length ? Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 10) / 10 : null;
  };

  const owners: OwnerRow[] = s.users
    .filter((u) => !f.ownerId || u.id === f.ownerId)
    .map((u) => {
      const mine = assigned.filter((a) => a.owner_id === u.id);
      const mineIds = new Set(mine.map((a) => a.id));
      const myDue = dueInRange.filter((x) => x.assignee_id === u.id);
      return {
        userId: u.id,
        name: u.name,
        accounts: mine.length,
        live: live.filter((c) => c.owner_id === u.id).length,
        dueToday: dueToday.filter((x) => x.assignee_id === u.id).length,
        overdue: overdue.filter((x) => x.assignee_id === u.id).length,
        doneInRange: doneInRange.filter((x) => (x.completed_by ?? x.assignee_id) === u.id).length,
        replies: replies.filter((r) => mineIds.has(r.account_id!)).length,
        meetings: meetingsInRange.filter((c) => c.owner_id === u.id).length,
        penetration: pct([...engaged].filter((id) => mineIds.has(id)).length, mine.length),
        onTime: myDue.length ? pct(myDue.filter((x) => x.status === "done" && day(x.completed_at)! <= x.due_date!).length, myDue.length) : null,
        replanHours: replanHours(u.id),
      };
    });

  // Campaigns in motion, sorted by needs attention.
  const stallBefore = addDays(f.today, -2);
  const dayMs = 864e5;
  const motion: MotionRow[] = live.map((c) => {
    const cs = steps.filter((x) => x.campaign_id === c.id && x.status !== "superseded");
    const dates = cs.map((x) => x.due_date).filter(Boolean).sort() as string[];
    const first = dates[0] ?? f.today;
    const last = dates[dates.length - 1] ?? f.today;
    const span = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / dayMs) + 1);
    const dayN = Math.min(span, Math.max(1, Math.round((Date.parse(f.today) - Date.parse(first)) / dayMs) + 1));
    const done = cs.filter((x) => x.status === "done" && x.completed_at).map((x) => x.completed_at!).sort();
    const open = cs.filter((x) => OPEN.has(x.status) && x.due_date).map((x) => x.due_date!).sort();
    const od = cs.filter((x) => OPEN.has(x.status) && x.due_date && x.due_date < f.today);
    const waiting = s.responses.filter((r) => r.campaign_id === c.id && (r.state === "pending" || (r.state === "confirmed" && c.status === "responded")));
    const oldestOverdue = od.map((x) => x.due_date!).sort()[0] ?? null;
    const lateReply = waiting.find((r) => f.now.getTime() - Date.parse(r.confirmed_at ?? r.received_at) > dayMs);
    const stalledReason = lateReply
      ? "Reply not re-planned in 24 hours"
      : oldestOverdue && oldestOverdue < stallBefore
        ? `Overdue since ${oldestOverdue}`
        : null;
    const a = accountById.get(c.account_id)!;
    return {
      campaignId: c.id, accountId: c.account_id, accountName: a.name, tier: a.tier, ownerId: c.owner_id, status: c.status,
      day: dayN, span, lastTouch: done.length ? day(done[done.length - 1]) : null, nextStep: open[0] ?? null,
      overdue: od.length, repliesWaiting: waiting.length,
      attention: waiting.length * 100 + (stalledReason ? 50 : 0) + od.length * 10 + (a.tier === "A" ? 3 : a.tier === "B" ? 2 : 1),
      stalledReason,
    };
  }).sort((x, y) => y.attention - x.attention || x.accountName.localeCompare(y.accountName));

  const drill: Record<string, Drill> = {
    assigned: { kind: "accounts", ids: assigned.map((a) => a.id) },
    live: { kind: "campaigns", ids: live.map((c) => c.id) },
    penetration: { kind: "accounts", ids: [...engaged] },
    replies: { kind: "accounts", ids: [...new Set(replies.map((r) => r.account_id!))] },
    meetings: { kind: "campaigns", ids: meetingsInRange.map((c) => c.id) },
    dueToday: { kind: "steps", ids: dueToday.map((x) => x.id) },
    onTime: { kind: "steps", ids: dueInRange.filter((x) => !(x.status === "done" && day(x.completed_at)! <= x.due_date!)).map((x) => x.id) },
    multiThreaded: { kind: "accounts", ids: multiThreaded },
    coverage: { kind: "accounts", ids: coverage.map((a) => a.id) },
    stalled: { kind: "campaigns", ids: motion.filter((m) => m.stalledReason).map((m) => m.campaignId) },
  };
  for (const st of funnel) drill[`funnel:${st.key}`] = { kind: "accounts", ids: st.ids };
  for (const o of owners) {
    const mine = assigned.filter((a) => a.owner_id === o.userId).map((a) => a.id);
    drill[`owner:${o.userId}:accounts`] = { kind: "accounts", ids: mine };
    drill[`owner:${o.userId}:live`] = { kind: "campaigns", ids: live.filter((c) => c.owner_id === o.userId).map((c) => c.id) };
    drill[`owner:${o.userId}:dueToday`] = { kind: "steps", ids: dueToday.filter((x) => x.assignee_id === o.userId).map((x) => x.id) };
    drill[`owner:${o.userId}:overdue`] = { kind: "steps", ids: overdue.filter((x) => x.assignee_id === o.userId).map((x) => x.id) };
    drill[`owner:${o.userId}:doneInRange`] = { kind: "steps", ids: doneInRange.filter((x) => (x.completed_by ?? x.assignee_id) === o.userId).map((x) => x.id) };
    drill[`owner:${o.userId}:replies`] = { kind: "accounts", ids: [...new Set(replies.filter((r) => mine.includes(r.account_id!)).map((r) => r.account_id!))] };
    drill[`owner:${o.userId}:meetings`] = { kind: "campaigns", ids: meetingsInRange.filter((c) => c.owner_id === o.userId).map((c) => c.id) };
    drill[`owner:${o.userId}:penetration`] = { kind: "accounts", ids: [...engaged].filter((id) => mine.includes(id)) };
  }

  return { kpis, funnel, replyRate, owners, motion, stalled: motion.filter((m) => m.stalledReason), drill };
}

export type Metrics = ReturnType<typeof computeMetrics>;
