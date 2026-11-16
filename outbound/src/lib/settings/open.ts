import "server-only";
import { canAssignAccounts, canEditAdminSettings, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canSee, navById } from "./nav";

/** The start of every settings page: who is here, may they open it, and may they change it. */
export async function openSettings(id: string) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const item = navById(id)!;
  return { user, db, item, allowed: canSee(user.role, item.min), canAdmin: canEditAdminSettings(user), canManage: canAssignAccounts(user) };
}
