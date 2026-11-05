import { withUser } from "@/lib/api/handler";
import { sendTestPost } from "@/lib/slack/settings";

export async function POST() {
  return withUser(({ user, db }) => sendTestPost(db, user));
}
