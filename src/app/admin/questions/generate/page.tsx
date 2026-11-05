import { Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { CURRICULUM_SOURCES, GENERATION_COUNTS } from "@/lib/curriculum";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { Notice } from "../../ui";
import { generateQuestionBatch } from "./actions";

export const metadata: Metadata = { title: "Question Generation" };
export const dynamic = "force-dynamic";

interface SP { org?: string; class?: string; e?: string }

export default async function GenerateQuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin.from("organizations").select("id, name").order("name").limit(500);
  const orgId = sp.org && (orgs ?? []).some((o) => o.id === sp.org) ? sp.org : (orgs ?? [])[0]?.id ?? "";
  const { data: classes } = orgId
    ? await admin.from("classes").select("id, name, code, grade_order, level_band, status").eq("organization_id", orgId).order("grade_order").order("name")
    : { data: [] };
  const activeClasses = (classes ?? []).filter((c) => c.status === "active");
  const classId = sp.class && activeClasses.some((c) => c.id === sp.class) ? sp.class : activeClasses[0]?.id ?? "";
  const selectedClass = activeClasses.find((c) => c.id === classId);
  const { data: linkedProgrammes } = classId
    ? await admin.from("class_curricula").select("curriculum_programmes!inner(key, name, is_active, organization_id)").eq("class_id", classId).eq("curriculum_programmes.organization_id", orgId).eq("curriculum_programmes.is_active", true)
    : { data: [] };
  const programmes = (linkedProgrammes ?? []).flatMap((link) => {
    const p = link.curriculum_programmes as unknown as { key: string; name: string } | null;
    return p && ["english", "beninese", "myp", "ap"].includes(p.key) ? [p] : [];
  });

  const [approvedPool, pendingPool] = classId ? await Promise.all([
    admin.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("class_id", classId).eq("review_status", "approved"),
    admin.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("class_id", classId).in("review_status", ["draft", "reviewed"]),
  ]) : [{ count: null }, { count: null }];

  return (
    <>
      <PageTitle
        title="Question Generation"
        subtitle="Generate original, class- and curriculum-specific mathematics questions from parameterized templates. Generated items require teacher review before high-stakes use."
        action={<ButtonLink href="/admin/questions" variant="outline">Open Question Bank</ButtonLink>}
      />
      <Notice e={sp.e} messages={{ missing: "Choose a school and a class first.", class: "That class does not belong to the selected school.", curriculum: "Select an active curriculum linked to this class." }} />

      <Card className="mb-6 p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <Field label="School"><Select name="org" defaultValue={orgId}>{(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <Field label="Class"><Select name="class" defaultValue={classId}>{activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <div className="flex items-end"><Button type="submit" variant="outline">Load class</Button></div>
        </form>
      </Card>

      {selectedClass ? (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Generate for {selectedClass.name}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Approved pool: <strong>{approvedPool.count ?? "—"}</strong> · Awaiting review: <strong>{pendingPool.count ?? "—"}</strong>.
            Standard combined quiz = 10 questions from each of the class&apos;s two curricula (generate one batch per curriculum).
          </p>
          <form action={generateQuestionBatch} className="mt-4 grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="organization_id" value={orgId} />
            <input type="hidden" name="class_id" value={selectedClass.id} />
            <Field label="Curriculum">
              <Select name="curriculum">
                {programmes.length === 0 && <option value="">No supported curriculum linked</option>}
                {programmes.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Questions in this batch">
              <Select name="count">{GENERATION_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}</Select>
            </Field>
            <Field label="Target stage (difficulty profile)">
              <Select name="stage">
                <option value="standard">Standard quiz</option>
                <option value="elimination">Elimination examination</option>
                <option value="semi_final">Semi-final (harder)</option>
                <option value="grand_final">Grand final (hardest)</option>
              </Select>
            </Field>
            <Field label="Course label (optional override)" className="sm:col-span-2">
              <Input name="course_label" placeholder="e.g. MYP 3 Mathematics, AP Calculus AB — defaults to the class mapping" />
            </Field>
            <div className="flex items-end"><Button type="submit" variant="gold" disabled={programmes.length === 0}>Generate questions</Button></div>
          </form>
        </Card>
      ) : (
        <Card className="mb-6 p-8 text-center text-sm text-ink-soft">This school has no active classes yet. Create classes in <a className="underline" href={`/admin/classes?org=${orgId}`}>Class Management</a> first.</Card>
      )}

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">How generation &amp; review work</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink">
          <li>Topic families are selected for the class grade and curriculum; parameters are randomized from a recorded seed.</li>
          <li>The correct answer is <strong>computed</strong>, and distractors are built from common misconceptions — answers are never guessed.</li>
          <li>Duplicate prompts are rejected by a database-level prompt hash; any shortfall is reported, never padded with repeats.</li>
          <li>Questions arrive as <strong>Pending review</strong> with source references. Teachers edit, approve or reject each one in the Question Bank.</li>
          <li>Use only <strong>approved</strong> questions for finalized examinations and competitions; existing quiz editors do not enforce this automatically.</li>
        </ol>
        <h3 className="mt-5 text-sm font-semibold text-evergreen-950">Curriculum references used</h3>
        <ul className="mt-2 space-y-2 text-sm text-ink-soft">
          {Object.entries(CURRICULUM_SOURCES).map(([key, s]) => (
            <li key={key}>
              <a className="font-medium text-evergreen-800 underline" href={s.url} target="_blank" rel="noreferrer">{s.reference}</a>
              <span className="block">{s.note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
