import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { CheckCircle2, Clock3, KeyRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmField, Notice, StatusBadge, Table } from "../../ui";
import { regenerateCandidateCodeAsAdmin, removeExamCandidateAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination candidates" };
export const dynamic = "force-dynamic";

interface CandidateRow {
  id: string;
  exam_id: string;
  full_name: string;
  email: string | null;
  candidate_ref: string | null;
  access_code: string;
  status: string;
  created_at: string;
  exams: {
    id: string;
    title: string;
    status: string;
    organizations: { name: string } | null;
  } | null;
  exam_attempts: {
    id: string;
    status: string;
    started_at: string;
    submitted_at: string | null;
    score: number | null;
    max_score: number | null;
    extension_minutes: number;
    attempt_number?: number | null;
  }[];
}

/**
 * A candidate may now own several attempts (an authorized retake creates a NEW
 * attempt row). Surfaces always summarise the LATEST attempt, never an
 * arbitrary row returned by the database.
 */
function latestAttempt<T extends { attempt_number?: number | null }>(attempts: T[]): T | undefined {
  return [...attempts].sort((a, b) => (b.attempt_number ?? 1) - (a.attempt_number ?? 1))[0];
}

const MESSAGES: Record<string, string> = {
  candidate_code_regenerated: "Candidate access code regenerated. The old code no longer works.",
  candidate_removed: "Candidate removed.",
  confirm: "Tick the confirmation box before removing a candidate.",
  candidate: "That candidate no longer exists.",
  submitted: "A submitted candidate's code cannot be regenerated.",
  attempt_exists: "This candidate already has an attempt, so the record cannot be deleted without destroying examination evidence.",
  failed: "The operation could not be completed.",
};

export default async function ExaminationCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; exam?: string; org?: string; status?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();
  const back = "/admin/examinations/candidates";

  let query = admin
    .from("exam_candidates")
    .select("*, exams!inner(id, title, status, organization_id, organizations(name)), exam_attempts(id, status, started_at, submitted_at, score, max_score, extension_minutes, attempt_number)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (sp.exam) query = query.eq("exam_id", sp.exam);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.or(`full_name.ilike.%${sp.q}%,email.ilike.%${sp.q}%,candidate_ref.ilike.%${sp.q}%,access_code.ilike.%${sp.q}%`);
  if (sp.org) query = query.eq("exams.organization_id", sp.org);

  const [{ data: rawCandidates }, { data: exams }, { data: orgs }] = await Promise.all([
    query,
    admin.from("exams").select("id, title").order("created_at", { ascending: false }).limit(300),
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);
  const candidates = (rawCandidates ?? []) as unknown as CandidateRow[];

  const csv = toCsv([
    ["Candidate", "Email", "Reference", "Personal access code", "Examination", "Organization", "Candidate status", "Attempt status", "Score", "Extension minutes", "Registered"],
    ...candidates.map((c) => {
      const attempt = latestAttempt(c.exam_attempts);
      return [
        c.full_name, c.email ?? "", c.candidate_ref ?? "", c.access_code, c.exams?.title ?? "",
        c.exams?.organizations?.name ?? "", c.status,
        attempt ? `attempt ${attempt.attempt_number ?? 1} · ${attempt.status}` : "not started",
        attempt?.score != null ? `${attempt.score}/${attempt.max_score ?? ""}` : "", attempt?.extension_minutes ?? 0,
        fmtDateTime(c.created_at),
      ];
    }),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Cross-Institution Candidate Register"
        title="Examination candidates"
        subtitle="The dedicated cross-examination candidate register. Each candidate is bound to one examination and receives a separate personal code in addition to the exam code."
        action={<div className="flex flex-wrap gap-2"><ExportButton filename="exam-candidates.csv" csv={csv} label="Export candidates" /><ButtonLink href="/admin/examinations/register" variant="gold">Register candidates</ButtonLink></div>}
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Candidates shown" value={candidates.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Not started" value={candidates.filter((c) => c.exam_attempts.length === 0).length} icon={<KeyRound className="h-5 w-5" />} />
        <StatCard label="In progress" value={candidates.filter((c) => c.exam_attempts.some((a) => a.status === "in_progress")).length} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Submitted / marked" value={candidates.filter((c) => c.exam_attempts.some((a) => a.status !== "in_progress")).length} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search candidate, email, reference or code…" aria-label="Search candidates" /></div>
        <Select name="exam" defaultValue={sp.exam ?? ""} className="w-64" aria-label="Examination">
          <option value="">All examinations</option>
          {(exams ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Candidate status">
          <option value="">All candidate statuses</option>
          <option value="registered">Registered</option>
          <option value="admitted">Admitted</option>
          <option value="in_progress">In progress</option>
          <option value="submitted">Submitted</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.exam || sp.org || sp.status) && (
          <Link href="/admin/examinations/candidates" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {candidates.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No examination candidates match.</p>
      ) : (
        <>
          <Table head={["Candidate", "Examination", "Personal code", "Attempt", "Extension", "Status", "Actions"]}>
            {candidates.slice((page - 1) * pageSize, page * pageSize).map((c) => {
            const attempt = latestAttempt(c.exam_attempts);
            return (
              <tr key={c.id}>
                <td>
                  <span className="font-semibold text-evergreen-950">{c.full_name}</span>
                  <span className="block text-xs text-ink-soft">{c.email || "No email"}{c.candidate_ref ? ` · ${c.candidate_ref}` : ""}</span>
                </td>
                <td>
                  {c.exams ? <Link href={`/admin/examinations/candidates?exam=${c.exams.id}`} className="font-medium text-evergreen-800 hover:underline">{c.exams.title}</Link> : "—"}
                  <span className="block text-xs text-ink-soft">{c.exams?.organizations?.name} · {c.exams?.status}</span>
                </td>
                <td className="font-mono font-bold tracking-wider">{c.access_code}</td>
                <td>
                  {attempt ? (
                    <>{attempt.attempt_number && attempt.attempt_number > 1 ? `Attempt ${attempt.attempt_number} · ` : ""}{attempt.status.replace(/_/g, " ")}<span className="block text-xs text-ink-soft">Started {fmtDateTime(attempt.started_at)}{attempt.score != null ? ` · ${attempt.score}/${attempt.max_score ?? "?"}` : ""}</span></>
                  ) : "Not started"}
                </td>
                <td>{attempt?.extension_minutes ? <Badge tone="gold">+{attempt.extension_minutes} min</Badge> : "—"}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>
                  <div className="flex max-w-[300px] flex-wrap gap-x-3 gap-y-2">
                    <Link href={`/admin/examinations/register?exam=${c.exam_id}`} className="font-medium text-evergreen-700 hover:underline">Registration desk</Link>
                    <Link href={`/admin/examinations/monitoring?exam=${c.exam_id}`} className="font-medium text-evergreen-700 hover:underline">Monitor</Link>
                    <form action={regenerateCandidateCodeAsAdmin}>
                      <input type="hidden" name="candidate_id" value={c.id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="font-medium text-gold-800 hover:underline" disabled={c.status === "submitted"}>Regenerate code</button>
                    </form>
                  </div>
                  <form action={removeExamCandidateAsAdmin} className="mt-2 space-y-1">
                    <input type="hidden" name="candidate_id" value={c.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmField label="Remove candidate with no attempt" />
                    <button className="font-medium text-red-700 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            );
          })}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={candidates.length}
            pathname="/admin/examinations/candidates"
            query={{ q: sp.q, exam: sp.exam, org: sp.org, status: sp.status }}
            label="candidates"
          />
        </>
      )}
    </>
  );
}
