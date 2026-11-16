/**
 * The "Get set up" list in Settings. Pure definitions and the rule for what is still open.
 * Some items finish on their own when the app can see the thing is done; the rest are ticked by hand.
 */

export type ChecklistItem = {
  key: string;
  title: string;
  why: string;
  steps: string[];
  /** Where to do it, if there is a page for it */
  link?: { label: string; href: string };
  audience: "all" | "admin" | "founder";
  /** Hand-ticked items that come back each month */
  monthly?: boolean;
};

export const ITEMS: ChecklistItem[] = [
  {
    key: "gmail",
    title: "Link your Gmail",
    why: "Lets the app save drafts in your Gmail, see when you sent them, and spot replies and bounces.",
    steps: ["Sign out and back in with your Spendflo Google account.", "Tick every Gmail permission when Google asks."],
    audience: "all",
  },
  {
    key: "linkedin_emails",
    title: "Turn on LinkedIn emails for accepted invites and messages",
    why: "When someone accepts your invite or writes back, LinkedIn emails you. The app reads only those emails, marks the connect done, brings your LinkedIn message forward and prepares a re-plan if a reply needs one.",
    steps: [
      "On LinkedIn open Settings, then Notifications, then Email notifications.",
      "Under Messaging, turn on \"Messages\" and \"InMail\". Under Connections, turn on \"Invitation accepted\".",
      "Set the frequency to \"Individual emails\", not a digest.",
      "Send yourself nothing else: this ticks itself when the first one is seen.",
    ],
    link: { label: "Open LinkedIn email settings", href: "https://www.linkedin.com/mypreferences/d/categories/notifications" },
    audience: "all",
  },
  {
    key: "slack",
    title: "Add your Slack member ID",
    why: "So the morning plan and reply alerts mention you.",
    steps: ["In Slack, open your profile, click the three dots, then Copy member ID.", "Ask an admin to paste it next to your name under Settings, Data and channels, Slack."],
    link: { label: "Open Slack settings", href: "/settings/data/slack" },
    audience: "all",
  },
  {
    key: "signature",
    title: "Check your signature and writing rules",
    why: "Every email and LinkedIn message is finished with your name. A wrong signature is the fastest way to lose a reply.",
    steps: ["Open Writing rules and pick your name under By sender.", "Check the signature and the voice notes, then save."],
    link: { label: "Open Writing rules", href: "/settings/writing/rules?tab=sender" },
    audience: "all",
  },
  {
    key: "founder_outreach",
    title: "Review the founder outreach hypotheses",
    why: "Emails signed by Sid or Rajiv ask for 20 minutes to validate a use case. The hypotheses must be ones you would say out loud.",
    steps: ["Open Founder outreach.", "Read each play and persona. Edit anything you would not say, then save."],
    link: { label: "Open Founder outreach", href: "/settings/writing/rules?tab=founder" },
    audience: "founder",
  },
  {
    key: "backup",
    title: "Download this month's backup",
    why: "The free database plan keeps no backups. Save the file to Google Drive on the first working day of the month.",
    steps: ["Open Backup and use the Download backup button.", "Move the file into the team Drive folder."],
    link: { label: "Open Backup", href: "/settings/data/backup" },
    audience: "admin",
    monthly: true,
  },
];

export type Facts = {
  gmailOk: boolean;
  linkedinSeen: boolean;
  slackSet: boolean;
  signatureSet: boolean;
  isFounder: boolean;
  isAdmin: boolean;
};

/** Done without being ticked: the app can see it. */
export function autoDone(key: string, f: Facts): boolean {
  switch (key) {
    case "gmail": return f.gmailOk;
    case "linkedin_emails": return f.linkedinSeen;
    case "slack": return f.slackSet;
    case "signature": return f.signatureSet;
    default: return false;
  }
}

/** What this person still has to do. `ticked` maps item key to the date it was ticked. */
export function openItems(f: Facts, ticked: Record<string, string>, now: Date = new Date()): ChecklistItem[] {
  return ITEMS.filter((it) => {
    if (it.audience === "admin" && !f.isAdmin) return false;
    if (it.audience === "founder" && !f.isFounder) return false;
    if (autoDone(it.key, f)) return false;
    const at = ticked[it.key];
    if (!at) return true;
    if (!it.monthly) return false;
    const d = new Date(at);
    return d.getUTCFullYear() !== now.getUTCFullYear() || d.getUTCMonth() !== now.getUTCMonth();
  });
}
