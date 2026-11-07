import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canAssignAccounts, canEditAdminSettings, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSlackSettings } from "@/lib/slack/settings";
import { SlackSettings } from "@/components/settings/slack-settings";
import { loadSkillSettings } from "@/lib/claude/skill-settings";
import { SkillSettings } from "@/components/settings/skill-settings";
import { loadDataSettings } from "@/lib/data/data-quality";
import { DataSettings } from "@/components/settings/data-settings";
import { monthSpend } from "@/lib/claude/budget";
import { ClaudeSpend } from "@/components/settings/claude-spend";
import { loadMailboxSettings } from "@/lib/google/mailbox-settings";
import { MailboxSettings } from "@/components/settings/mailbox-settings";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { title: "Users", body: "Add or deactivate teammates, set roles and out-of-office." },
  { title: "Calendars and holidays", body: "US federal holidays, extra company days, quiet periods." },
  { title: "Proof points", body: "The approved proof points Claude may cite." },
  { title: "Caps and priority", body: "Touch caps, daily load and Focus Today weights." },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ mailbox_connected?: string; mailbox_error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = supabaseAdmin();
  const [slack, skill, data, spend, auto, mail] = db
    ? await Promise.all([loadSlackSettings(db), loadSkillSettings(db), loadDataSettings(db), monthSpend(db), db.from("app_settings").select("auto_draft").maybeSingle(), loadMailboxSettings(db)])
    : [null, null, null, null, null, null];
  return (
    <>
      <PageHeader title="Settings" subtitle="Admins run the setup. Mouli sees the Data tab." />
      <div className="grid gap-5">
        {mail && <MailboxSettings {...mail} canEdit={canEditAdminSettings(user)} meId={user.id ?? null} flash={sp.mailbox_connected ? "connected" : (sp.mailbox_error ?? null)} />}
        {data && <DataSettings {...data} canEdit={canAssignAccounts(user)} />}
        {spend && <ClaudeSpend {...spend} autoDraft={((auto?.data?.auto_draft as "off" | "a" | "ab" | undefined) ?? "off")} canEdit={canEditAdminSettings(user)} />}
        {skill && <SkillSettings {...skill} canEdit={canEditAdminSettings(user)} />}
        {slack && <SlackSettings {...slack} canEdit={canEditAdminSettings(user)} />}
        {canEditAdminSettings(user) ? (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold">Backup</h2>
              <p className="mt-1 text-sm text-ink-500">
                The free database plan keeps no backups. Download one on the first working day of each month and save it to Google Drive. Accounts and contacts can always be re-synced from the sheet; campaigns, replies and history live only here.
              </p>
            </div>
            <a href="/api/settings/backup" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink-900 hover:border-brand-200 hover:bg-brand-50">Download backup</a>
          </Card>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((s) => (
            <Card key={s.title} className="p-5">
              <h2 className="text-[15px] font-semibold">{s.title}</h2>
              <p className="mt-1.5 text-sm text-ink-500">{s.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
