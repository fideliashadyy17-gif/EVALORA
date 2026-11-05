"use server";

import { audit, fint, fstr, requireSuperAdmin } from "@/lib/admin";
import { CURRICULUM_SOURCES, type CurriculumKey } from "@/lib/curriculum";
import { generateQuestions, normalizePrompt } from "@/lib/questionGeneration";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const CURRICULA: CurriculumKey[] = ["english", "beninese", "myp", "ap"];

/**
 * Template-based original question generation into the class-based bank.
 * Generated items are mathematically self-verifying (answers computed,
 * never guessed), deduplicated by prompt hash, stamped with curriculum
 * source references, and enter the review workflow as pending review —
 * they are NOT published until a teacher/administrator approves them.
 */
export async function generateQuestionBatch(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = fstr(formData, "organization_id", 60);
  const classId = fstr(formData, "class_id", 60);
  const curriculumRaw = String(formData.get("curriculum") ?? "english") as CurriculumKey;
  if (!CURRICULA.includes(curriculumRaw)) redirect("/admin/questions/generate?e=curriculum");
  const curriculum = curriculumRaw;
  const countRaw = fint(formData, "count") ?? 20;
  const count = [20, 25, 30, 35, 40].includes(countRaw) ? countRaw : 20;
  const stageRaw = String(formData.get("stage") ?? "standard");
  const stage = (["standard", "elimination", "semi_final", "grand_final"].includes(stageRaw) ? stageRaw : "standard") as
    | "standard" | "elimination" | "semi_final" | "grand_final";
  const back = `/admin/questions/generate?org=${orgId ?? ""}&class=${classId ?? ""}`;
  if (!orgId || !classId) redirect(`${back}&e=missing`);

  const { data: cls } = await admin
    .from("classes")
    .select("id, name, grade_order, level_band")
    .eq("id", classId!)
    .eq("organization_id", orgId!)
    .maybeSingle();
  if (!cls) redirect(`${back}&e=class`);

  // Both programme and mapping must belong to the selected class and school.
  const { data: programme } = await admin.from("curriculum_programmes")
    .select("id, name").eq("organization_id", orgId!).eq("key", curriculum)
    .eq("is_active", true).maybeSingle();
  if (!programme) redirect(`${back}&e=curriculum`);
  const { data: linked } = await admin.from("class_curricula")
    .select("course_label").eq("class_id", classId!).eq("programme_id", programme!.id).maybeSingle();
  if (!linked) redirect(`${back}&e=curriculum`);
  const courseLabel = fstr(formData, "course_label", 160) ?? linked!.course_label ?? programme!.name;

  const { data: mathSubject } = await admin
    .from("subjects")
    .select("id")
    .eq("organization_id", orgId!)
    .ilike("name", "%math%")
    .limit(1)
    .maybeSingle();

  const seed = `${orgId}:${classId}:${curriculum}:${crypto.randomUUID()}`;
  const result = generateQuestions({
    gradeOrder: cls!.grade_order ?? 5,
    curriculum,
    courseLabel: courseLabel ?? undefined,
    count,
    seed,
    stage,
  });

  const source = CURRICULUM_SOURCES[curriculum];
  let inserted = 0;
  let duplicates = 0;
  for (const q of result.questions) {
    const promptHash = createHash("sha256").update(normalizePrompt(q.prompt)).digest("hex");
    const { data, error } = await admin
      .from("questions")
      .insert({
        organization_id: orgId,
        class_id: classId,
        subject_id: mathSubject?.id ?? null,
        type: q.type,
        prompt: q.prompt,
        explanation: q.explanation,
        points: q.points,
        difficulty: q.difficulty,
        topic: q.topic,
        subtopic: q.subtopic,
        curriculum,
        curriculum_course: courseLabel,
        status: "pending_review",
        review_status: "draft",
        creation_method: "ai_generated",
        source_reference: source.reference,
        source_url: source.url,
        prompt_hash: promptHash,
        config: q.visual ? { visual: true } : {},
        generation_meta: {
          generator: "evalora-qgen-v1",
          family: q.family,
          visual: q.visual,
          stage,
          seed,
          validation: "computed-answer; plausible-distractor set; single-correct invariant unit-tested",
          source_note: source.note,
        },
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "23505") duplicates++;
      continue;
    }
    const { error: optError } = await admin.from("question_options").insert(
      q.options.map((o, i) => ({ question_id: data.id, label: o.label, is_correct: o.is_correct, position: i })),
    );
    if (optError) {
      await admin.from("questions").delete().eq("id", data.id);
      continue;
    }
    inserted++;
  }

  await audit(ctx, "question.ai_generated_batch", "classes", classId!, orgId, {
    curriculum, course: courseLabel, requested: count, inserted, duplicates, shortfall: count - inserted, stage,
  });
  revalidatePath("/admin/questions");
  redirect(
    `/admin/questions?org=${orgId}&class=${classId}&review=draft&ok=generated&n=${inserted}&dup=${duplicates}&short=${count - inserted}`,
  );
}
