import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { tenantPortalUrl } from "@/lib/tenant";
import type { Metadata } from "next";
import { enterOrgWorkspace } from "../actions/orgs";
import { ConfirmField, Flash, Notice, Section, Table } from "../ui";
import { generateDemoLogin, recordMigrationRun, resetDemoActivity } from "./actions";

export const metadata: Metadata = { title: "DEMO school & migration" };
export const dynamic = "force-dynamic";

export default async function DemoAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: demo } = await admin.from("organizations").select("*").eq("is_demo", true).maybeSingle();

  let counts: Record<string, number> = {};
  let members: { user_id: string; role: string; name: string; email: string }[] = [];
  if (demo) {
    const tables = ["academic_years", "education_levels", "classes", "students", "questions", "quizzes", "competitions", "exams", "quiz_sessions", "import_batches"];
    const results = await Promise.all(tables.map((t) =>
      admin.from(t).select("id", { count: "exact", head: true }).eq("organization_id", demo.id).then((r) => r.count ?? 0)));
    counts = Object.fromEntries(tables.map((t, i) => [t, results[i]]));
    const { data: memberRows } = await admin.from("organization_members")
      .select("user_id, role, profiles(full_name, email)").eq("organization_id", demo.id).order("role");
    members = (memberRows ?? []).map((m) => {
      const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
      return { user_id: m.user_id, role: m.role, name: p?.full_name || "Demo user", email: p?.email ?? "" };
    });
  }
  const { data: runs } = await admin.from("migration_runs").select("*").order("created_at", { ascending: false }).limit(10);
  const { count: mappingCount } = await admin.from("migration_mappings").select("id", { count: "exact", head: true });

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Protected Sandbox & Migration"
        title="DEMO School & Source Migration"
        subtitle="The permanent protected demonstration organization, plus the external question-migration ledger."
      />
      <Flash />
      <Notice ok={sp.ok} e={sp.e} messages={{
        reset: "DEMO sample activity reset: fresh lobby ready, labelled sample results rebuilt.", login: "One-time DEMO password generated — see the message above.",
        migration_recorded: "Migration run recorded.", confirm: "Tick the confirmation box to reset DEMO activity.", missing: "DEMO organization/core content not found.", user: "That user is not a DEMO member.", source: "Source project ref is required.",
      }} />

      {!demo ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">No organization is flagged is_demo. The DEMO seed has not been applied to this backend.</p>
      ) : (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-evergreen-950">{demo.name} <span className="ml-1 rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-evergreen-950">DEMO</span></h2>
                <p className="mt-1 text-sm text-ink-soft">Subdomain slug: <strong>{demo.slug}</strong> · Portal: <a className="text-evergreen-800 underline" href={tenantPortalUrl(demo.slug)}>{tenantPortalUrl(demo.slug)}</a> · Status: {demo.status}</p>
                <p className="mt-2 max-w-2xl text-sm text-ink">{demo.description}</p>
                <p className="mt-2 text-sm text-ink-soft">{Object.entries(counts).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["/dashboard|Open DEMO workspace", "/dashboard/academics/classes|DEMO classes", "/dashboard/students|DEMO students", "/dashboard/quizzes|DEMO quizzes"].map((item) => {
                  const [next, label] = item.split("|");
                  return (
                    <form key={next} action={enterOrgWorkspace}>
                      <input type="hidden" name="organization_id" value={demo.id} /><input type="hidden" name="next" value={next} />
                      <Button type="submit" variant="outline">{label}</Button>
                    </form>
                  );
                })}
                <ButtonLink href={`/portal/${demo.slug}`} variant="gold">Public DEMO portal</ButtonLink>
              </div>
            </div>
          </Card>

          <Section title="DEMO accounts" hint="Fictional accounts. Generate a one-time password to sign in as that role; passwords are never shared or reusable across schools.">
            <Table head={["User", "Email", "Role", ""]}>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t border-evergreen-900/10">
                  <td className="px-3 py-2"><strong>{m.name}</strong></td><td className="px-3 py-2">{m.email}</td><td className="px-3 py-2 capitalize">{m.role}</td>
                  <td className="px-3 py-2"><form action={generateDemoLogin}><input type="hidden" name="user_id" value={m.user_id} /><Button type="submit" variant="outline">Generate one-time login</Button></form></td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Reset DEMO sample activity" hint="Deletes only DEMO live sessions/answers and exam attempts, then rebuilds labelled sample results and a fresh launchable lobby. Real schools are never touched.">
            <Card className="p-5">
              <form action={resetDemoActivity} className="space-y-3">
                <ConfirmField label="Reset EVALORA DEMO ACADEMY sample activity to its original demonstration state" />
                <Button type="submit" variant="gold">Reset DEMO activity</Button>
              </form>
            </Card>
          </Section>
        </>
      )}

      <Section title="External question migration" hint={`${mappingCount ?? 0} mapped source record(s). Source databases are read-only; execution uses the authorized connector/migration path and writes an idempotent ledger here.`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-semibold text-evergreen-950">Record an audit / run</h3>
            <form action={recordMigrationRun} className="mt-3 space-y-3">
              <Field label="Source Supabase project ref *"><Input name="source_project_ref" required placeholder="e.g. kqpwjaeqmsjrypurfwak" /></Field>
              <Field label="Source name"><Input name="source_name" placeholder="e.g. oak-competition-platform-premium" /></Field>
              <Field label="Status"><Select name="status" defaultValue="partial"><option value="running">Running</option><option value="partial">Partial / blocked</option><option value="completed">Completed</option><option value="failed">Failed</option></Select></Field>
              <Field label="Note (counts, blockers, exceptions)"><Textarea name="note" rows={3} /></Field>
              <Button type="submit">Record migration run</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-evergreen-950">Recent runs</h3>
            {(runs ?? []).length === 0 ? <p className="mt-2 text-sm text-ink-soft">No migration runs recorded yet.</p> : (
              <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">
                {(runs ?? []).map((r) => (
                  <li key={r.id} className="py-2"><strong>{r.source_name ?? r.source_project_ref}</strong> · {r.status} · {new Date(r.created_at).toLocaleString()}
                    <span className="block text-ink-soft">{String((r.summary as { note?: string } | null)?.note ?? "")}</span></li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-soft">Security: never paste service-role keys, database passwords or personal access tokens into this page or the repository.</p>
          </Card>
        </div>
      </Section>
    </>
  );
}
