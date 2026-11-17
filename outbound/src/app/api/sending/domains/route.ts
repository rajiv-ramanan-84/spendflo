import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { refreshDomains } from "@/lib/sending/health";

export const maxDuration = 60;

/** Re-checks SPF, DKIM and DMARC for every sending domain now. */
export async function POST() {
  return withUser(async ({ user, db }) => {
    if (user.role === "member") throw new ActionError("Only admins and managers can re-check domains", 403);
    return refreshDomains(db);
  });
}
