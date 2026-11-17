import { withUser } from "@/lib/api/handler";
import { inboxesForUser } from "@/lib/sending/usage";

/** Today's use for every inbox the signed-in person can send from. Powers the meter and the send flow. */
export async function GET() {
  return withUser(async ({ user, db }) => {
    const { inboxes, cfg, day } = await inboxesForUser(db, user.id!);
    return { inboxes, day, warnAt: cfg.warnAt, max: cfg.perAddressMax };
  });
}
