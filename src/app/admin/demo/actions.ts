"use server";

import { audit, FLASH_COOKIE, fstr, requireSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Admin = ReturnType<typeof createAdminClient>;

async function demoOrg(admin: Admin) {
  const { data } = await admin.from("organizations").select("id, name, slug").eq("is_demo", true).maybeSingle();
  return data;
}

/**
 * Reset ONLY the DEMO school's sample activity (live sessions, answers,
 * exam attempts) and rebuild the labelled sample results + a fresh
 * lobby. Core structure, users, questions — and every real tenant —
 * are untouched. Every query is scoped to the is_demo organization.
 */
export async function resetDemoActivity(formData: FormData) {
  const ctx = await requireSuperAdmin();
  if (formData.get("confirm") !== "on") redirect("/admin/demo?e=confirm");
  const admin = createAdminClient();
  const demo = await demoOrg(admin);
  if (!demo) redirect("/admin/demo?e=missing");
  const orgId = demo!.id;

  const [{ data: quizzes }, { data: students }, { data: exams }, { data: competitions }] = await Promise.all([
    admin.from("quizzes").select("id, title").eq("organization_id", orgId).order("created_at"),
    admin.from("students").select("id, full_name, student_ref, user_id").eq("organization_id", orgId).order("student_ref").limit(6),
    admin.from("exams").select("id, quiz_id, title").eq("organization_id", orgId).order("created_at"),
    admin.from("competitions").select("id, quiz_id").eq("organization_id", orgId).order("created_at"),
  ]);
  const quiz = (quizzes ?? [])[0];
  if (!quiz || (students ?? []).length === 0) redirect("/admin/demo?e=missing");

  // Clear demo activity (cascades to participants/answers/attempts).
  await admin.from("quiz_sessions").delete().eq("organization_id", orgId);
  for (const exam of exams ?? []) {
    await admin.from("exam_attempts").delete().eq("exam_id", exam.id);
    await admin.from("exam_candidates").update({ status: "registered" }).eq("exam_id", exam.id);
  }

  const { data: quizQuestions } = await admin.from("quiz_questions")
    .select("id, question_id, position, questions(points)").eq("quiz_id", quiz!.id).order("position");
  const questionIds = (quizQuestions ?? []).map((q) => q.question_id);
  const { data: options } = await admin.from("question_options")
    .select("id, question_id, is_correct, position").in("question_id", questionIds).order("position");
  const correctOption = new Map<string, string>();
  const wrongOption = new Map<string, string>();
  for (const o of options ?? []) {
    if (o.is_correct && !correctOption.has(o.question_id)) correctOption.set(o.question_id, o.id);
    if (!o.is_correct && !wrongOption.has(o.question_id)) wrongOption.set(o.question_id, o.id);
  }
  const pointsOf = (qq: NonNullable<typeof quizQuestions>[number]) =>
    Number((qq.questions as unknown as { points: number } | null)?.points ?? 1);

  // Fresh lobby (launchable) + labelled sample completed session.
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const { data: sample } = await admin.from("quiz_sessions").insert({
    quiz_id: quiz!.id, organization_id: orgId, host_id: ctx.user.id,
    join_code: `DEMO${suffix}`, title: "DEMO sample completed session (fictional results)",
    mode: "synchronized", status: "ended", current_question_index: Math.max(0, (quizQuestions ?? []).length - 1),
    settings: { show_leaderboard: true, max_participants: 200, demo: true, sample: true },
    ended_at: new Date().toISOString(),
  }).select("id").single();
  const { data: lobby } = await admin.from("quiz_sessions").insert({
    quiz_id: quiz!.id, organization_id: orgId, host_id: ctx.user.id,
    join_code: `LIVE${suffix}`, title: "DEMO live competition — lobby (ready to launch)",
    mode: "synchronized", status: "lobby", current_question_index: -1,
    settings: { show_leaderboard: true, max_participants: 200, demo: true },
  }).select("id").single();

  if (sample) {
    const patterns = [7, 6, 5, 5, 4, 3];
    for (const [idx, student] of (students ?? []).entries()) {
      const correctCount = Math.min(patterns[idx] ?? 3, (quizQuestions ?? []).length);
      const { data: participant } = await admin.from("session_participants").insert({
        session_id: sample.id, display_name: `${student.full_name} (DEMO)`,
        participant_ref: student.student_ref, user_id: student.user_id,
        score: 0, status: "finished", current_index: (quizQuestions ?? []).length,
      }).select("id").single();
      if (!participant) continue;
      let score = 0;
      const answers = (quizQuestions ?? []).map((qq) => {
        const isCorrect = qq.position < correctCount;
        const pts = isCorrect ? pointsOf(qq) : 0;
        score += pts;
        return {
          session_id: sample.id, participant_id: participant.id, quiz_question_id: qq.id,
          question_id: qq.question_id,
          answer: { option_id: isCorrect ? correctOption.get(qq.question_id) : wrongOption.get(qq.question_id) },
          is_correct: isCorrect, points_awarded: pts, response_ms: 4000 + qq.position * 150,
        };
      });
      await admin.from("participant_answers").insert(answers);
      await admin.from("session_participants").update({ score }).eq("id", participant.id);
    }
  }

  for (const comp of competitions ?? []) {
    await admin.from("competitions").update({ status: "published", session_id: lobby?.id ?? null, results_published: true }).eq("id", comp.id).eq("organization_id", orgId);
  }

  // Rebuild one labelled sample exam attempt.
  const exam = (exams ?? [])[0];
  if (exam) {
    const { data: candidates } = await admin.from("exam_candidates").select("id").eq("exam_id", exam.id).order("created_at").limit(1);
    const candidate = (candidates ?? [])[0];
    if (candidate && (quizQuestions ?? []).length) {
      const maxScore = (quizQuestions ?? []).reduce((sum, qq) => sum + pointsOf(qq), 0);
      const correctCount = Math.min(5, (quizQuestions ?? []).length);
      const score = (quizQuestions ?? []).slice(0, correctCount).reduce((sum, qq) => sum + pointsOf(qq), 0);
      const { data: attempt } = await admin.from("exam_attempts").insert({
        exam_id: exam.id, candidate_id: candidate.id, status: "marked",
        score, max_score: maxScore, submitted_at: new Date().toISOString(),
      }).select("id").single();
      if (attempt) {
        await admin.from("exam_answers").insert((quizQuestions ?? []).map((qq) => ({
          attempt_id: attempt.id, question_id: qq.question_id, quiz_question_id: qq.id,
          answer: { option_id: qq.position < correctCount ? correctOption.get(qq.question_id) : wrongOption.get(qq.question_id) },
          is_correct: qq.position < correctCount,
          points_awarded: qq.position < correctCount ? pointsOf(qq) : 0,
          marker_note: "DEMO sample marked answer.",
        })));
        await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", candidate.id);
      }
    }
  }

  await audit(ctx, "organization.demo_reset", "organizations", orgId, orgId, { lobby: lobby?.id ?? null, sample: sample?.id ?? null });
  revalidatePath("/admin/demo");
  redirect("/admin/demo?ok=reset");
}

/** One-time visible temporary password for a DEMO account (Super Admin). */
export async function generateDemoLogin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const demo = await demoOrg(admin);
  if (!demo) redirect("/admin/demo?e=missing");
  const userId = fstr(formData, "user_id", 60);
  if (!userId) redirect("/admin/demo?e=user");
  const { data: member } = await admin.from("organization_members")
    .select("user_id, profiles(email, full_name)")
    .eq("organization_id", demo!.id).eq("user_id", userId!).maybeSingle();
  if (!member) redirect("/admin/demo?e=user");
  const profile = member!.profiles as unknown as { email: string; full_name: string | null } | null;
  const tempPassword = `Demo!${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}a9`;
  const { error } = await admin.auth.admin.updateUserById(userId!, { password: tempPassword });
  if (error) redirect("/admin/demo?e=login");
  await audit(ctx, "organization.demo_login_generated", "profiles", userId!, demo!.id, { email: profile?.email ?? null });
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(
    `DEMO login for ${profile?.full_name ?? "user"} (${profile?.email}) — one-time password: ${tempPassword} — shown once. Sign in on the DEMO portal, then change it if you keep testing as this user.`,
  ), { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 180 });
  redirect("/admin/demo?ok=login");
}

/** Record a source-migration run/audit note (execution happens via the
 *  audited connector/script path — never by pasting credentials here). */
export async function recordMigrationRun(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const demo = await demoOrg(admin);
  const sourceRef = fstr(formData, "source_project_ref", 80);
  if (!sourceRef) redirect("/admin/demo?e=source");
  const statusRaw = String(formData.get("status") ?? "partial");
  const status = ["running", "completed", "failed", "partial"].includes(statusRaw) ? statusRaw : "partial";
  const { data } = await admin.from("migration_runs").insert({
    source_project_ref: sourceRef,
    source_name: fstr(formData, "source_name", 160),
    destination_organization_id: demo?.id ?? null,
    status, started_by: ctx.user.id,
    summary: { note: fstr(formData, "note", 2000), recorded_from: "admin_demo_page" },
    completed_at: status === "running" ? null : new Date().toISOString(),
  }).select("id").single();
  if (data) await audit(ctx, "migration.run_recorded", "migration_runs", data.id, demo?.id ?? null, { sourceRef, status });
  redirect("/admin/demo?ok=migration_recorded");
}
