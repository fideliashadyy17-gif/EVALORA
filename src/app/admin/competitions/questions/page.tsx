import { Badge, Button, ButtonLink, Card, PageTitle, Select } from "@/components/ui";
import { RichContent } from "@/components/RichContent";
import { requireSuperAdmin } from "@/lib/auth";
import type { RichDoc } from "@/lib/content";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";
import { StatusBadge } from "../../ui";

export const metadata: Metadata = { title: "Competition questions" };
export const dynamic = "force-dynamic";

interface OptionRow {
  id: string;
  question_id: string;
  label: string;
  content_doc: RichDoc | null;
  is_correct: boolean;
  position: number;
}

export default async function CompetitionQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: comps } = await admin
    .from("competitions")
    .select("id, title, status, organization_id, quiz_id, organizations(name), quizzes(id, title, status, updated_at)")
    .order("updated_at", { ascending: false })
    .limit(300);
  const selected = (sp.comp && (comps ?? []).find((c) => c.id === sp.comp)) || (comps ?? [])[0];
  const quiz = selected?.quizzes as unknown as { id: string; title: string; status: string; updated_at: string } | null;

  let links: Record<string, unknown>[] = [];
  let optionsByQuestion = new Map<string, OptionRow[]>();
  if (selected?.quiz_id) {
    const { data } = await admin
      .from("quiz_questions")
      .select("id, position, points, time_limit_seconds, questions(*, question_categories(name))")
      .eq("quiz_id", selected.quiz_id)
      .order("position")
      .limit(500);
    links = (data ?? []) as unknown as Record<string, unknown>[];
    const qids = links
      .map((l) => (l.questions as { id?: string } | null)?.id)
      .filter((v): v is string => Boolean(v));
    if (qids.length) {
      const { data: opts } = await admin
        .from("question_options")
        .select("id, question_id, label, content_doc, is_correct, position")
        .in("question_id", qids)
        .order("position");
      optionsByQuestion = new Map();
      for (const o of (opts ?? []) as OptionRow[]) {
        const list = optionsByQuestion.get(o.question_id) ?? [];
        list.push(o);
        optionsByQuestion.set(o.question_id, list);
      }
    }
  }

  return (
    <>
      <PageTitle
        title="Competition questions"
        subtitle="Competition content is the attached quiz. Every prompt, option and worked solution uses the same structured mathematical editor and renderer as the Question Bank and examinations."
        action={selected ? <ButtonLink href={`/admin/questions/new?org=${selected.organization_id}`} variant="gold">+ Create question</ButtonLink> : undefined}
      />

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No competitions exist yet.</p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <label className="block min-w-[320px] flex-1">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Competition</span>
              <Select name="comp" defaultValue={selected.id}>
                {(comps ?? []).map((c) => <option key={c.id} value={c.id}>{c.title} ({c.status})</option>)}
              </Select>
            </label>
            <Button type="submit" variant="outline">View questions</Button>
          </form>

          <Card className="mb-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-evergreen-950">{selected.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Host: {(selected.organizations as unknown as { name?: string } | null)?.name} · <StatusBadge status={selected.status} />
                </p>
                {quiz ? (
                  <p className="mt-2 text-sm">Attached quiz: <strong>{quiz.title}</strong> ({quiz.status}, updated {fmtDate(quiz.updated_at)}) · {links.length} question{links.length === 1 ? "" : "s"}</p>
                ) : (
                  <p className="mt-2 text-sm text-amber-800">No quiz is attached. Attach one in Competition Settings before participants can play.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/admin/competitions/${selected.id}?tab=settings`} variant="outline">Attach / change quiz</ButtonLink>
                <ButtonLink href={`/admin/questions?org=${selected.organization_id}`} variant="outline">Question Bank</ButtonLink>
                {quiz && (
                  <form action={enterOrgWorkspace}>
                    <input type="hidden" name="organization_id" value={selected.organization_id} />
                    <input type="hidden" name="next" value={`/dashboard/quizzes/${quiz.id}`} />
                    <Button type="submit" variant="gold">Add / reorder in Quiz Builder</Button>
                  </form>
                )}
              </div>
            </div>
          </Card>

          {!quiz ? (
            <p className="rounded-2xl border border-dashed border-amber-700/40 bg-amber-50 px-6 py-10 text-center text-sm text-amber-900">
              This competition has no question set yet. Create questions in the Question Bank, build a quiz, then attach it in Settings.
            </p>
          ) : links.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">The attached quiz has no questions yet.</p>
          ) : (
            <div className="space-y-4">
              {links.map((link, index) => {
                const q = link.questions as Record<string, unknown> | null;
                if (!q) return null;
                const options = optionsByQuestion.get(String(q.id)) ?? [];
                const explanationPresent = Boolean(String(q.explanation ?? "").trim() || q.explanation_doc);
                return (
                  <Card key={String(link.id)} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-bold text-evergreen-800">Q{index + 1}</span>
                        <Badge tone="gray">{String(q.type).replace(/_/g, " ")}</Badge>
                        <Badge tone={q.status === "published" ? "green" : "amber"}>{String(q.status)}</Badge>
                        <span className="text-xs text-ink-soft">
                          {Number(link.points ?? q.points)} mark{Number(link.points ?? q.points) === 1 ? "" : "s"}
                          {link.time_limit_seconds ? ` · ${Number(link.time_limit_seconds)} sec override` : ""}
                          {q.topic ? ` · ${String(q.topic)}` : ""}
                        </span>
                      </div>
                      <Link href={`/admin/questions/${q.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                        Edit with math editor →
                      </Link>
                    </div>

                    <div className="mt-3 text-base text-evergreen-950">
                      <RichContent doc={(q.prompt_doc as RichDoc | null) ?? null} text={String(q.prompt ?? "")} />
                    </div>

                    {options.length > 0 && (
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {options.map((o, i) => (
                          <div key={o.id} className={`rounded-xl border px-3 py-2 text-sm ${o.is_correct ? "border-evergreen-500 bg-evergreen-50" : "border-evergreen-900/15 bg-white"}`}>
                            <span className="mr-2 font-display font-bold">{String.fromCharCode(65 + i)}.</span>
                            <span className="inline-block align-top"><RichContent doc={o.content_doc} text={o.label} /></span>
                            {o.is_correct && <span className="ml-2 text-xs font-semibold text-evergreen-700">Correct</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="mt-3 text-xs text-ink-soft">
                      Worked solution: {explanationPresent ? "present (shown only after answering)" : "missing — add it in the editor"} · Difficulty {String(q.difficulty ?? "—")}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
