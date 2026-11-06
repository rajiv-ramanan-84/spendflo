import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canEditAdminSettings, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSlackSettings } from "@/lib/slack/settings";
import { SlackSettings } from "@/components/settings/slack-settings";
import { loadSkillSettings } from "@/lib/claude/skill-settings";
import { SkillSettings } from "@/components/settings/skill-settings";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { title: "Users", body: "Add or deactivate teammates, set roles and out-of-office." },
  { title: "Calendars and holidays", body: "US federal holidays, extra company days, quiet periods." },
  { title: "Data", body: "Sheet connection, last sync and the data quality queue." },
  { title: "Claude spend and proof points", body: "Monthly spend and the approved proof points Claude may cite." },
  { title: "Caps and priority", body: "Touch caps, daily load and Focus Today weights." },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const db = supabaseAdmin();
  const [slack, skill] = db ? await Promise.all([loadSlackSettings(db), loadSkillSettings(db)]) : [null, null];
  return (
    <>
      <PageHeader title="Settings" subtitle="Admins run the setup. Mouli sees the Data tab." />
      <div className="grid gap-5">
        {skill && <SkillSettings {...skill} canEdit={canEditAdminSettings(user)} />}
        {slack && <SlackSettings {...slack} canEdit={canEditAdminSettings(user)} />}
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
