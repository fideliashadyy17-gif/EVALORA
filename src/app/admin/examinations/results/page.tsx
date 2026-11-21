import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { CopyResultLinkButton } from "@/components/CopyResultLinkButton";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { Award, CheckCircle2, Eye, FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";
import { Notice, Section, StatusBadge, Table } from "../../ui";
import { setExamResultsPublishedAsAdmin } from "../actions";
import { MypExportButton } from "@/components/myp/MypExportButton";

export const metadata: Metadata = { title: "Results Management & Candidate Links · EVALORA" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  results_published: "Results published. Candidates can now see their score, criteria breakdown, and worked solutions on their personal result link.",
  results_unpublished: "Results unpublished and withheld from candidates.",
  exam: "That examination no longer exists.",
  failed: "Result publication could not be changed.",
};
const round = (n: number) => Math.round(n * 10) / 10;

interface ExamRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  settings: Record<string, unknown> | null;
  organizations: { name: string } | null;
}

interface AttemptRow {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  extension_minutes: number;
  attempt_number?: number | null;
  access_token: string;
  exam_candidates: { full_name: string; candidate_ref: string | null; email: string | null; access_code?: string | null } | null;
}

export default async function ExaminationResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; outcome?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  const { data: rawExams } = await admin
    .from("exams")
    .select("id, title, status, organization_id, settings, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const selected = (sp.exam && exams.find((e) => e.id === sp.exam)) || exams[0];
  const settings = selected?.settings ?? {};
  const passMark = Number(settings.pass_mark_percent ?? 50);
  const published = Boolean(settings.results_published);

  let attempts: AttemptRow[] = [];
  let candidateTotal = 0;
  if (selected) {
    const [{ data: rawAttempts }, { count }] = await Promise.all([
      admin
        .from("exam_attempts")
        .select("id, status, started_at, submitted_at, score, max_score, extension_minutes, attempt_number, access_token, exam_candidates(full_name, candidate_ref, email, access_code)")
        .eq("exam_id", selected.id)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(1000),
      admin.from("exam_candidates").select("id", { count: "exact", head: true }).eq("exam_id", selected.id),
    ]);
    attempts = (rawAttempts ?? []) as unknown as AttemptRow[];
    candidateTotal = count ?? 0;
  }

  const scored = attempts.filter((a) => a.status !== "in_progress" && a.score != null && a.max_score);
  const percentages = scored.map((a) => (Number(a.score) / Math.max(1, Number(a.max_score))) * 100);
  const passes = percentages.filter((p) => p >= passMark).length;
  const filtered = attempts.filter((a) => {
    const pct = a.score != null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
    if (sp.outcome === "pass") return pct !== null && pct >= passMark;
    if (sp.outcome === "fail") return pct !== null && pct < passMark;
    if (sp.outcome === "pending") return pct === null;
    return true;
  });

  const csv = selected
    ? toCsv([
        ["Candidate", "Reference", "Email", "Status", "Score", "Maximum", "Percent", "Outcome", "Publication", "Individual Result Link", "Extension minutes", "Started", "Submitted"],
        ...filtered.map((a) => {
          const pct = a.score != null && a.max_score ? round((Number(a.score) / Number(a.max_score)) * 100) : "";
          const resultUrl = `${origin}/exam/result/${a.access_token}`;
          return [
            a.exam_candidates?.full_name ?? "",
            a.exam_candidates?.candidate_ref ?? "",
            a.exam_candidates?.email ?? "",
            a.status,
            a.score ?? "",
            a.max_score ?? "",
            pct,
            typeof pct === "number" ? (pct >= passMark ? "PASS" : "FAIL") : "PENDING",
            published ? "Published" : "Withheld",
            resultUrl,
            a.extension_minutes,
            a.started_at,
            a.submitted_at ?? "",
          ];
        }),
      ])
    : "";

  const back = selected ? `/admin/examinations/results?exam=${selected.id}` : "/admin/examinations/results";

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Results Management & Candidate Links"
        title="Results Management & Candidate Links"
        subtitle="Validate scores, control candidate result publication, and copy or distribute individual candidate result links. Until published, scores and worked solutions remain strictly withheld."
        action={selected ? <div className="flex flex-wrap gap-2"><ExportButton filename={`exam-results-${selected.id}.csv`} csv={csv} label="Export results (CSV / Excel)" /><PrintButton /></div> : undefined}
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No examinations exist yet.</p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <label className="block min-w-[320px] flex-1">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Examination</span>
              <Select name="exam" defaultValue={selected.id}>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.title} — {e.organizations?.name ?? "Organization"} ({e.status})</option>)}
              </Select>
            </label>
            <Select name="outcome" defaultValue={sp.outcome ?? ""} className="w-44" aria-label="Outcome">
              <option value="">All outcomes</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="pending">Pending / in progress</option>
            </Select>
            <Button type="submit" variant="outline">View results</Button>
            {sp.outcome && (
              <Link href={`/admin/examinations/results?exam=${selected.id}`} className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
                Reset
              </Link>
            )}
          </form>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Registered candidates" value={candidateTotal} icon={<FileCheck2 className="h-5 w-5" />} />
            <StatCard label="Submitted attempts" value={attempts.filter((a) => a.status !== "in_progress").length} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Average score" value={percentages.length ? `${round(percentages.reduce((a, b) => a + b, 0) / percentages.length)}%` : "—"} icon={<Award className="h-5 w-5" />} />
            <StatCard label="Pass rate" value={scored.length ? `${round((passes / scored.length) * 100)}%` : "—"} hint={`${passes}/${scored.length} at ${passMark}%`} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Candidate visibility" value={published ? "Published" : "Withheld"} icon={<Eye className="h-5 w-5" />} />
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-evergreen-900/15 bg-paper p-4">
            <Badge tone={published ? "green" : "amber"}>{published ? "Results Published (Visible to candidates)" : "Results Withheld (Hidden from candidates)"}</Badge>
            <form action={setExamResultsPublishedAsAdmin}>
              <input type="hidden" name="exam_id" value={selected.id} />
              <input type="hidden" name="published" value={published ? "0" : "1"} />
              <input type="hidden" name="back" value={back} />
              <Button type="submit" variant={published ? "outline" : "gold"}>{published ? "Unpublish all results" : "Validate & publish all results"}</Button>
            </form>
            <Link href={`/admin/examinations/marking?exam=${selected.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Marking queue</Link>
            <Link href={`/admin/myp-results?exam=${selected.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">MYP criterion results</Link>
            <MypExportButton format="pdf" scope="collective" query={`exam=${selected.id}`} label="Collective MYP PDF" compact />
            <MypExportButton format="xlsx" scope="collective" query={`exam=${selected.id}`} label="MYP Excel" compact />
            <form action={enterOrgWorkspace}>
              <input type="hidden" name="organization_id" value={selected.organization_id} />
              <input type="hidden" name="next" value={`/dashboard/reports/exam/${selected.id}`} />
              <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Detailed workspace report →</button>
            </form>
          </div>

          <Section
            title={`Results Management & Candidate Links — ${selected.title}`}
            hint="Each candidate link is unique and secure. Copy and provide the link to the student to check their verified report."
          >
            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No attempts match this outcome.</p>
            ) : (
              <>
                <Table head={["Rank", "Candidate Name & Identifier", "Attempt", "Submission Status", "Score", "%", "Publication", "Individual Result Link", "Actions"]}>
                  {filtered.slice((page - 1) * pageSize, page * pageSize).map((a, idx) => {
                    const i = (page - 1) * pageSize + idx;
                    const pct = a.score != null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
                    const candName = a.exam_candidates?.full_name ?? "Candidate";
                    const candId = a.exam_candidates?.candidate_ref || a.exam_candidates?.email || (a.exam_candidates?.access_code ? `Code: ${a.exam_candidates.access_code}` : null);
                    const resultUrl = `${origin}/exam/result/${a.access_token}`;

                    return (
                      <tr key={a.id}>
                        <td className="font-display font-bold">{pct === null ? "—" : i + 1}</td>
                        <td>
                          <span className="font-medium text-evergreen-950">{candName}</span>
                          {candId && <span className="block text-xs text-ink-soft">{candId}</span>}
                        </td>
                        <td className="text-xs font-medium text-ink-soft">
                          Attempt {a.attempt_number ?? 1}
                        </td>
                        <td>
                          <StatusBadge status={a.status} />
                          {a.submitted_at && (
                            <span className="block text-[11px] text-ink-soft">
                              {fmtDateTime(a.submitted_at)}
                            </span>
                          )}
                        </td>
                        <td className="tabular-nums font-semibold text-evergreen-900">
                          {a.score != null ? `${Number(a.score)} / ${Number(a.max_score ?? 0)}` : "—"}
                        </td>
                        <td className="tabular-nums font-medium">
                          {pct === null ? "—" : `${round(pct)}%`}
                        </td>
                        <td>
                          <Badge tone={published ? "green" : "amber"}>
                            {published ? "Published" : "Withheld"}
                          </Badge>
                        </td>
                        <td className="max-w-xs">
                          <input
                            type="text"
                            readOnly
                            value={resultUrl}
                            className="w-full truncate rounded border border-evergreen-900/15 bg-cream/50 px-2 py-1 font-mono text-xs text-evergreen-950 select-all"
                            title={resultUrl}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <CopyResultLinkButton url={resultUrl} candidateName={candName} />
                            <Link
                              href={`/exam/result/${a.access_token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whitespace-nowrap text-xs font-semibold text-evergreen-800 underline underline-offset-2"
                            >
                              View
                            </Link>
                            <Link
                              href={`/admin/myp-results/${a.id}`}
                              className="whitespace-nowrap text-xs font-semibold text-evergreen-800 underline underline-offset-2"
                            >
                              MYP
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <PageNavigation
                  page={page}
                  pageSize={pageSize}
                  total={filtered.length}
                  pathname="/admin/examinations/results"
                  query={{ exam: selected.id, outcome: sp.outcome }}
                  label="candidate results"
                />
              </>
            )}
          </Section>
        </>
      )}
    </>
  );
}
