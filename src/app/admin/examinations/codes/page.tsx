import { PageNavigation } from "@/components/PageNavigation";
import { Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { KeyRound, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmField, Notice, Section, StatusBadge, Table } from "../../ui";
import { regenerateCandidateCodeAsAdmin, regenerateExamCodeAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination access codes" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  exam_code_regenerated: "Examination access code regenerated. The previous exam code no longer works.",
  candidate_code_regenerated: "Candidate personal code regenerated. The previous personal code no longer works.",
  confirm: "Tick the confirmation box before regenerating an examination code.",
  candidate: "That candidate no longer exists.",
  submitted: "A submitted candidate's code cannot be regenerated.",
  exam: "That examination no longer exists.",
  failed: "The code could not be regenerated.",
};

export default async function ExaminationCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; q?: string; status?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();
  const back = sp.exam ? `/admin/examinations/codes?exam=${sp.exam}` : "/admin/examinations/codes";

  let examQuery = admin
    .from("exams")
    .select("id, title, status, access_code, starts_at, ends_at, organizations(name), exam_candidates(count), exam_attempts(count)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.exam) examQuery = examQuery.eq("id", sp.exam);

  let candidateQuery = admin
    .from("exam_candidates")
    .select("*, exams(title, access_code, status)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (sp.exam) candidateQuery = candidateQuery.eq("exam_id", sp.exam);
  if (sp.status) candidateQuery = candidateQuery.eq("status", sp.status);
  if (sp.q) candidateQuery = candidateQuery.or(`full_name.ilike.%${sp.q}%,email.ilike.%${sp.q}%,candidate_ref.ilike.%${sp.q}%,access_code.ilike.%${sp.q}%`);

  const [{ data: exams }, { data: candidates }, { data: examOptions }] = await Promise.all([
    examQuery,
    candidateQuery,
    admin.from("exams").select("id, title").order("created_at", { ascending: false }).limit(300),
  ]);

  const csv = toCsv([
    ["Candidate", "Email", "Reference", "Personal code", "Exam code", "Examination", "Status"],
    ...(candidates ?? []).map((c) => {
      const exam = c.exams as unknown as { title: string; access_code: string } | null;
      return [c.full_name, c.email ?? "", c.candidate_ref ?? "", c.access_code, exam?.access_code ?? "", exam?.title ?? "", c.status];
    }),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Credentials & Access Verification"
        title="Examination access codes"
        subtitle="Two supported flows: the legacy two-credential exam code + personal candidate code, and the general shareable link + server-verified access code with mandatory first/last name and class validation. Both are verified on the server."
        action={<div className="flex flex-wrap gap-2"><ExportButton filename="exam-candidate-codes.csv" csv={csv} label="Export candidate codes" /><ButtonLink href="/admin/examinations/invitations" variant="outline">Share links & codes</ButtonLink><ButtonLink href="/admin/examinations/register" variant="gold">Register candidates</ButtonLink></div>}
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Examination codes shown" value={(exams ?? []).length} icon={<KeyRound className="h-5 w-5" />} />
        <StatCard label="Candidate personal codes" value={(candidates ?? []).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Unused candidate codes" value={(candidates ?? []).filter((c) => c.status === "registered").length} icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <Select name="exam" defaultValue={sp.exam ?? ""} className="min-w-[260px]" aria-label="Examination">
          <option value="">All examinations</option>
          {(examOptions ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search candidate or personal code…" aria-label="Search candidate codes" /></div>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Candidate status">
          <option value="">All candidate statuses</option>
          <option value="registered">Registered</option>
          <option value="admitted">Admitted</option>
          <option value="in_progress">In progress</option>
          <option value="submitted">Submitted</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.exam || sp.q || sp.status) && (
          <Link href="/admin/examinations/codes" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      <Section title="Examination codes" hint="Regenerating an exam code immediately invalidates the old code for every candidate who has not yet entered. Existing attempt tokens remain bound to their attempt and deadline.">
        {(exams ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No examinations match.</p>
        ) : (
          <Table head={["Examination", "Exam code", "Candidates / attempts", "Window", "Status", "Regenerate"]}>
            {(exams ?? []).map((e) => (
              <tr key={e.id}>
                <td><span className="font-medium text-evergreen-950">{e.title}</span><span className="block text-xs text-ink-soft">{(e.organizations as unknown as { name?: string } | null)?.name}</span></td>
                <td className="font-mono text-base font-bold tracking-widest">{e.access_code}</td>
                <td className="tabular-nums">{(e.exam_candidates as { count: number }[] | null)?.[0]?.count ?? 0} / {(e.exam_attempts as { count: number }[] | null)?.[0]?.count ?? 0}</td>
                <td className="text-xs text-ink-soft">{e.starts_at ? fmtDateTime(e.starts_at) : "No opening time"} → {e.ends_at ? fmtDateTime(e.ends_at) : "No closing time"}</td>
                <td><StatusBadge status={e.status} /></td>
                <td>
                  <form action={regenerateExamCodeAsAdmin} className="space-y-2">
                    <input type="hidden" name="exam_id" value={e.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmField label="Invalidate old exam code" />
                    <Button type="submit" variant="outline" className="px-3 py-2 text-xs">Regenerate exam code</Button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Candidate personal codes" hint="A personal code is unique within its examination. Regeneration is blocked after submission so completed evidence cannot be detached from the candidate record.">
        {(candidates ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No candidate codes match.</p>
        ) : (
          <>
            <Table head={["Candidate", "Personal code", "Examination", "Reference", "Status", "Actions"]}>
              {(candidates ?? []).slice((page - 1) * pageSize, page * pageSize).map((c) => {
                const exam = c.exams as unknown as { title: string; access_code: string; status: string } | null;
                return (
                  <tr key={c.id}>
                    <td><span className="font-medium">{c.full_name}</span><span className="block text-xs text-ink-soft">{c.email || "No email"}</span></td>
                    <td className="font-mono font-bold tracking-wider">{c.access_code}</td>
                    <td>{exam?.title}<span className="block font-mono text-xs text-ink-soft">Exam code {exam?.access_code}</span></td>
                    <td className="text-ink-soft">{c.candidate_ref || "—"}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={regenerateCandidateCodeAsAdmin}>
                          <input type="hidden" name="candidate_id" value={c.id} />
                          <input type="hidden" name="back" value={back} />
                          <Button type="submit" variant="outline" className="px-3 py-2 text-xs" disabled={c.status === "submitted"}>Regenerate</Button>
                        </form>
                        <Link href={`/admin/examinations/candidates?exam=${c.exam_id}`} className="font-medium text-evergreen-700 hover:underline">Candidate record</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
            <PageNavigation
              page={page}
              pageSize={pageSize}
              total={(candidates ?? []).length}
              pathname="/admin/examinations/codes"
              query={{ exam: sp.exam, q: sp.q, status: sp.status }}
              label="candidate personal codes"
            />
          </>
        )}
      </Section>
    </>
  );
}
