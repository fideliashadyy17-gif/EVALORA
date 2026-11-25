import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac";
import { getEntitlementFor } from "@/lib/entitlements";
import { MODULE_CATALOG, moduleEnabled } from "@/lib/modules";
import { Badge, Card, DataTable, PageTitle, StatCard } from "@/components/ui";
import { SignOutButton } from "@/components/SignOutButton";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
type Overview = { classes?:string[]; studentCount?:number; papers?:{title:string;status:string}[]; competitions?:{name:string;status:string}[]; attemptProgress?:Record<string,number>; activeProctoringRooms?:number; questionCount?: number; quizCount?: number; publishedExaminationCount?: number; examinations?: {title:string;status:string;starts_at:string|null;ends_at:string|null}[] };
export default async function Supervision() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || ctx.tenantDenied) redirect("/workspaces");
  await requirePermission(ctx, org.id, "dashboard.view");
  const client = await createClient();
  const [{ data, error }, entitlement] = await Promise.all([
    client.rpc("access_supervision_overview", { p_org: org.id }),
    getEntitlementFor(client,ctx,org.id),
  ]);
  if (error) throw new Error("Institutional overview unavailable. Please contact your platform administrator.");
  const overview = data as Overview;
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <div className="flex items-center justify-between"><Badge tone="gold">Institutional supervision · read-only</Badge><SignOutButton /></div>
    <PageTitle title={org.name} eyebrow="School Founder / Institutional Supervisor" subtitle="A privacy-preserving view of your institution. Academic editing, candidate identities, access codes, answers, marks and recordings are not exposed in this workspace." />
    <nav aria-label="Supervision sections" className="flex flex-wrap gap-4 text-sm font-semibold text-evergreen-800"><a href="#overview">Overview</a><a href="#examinations">Examinations</a><a href="#results">Published results</a><a href="#academics">Academics & participation</a><a href="#activity">Papers & competitions</a><a href="#modules">Modules & subscription</a></nav>
    <section id="overview" className="grid gap-4 sm:grid-cols-3">
      {overview.questionCount !== undefined && <StatCard label="Question bank" value={overview.questionCount} hint="Question count only; answer keys are private" />}
      {overview.quizCount !== undefined && <StatCard label="Quiz activity" value={overview.quizCount} hint="Institutional quiz catalogue" />}
      {overview.publishedExaminationCount !== undefined && <div id="results"><StatCard label="Published examinations" value={overview.publishedExaminationCount} hint="Publication summaries only; no private candidate results" /></div>}
    </section>
    {overview.examinations && <section id="examinations"><h2 className="mb-3 text-xl font-semibold">Examination overview</h2><DataTable head={["Examination","Status","Starts","Ends"]}>{overview.examinations.map((e,i)=><tr key={i}><td>{e.title}</td><td><Badge>{e.status}</Badge></td><td>{e.starts_at ?? "Not scheduled"}</td><td>{e.ends_at ?? "Not scheduled"}</td></tr>)}</DataTable>{!overview.examinations.length && <p className="mt-3 text-sm">No examinations are configured for this institution.</p>}</section>}
    <section id="academics" className="space-y-4"><h2 className="text-xl font-semibold">Academic structure & participation</h2><div className="grid gap-4 sm:grid-cols-3">{overview.studentCount !== undefined && <StatCard label="Enrolled students" value={overview.studentCount} hint="Aggregate only; no student identity data"/>}{overview.activeProctoringRooms !== undefined && <StatCard label="Active proctoring rooms" value={overview.activeProctoringRooms} hint="Status only; recordings and screenshots are private"/>}{overview.attemptProgress && Object.entries(overview.attemptProgress).map(([status,count])=><StatCard key={status} label={`Attempts · ${status.replaceAll("_"," ")}`} value={count} hint="No answers or marks exposed"/>)}</div>{overview.classes && <Card className="p-5"><h3 className="mb-3 font-semibold">Institutional classes</h3><div className="flex flex-wrap gap-2">{overview.classes.map((name,i)=><Badge key={i}>{name}</Badge>)}</div>{!overview.classes.length && <p className="text-sm">No classes are configured.</p>}</Card>}</section>
    <section id="activity" className="grid gap-5 md:grid-cols-2">{overview.papers && <Card className="p-5"><h2 className="mb-3 text-xl font-semibold">Paper Builder overview</h2><p className="mb-3 text-xs text-ink-soft">Shared question-paper catalogue; no content, versions or answer keys can be edited here.</p>{overview.papers.map((p,i)=><div key={i} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{p.title}</span><Badge>{p.status}</Badge></div>)}{!overview.papers.length && <p className="text-sm">No papers are configured.</p>}</Card>}{overview.competitions && <Card className="p-5"><h2 className="mb-3 text-xl font-semibold">Competition activity</h2>{overview.competitions.map((c,i)=><div key={i} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{c.name}</span><Badge>{c.status}</Badge></div>)}{!overview.competitions.length && <p className="text-sm">No competitions are configured.</p>}</Card>}</section>
    <Card id="modules" className="p-5"><h2 className="text-xl font-semibold">Modules & subscription</h2><p className="my-3 text-sm">{entitlement.planName} · {entitlement.status} · Subscription settings are read-only.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{MODULE_CATALOG.map(m=><div key={m.key} className="flex justify-between gap-2 border-b border-evergreen-900/10 py-2 text-sm"><span>{m.label}</span><Badge tone={moduleEnabled(entitlement.modules,m.key)?"green":"gray"}>{moduleEnabled(entitlement.modules,m.key)?"Enabled":"Disabled"}</Badge></div>)}</div></Card>
  </main>;
}
