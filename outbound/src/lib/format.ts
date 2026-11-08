/** Display helpers shared by every screen. */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-10" -> "Tue 10 Nov" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

export const PERSONA_LABEL: Record<string, string> = {
  economic_buyer: "Economic buyer",
  procurement_leader: "Procurement leader",
  system_owner: "System owner",
  contract_manager: "Contract manager",
  legal: "Legal",
  finance_ap: "Finance or AP",
  champion: "Champion",
  other: "Other",
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  linkedin_connect: "LinkedIn connect",
  linkedin_message: "LinkedIn message",
  linkedin_inmail: "LinkedIn InMail",
  call: "Call",
  other: "Other",
};

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  responded: "Replied",
  meeting_booked: "Meeting booked",
  closed_no_response: "Closed, no response",
  disqualified: "Disqualified",
  recycle: "Recycle",
};

export const TRACK_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  active: "Active",
  paused: "Paused",
  replied: "Replied",
  meeting: "Meeting",
  completed: "Completed",
  stopped: "Stopped",
  nurture: "Nurture",
};

export function firstName(name: string | null | undefined): string {
  return (name ?? "").split(/\s+/)[0] ?? "";
}

export function initials(name: string | null | undefined): string {
  return (name ?? "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
