import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, Settings2, Trophy, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Competition configuration" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));

export default async function CompetitionConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; status?: string; readiness?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("competitions")
    .select("*, organizations(name), quizzes(id, title, status), competition_access_codes(count), competition_registrations(count)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (sp.q) query = query.ilike("title", `%${sp.q}%`);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);

  const [{ data: comps }, { data: orgs }, { data: quizQuestions }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("quiz_questions").select("quiz_id").limit(20000),
  ]);

  const questionCounts = new Map<string, number>();
  for (const qq of quizQuestions ?? []) questionCounts.set(qq.quiz_id, (questionCounts.get(qq.quiz_id) ?? 0) + 1);

  const decorated = (comps ?? []).map((c) => {
    const quiz = c.quizzes as unknown as { id: string; title: string; status: string } | null;
    const questions = quiz ? questionCounts.get(quiz.id) ?? 0 : 0;
    const codes = (c.competition_access_codes as { count: number }[] | null)?.[0]?.count ?? 0;
    const checks = [
      { label: "Quiz attached", ok: Boolean(quiz) },
      { label: "Quiz published", ok: quiz?.status === "published" },
      { label: "Questions added", ok: questions > 0 },
      { label: "Start scheduled", ok: Boolean(c.starts_at) },
      { label: "Access code ready", ok: codes > 0 },
      { label: "Instructions/rules", ok: Boolean(c.instructions || c.rules) },
    ];
    const ready = checks.filter((x) => x.ok).length === checks.length;
    return { c, quiz, questions, codes, checks, ready };
  });

  const filtered = decorated.filter(({ ready }) => {
    if (sp.readiness === "ready") return ready;
    if (sp.readiness === "attention") return !ready;
    return true;
  });

  return (
    <>
      <PageTitle
        title="Competition configuration"
        subtitle="Readiness across every competition: content, publication, scheduling, eligibility codes and participant instructions."
        action={<ButtonLink href="/admin/competitions/new" variant="gold">+ Create competition</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Competitions shown" value={filtered.length} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Fully configured" value={decorated.filter((d) => d.ready).length} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Needs configuration" value={decorated.filter((d) => !d.ready).length} icon={<TriangleAlert className="h-5 w-5" />} />
        <StatCard label="Live / paused" value={decorated.filter((d) => ["live", "paused"].includes(d.c.status)).length} icon={<Settings2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search competition…" aria-label="Search competitions" /></div>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Host organization">
          <option value="">All host organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Status">
          <option value="">All statuses</option>
          {["draft", "published", "scheduled", "live", "paused", "ended", "cancelled", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select name="readiness" defaultValue={sp.readiness ?? ""} className="w-48" aria-label="Readiness">
          <option value="">All readiness states</option>
          <option value="ready">Fully configured</option>
          <option value="attention">Needs attention</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No competitions match.</p>
      ) : (
        <Table head={["Competition", "Format / audience", "Content", "Schedule & access", "Readiness checks", "Status", "Configure"]}>
          {filtered.map(({ c, quiz, questions, codes, checks, ready }) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/competitions/${c.id}`} className="font-semibold text-evergreen-950 hover:underline">{c.title}</Link>
                <span className="block text-xs text-ink-soft">{(c.organizations as unknown as { name?: string } | null)?.name} · {c.visibility}</span>
              </td>
              <td className="text-ink-soft">{FORMAT_LABELS[c.format] ?? c.format}<span className="block text-xs">{c.target_audience || "General audience"}{c.education_level ? ` · ${c.education_level}` : ""}</span></td>
              <td>
                {quiz ? <>{quiz.title}<span className="block text-xs text-ink-soft">{questions} questions · quiz {quiz.status}</span></> : <Badge tone="red">No quiz</Badge>}
              </td>
              <td className="text-xs text-ink-soft">
                {c.starts_at ? fmtDateTime(c.starts_at) : "No start set"}
                <span className="block">{codes} access code{codes === 1 ? "" : "s"} · cap {c.max_participants ?? "none"} · {c.duration_minutes ? `${c.duration_minutes} min` : "duration unset"}</span>
              </td>
              <td>
                <Badge tone={ready ? "green" : "amber"}>{ready ? "Ready" : "Needs attention"}</Badge>
                <span className="mt-1 block max-w-[220px] text-xs text-ink-soft">
                  {checks.filter((x) => !x.ok).map((x) => x.label).join(" · ") || "All checks passed"}
                </span>
              </td>
              <td><StatusBadge status={c.status} /></td>
              <td>
                <div className="flex flex-col gap-1">
                  <Link href={`/admin/competitions/${c.id}?tab=settings`} className="font-medium text-evergreen-700 hover:underline">Settings</Link>
                  <Link href={`/admin/competitions/questions?comp=${c.id}`} className="text-sm text-evergreen-700 hover:underline">Questions</Link>
                  <Link href={`/admin/competitions/${c.id}?tab=codes`} className="text-sm text-evergreen-700 hover:underline">Access codes</Link>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
