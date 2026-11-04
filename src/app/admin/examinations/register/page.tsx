import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { CheckCircle2, Clock3, KeyRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CsvImport } from "../../CsvImport";
import { Flash, Notice, StatusBadge, Table } from "../../ui";
import { registerClassForExam } from "../../actions/academics";
import { addExamCandidateAsAdmin, importExamCandidatesAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Candidate registration" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  created: "Examination created. Now register its candidates below.",
  candidate_added: "Candidate registered with a unique personal access code.",
  candidates_added: "Class registration completed. New candidates and codes are listed below.",
  import_done: "Candidate import finished — see the report above.",
  name: "Candidate full name is required.",
  email: "That email address is invalid.",
  empty_csv: "No candidate rows were found.",
  too_many: "Import is limited to 1,000 candidates per file.",
  failed: "Candidate registration failed.",
  exam: "That examination no longer exists.",
};

const TEMPLATE = toCsv([["full_name", "email", "candidate_ref"]]);

export default async function CandidateRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: exams } = await admin
    .from("exams")
    .select("id, title, status, organization_id, access_code, duration_minutes, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const selected =
    (sp.exam && (exams ?? []).find((e) => e.id === sp.exam)) ||
    (exams ?? []).find((e) => ["draft", "scheduled", "open"].includes(e.status)) ||
    (exams ?? [])[0];

  let candidates: Record<string, unknown>[] = [];
  let classes: { id: string; name: string }[] = [];
  if (selected) {
    const [{ data: c }, { data: cl }] = await Promise.all([
      admin.from("exam_candidates").select("*, exam_attempts(status)").eq("exam_id", selected.id).order("full_name").limit(1000),
      admin.from("classes").select("id, name").eq("organization_id", selected.organization_id).order("name").limit(500),
    ]);
    candidates = (c ?? []) as Record<string, unknown>[];
    classes = cl ?? [];
  }

  const back = selected ? `/admin/examinations/register?exam=${selected.id}` : "/admin/examinations/register";
  const orgName = selected ? ((selected.organizations as unknown as { name?: string } | null)?.name ?? "Organization") : "";
  const submitted = candidates.filter((c) => c.status === "submitted").length;
  const inProgress = candidates.filter((c) => c.status === "in_progress").length;

  return (
    <>
      <PageTitle
        title="Candidate registration"
        subtitle="Register candidates individually, import a CSV roster, or enroll a whole class. Every candidate receives a unique personal code tied to this one examination."
        action={<div className="flex flex-wrap gap-2"><ExportButton filename="exam-candidate-import-template.csv" csv={TEMPLATE} label="Download template" /><ButtonLink href="/admin/examinations/candidates" variant="outline">All candidates</ButtonLink></div>}
      />

      <Flash />
      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No examinations exist yet. <Link href="/admin/examinations/new" className="font-semibold text-evergreen-700 underline underline-offset-2">Create one first</Link>.
        </p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <label className="block min-w-[320px] flex-1">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Examination</span>
              <Select name="exam" defaultValue={selected.id}>
                {(exams ?? []).map((e) => <option key={e.id} value={e.id}>{e.title} — {(e.organizations as unknown as { name?: string } | null)?.name} ({e.status})</option>)}
              </Select>
            </label>
            <Button type="submit" variant="outline">Open registration desk</Button>
          </form>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Registered candidates" value={candidates.length} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Awaiting start" value={candidates.length - inProgress - submitted} icon={<KeyRound className="h-5 w-5" />} />
            <StatCard label="In progress" value={inProgress} icon={<Clock3 className="h-5 w-5" />} />
            <StatCard label="Submitted" value={submitted} icon={<CheckCircle2 className="h-5 w-5" />} />
          </div>

          <Card className="mb-6 p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">{selected.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {orgName} · {selected.duration_minutes} minutes · Candidates enter at <strong>/exam-access</strong> using exam code{" "}
              <span className="font-mono font-bold text-evergreen-900">{selected.access_code}</span> plus their personal code below.
            </p>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Register one candidate</h2>
              <form action={addExamCandidateAsAdmin} className="mt-4 space-y-4">
                <input type="hidden" name="exam_id" value={selected.id} />
                <input type="hidden" name="back" value={back} />
                <Field label="Full name *"><Input name="full_name" required maxLength={160} placeholder="Candidate full name" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email (optional)"><Input name="email" type="email" maxLength={180} placeholder="candidate@example.com" /></Field>
                  <Field label="Reference / class (optional)"><Input name="candidate_ref" maxLength={80} placeholder="STU-001 or Grade 9A" /></Field>
                </div>
                <Button type="submit" variant="gold">Register & generate code</Button>
              </form>

              <div className="mt-8 border-t border-evergreen-900/10 pt-6">
                <h3 className="font-display font-semibold text-evergreen-950">Register an entire class</h3>
                <p className="mt-1 text-sm text-ink-soft">Uses active students in a class belonging to {orgName}; already-registered students are skipped.</p>
                {classes.length === 0 ? (
                  <p className="mt-3 text-sm text-amber-800">No classes exist for this organization yet.</p>
                ) : (
                  <form action={registerClassForExam} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="exam_id" value={selected.id} />
                    <input type="hidden" name="back" value={back} />
                    <div className="min-w-[220px] flex-1">
                      <Select name="class_id" required aria-label="Class">
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </div>
                    <Button type="submit" variant="outline">Register class</Button>
                  </form>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Bulk candidate import</h2>
              <p className="mb-4 mt-1 text-sm text-ink-soft">
                Use fields <strong>full_name,email,candidate_ref</strong>. An Excel sheet can be saved as CSV and uploaded here.
                Duplicate emails/references for this examination are skipped and reported.
              </p>
              <CsvImport action={importExamCandidatesAsAdmin} label="Candidates CSV" template="full_name,email,candidate_ref">
                <input type="hidden" name="exam_id" value={selected.id} />
                <input type="hidden" name="back" value={back} />
              </CsvImport>
            </Card>
          </div>

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Candidate register & personal codes</h2>
            <div className="mt-3">
              {candidates.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No candidates registered for this examination yet.</p>
              ) : (
                <Table head={["Candidate", "Personal code", "Reference", "Status", "Registered", "Manage"]}>
                  {candidates.map((c) => (
                    <tr key={String(c.id)}>
                      <td><span className="font-medium">{String(c.full_name)}</span><span className="block text-xs text-ink-soft">{String(c.email ?? "No email")}</span></td>
                      <td className="font-mono font-bold tracking-wider">{String(c.access_code)}</td>
                      <td className="text-ink-soft">{String(c.candidate_ref ?? "—")}</td>
                      <td><StatusBadge status={String(c.status)} /></td>
                      <td className="text-ink-soft">{fmtDateTime(String(c.created_at))}</td>
                      <td><Link href={`/admin/examinations/candidates?exam=${selected.id}`} className="font-medium text-evergreen-700 hover:underline">Candidate center →</Link></td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
