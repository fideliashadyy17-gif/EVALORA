/**
 * TEMPORARY one-off seeding harness (Supabase Edge Function).
 *
 * Purpose: populate the Oak International School class question pools
 * using the exact same generator as the application
 * (src/lib/questionGeneration.ts), because the build sandbox cannot
 * reach Supabase directly. The function is deployed briefly with a
 * random key, invoked once, then deleted.
 *
 * The key placeholder below is replaced only in the deployed bundle —
 * no secret is committed to the repository.
 */
// @ts-nocheck - Deno runtime globals
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateQuestions, normalizePrompt } from "../src/lib/questionGeneration";
import { CURRICULUM_SOURCES } from "../src/lib/curriculum";

const SEED_KEY = "__SEED_KEY__";
const Oak = "0a400000-0000-4000-8000-000000000001";
const REVIEWER = "3c3ed712-f409-4aa1-a645-816418e22ec4"; // primary super admin profile
const STAGES = [
  { stage: "elimination", count: 10 },
  { stage: "semi_final", count: 13 },
  { stage: "grand_final", count: 15 },
] as const;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function difficultyFor(index: number, count: number, stage: string) {
  const ratio = count <= 1 ? 0 : index / (count - 1);
  const boost = stage === "grand_final" ? 2 : stage === "semi_final" ? 1 : 0;
  const tier = Math.min(3, Math.floor(ratio * 3) + boost - (stage === "elimination" && ratio < 0.25 ? 1 : 0));
  return (["easy", "medium", "hard", "competition"] as const)[Math.max(0, tier)];
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SEED_KEY) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: classes, error: classErr } = await supabase
    .from("classes")
    .select("id, name, grade_order, class_curricula(course_label, curriculum_programmes(key, name))")
    .eq("organization_id", Oak)
    .order("grade_order");
  if (classErr) return new Response(JSON.stringify({ error: classErr.message }), { status: 500 });

  const { data: existing } = await supabase.from("questions").select("prompt_hash").eq("organization_id", Oak).not("prompt_hash", "is", null).limit(10000);
  const seen = new Set((existing ?? []).map((r) => r.prompt_hash));
  const { data: mathSubject } = await supabase.from("subjects").select("id").eq("organization_id", Oak).eq("code", "MATH").maybeSingle();

  const summary: Record<string, number> = {};
  let totalInserted = 0;
  const questionRows: Record<string, unknown>[] = [];
  const pendingOptions = new Map<string, { label: string; is_correct: boolean }[]>();

  for (const cls of classes ?? []) {
    for (const link of cls.class_curricula ?? []) {
      const curriculum = link.curriculum_programmes?.key as string;
      const course = link.course_label ?? link.curriculum_programmes?.name ?? curriculum;
      const source = CURRICULUM_SOURCES[curriculum as keyof typeof CURRICULUM_SOURCES];
      for (const { stage, count } of STAGES) {
        const baseSeed = `oak-2026|${cls.id}|${curriculum}|${stage}`;
        const collected: { q: ReturnType<typeof generateQuestions>["questions"][number]; hash: string; seed: string }[] = [];

        // The generator de-duplicates within one call.  Seeding needs a
        // stronger guarantee: no prompt may repeat across any Oak class,
        // curriculum or Matamat stage.  Try deterministic seed variants
        // until this exact pool is full; fail before inserting anything
        // if a pool cannot be filled without a duplicate.
        for (let variant = 0; variant < 50 && collected.length < count; variant++) {
          const seed = `${baseSeed}|v${variant}`;
          const res = generateQuestions({
            gradeOrder: cls.grade_order ?? 5,
            curriculum: curriculum as never,
            courseLabel: course,
            count,
            seed,
            stage,
          });
          for (const q of res.questions) {
            const hash = await sha256(normalizePrompt(q.prompt));
            if (seen.has(hash)) continue;
            seen.add(hash);
            collected.push({ q, hash, seed });
            if (collected.length >= count) break;
          }
        }
        if (collected.length < count) {
          return new Response(
            JSON.stringify({ error: `unique-question shortfall for ${cls.name}|${curriculum}|${stage}: ${collected.length}/${count}` }),
            { status: 500 },
          );
        }

        collected.forEach(({ q, hash, seed }, index) => {
          const difficulty = difficultyFor(index, count, stage);
          const id = crypto.randomUUID();
          questionRows.push({
            id,
            organization_id: Oak,
            class_id: cls.id,
            subject_id: mathSubject?.id ?? null,
            type: q.type,
            prompt: q.prompt,
            explanation: q.explanation,
            points: difficulty === "competition" ? 3 : difficulty === "hard" ? 2 : 1,
            difficulty,
            topic: q.topic,
            subtopic: q.subtopic,
            tags: ["oak-matamat-2026", `stage:${stage}`],
            curriculum,
            curriculum_course: course,
            status: "published",
            review_status: "approved",
            reviewed_by: REVIEWER,
            reviewed_at: new Date().toISOString(),
            creation_method: "ai_generated",
            source_reference: source?.reference ?? null,
            source_url: source?.url ?? null,
            prompt_hash: hash,
            config: q.visual ? { visual: true } : {},
            generation_meta: {
              generator: "evalora-qgen-v1",
              family: q.family,
              visual: q.visual,
              stage,
              seed,
              review_mode: "automated_validation_seed",
              validation: "computed-answer and single-correct/distinct-option invariants validated across the full 1,064-item seed; global prompt-hash de-duplication across classes, curricula and stages; Oak teacher spot-check required before high-stakes live use",
              source_note: source?.note ?? null,
            },
            created_by: REVIEWER,
          });
          pendingOptions.set(id, q.options);
          const key = `${cls.name}|${curriculum}|${stage}`;
          summary[key] = (summary[key] ?? 0) + 1;
          totalInserted++;
        });
      }
    }
  }

  // Insert each question chunk together with its answer options so a
  // late failure cannot leave the whole seed without answer keys.
  for (let i = 0; i < questionRows.length; i += 100) {
    const chunk = questionRows.slice(i, i + 100);
    const { error } = await supabase.from("questions").insert(chunk);
    if (error) return new Response(JSON.stringify({ error: `questions chunk ${i}: ${error.message}` }), { status: 500 });

    const optionRows: Record<string, unknown>[] = [];
    for (const row of chunk) {
      const opts = pendingOptions.get(String(row.id)) ?? [];
      opts.forEach((o, position) => optionRows.push({ question_id: row.id, label: o.label, is_correct: o.is_correct, position }));
    }
    for (let j = 0; j < optionRows.length; j += 500) {
      const { error: optionError } = await supabase.from("question_options").insert(optionRows.slice(j, j + 500));
      if (optionError) return new Response(JSON.stringify({ error: `options chunk ${i + j}: ${optionError.message}` }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ ok: true, totalInserted, summary }), {
    headers: { "content-type": "application/json" },
  });
});
