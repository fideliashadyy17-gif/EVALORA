"use server";

import { audit, fdate, fint, FLASH_COOKIE, fstr, requireSuperAdmin } from "@/lib/admin";
import { ADMIN_ORG_COOKIE } from "@/lib/auth";
import { COMPETITION_FORMATS, COMPETITION_STATUSES } from "@/lib/brand";
import { parseCsvRecords } from "@/lib/csv";
import { createAdminClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Admin = ReturnType<typeof createAdminClient>;
const FORMATS = COMPETITION_FORMATS.map((f) => f.value) as readonly string[];
const STATUSES = COMPETITION_STATUSES as readonly string[];

/**
 * Codes share one public namespace with live session join codes:
 * a competition code must never collide with either table.
 */
async function codeTaken(admin: Admin, code: string, exceptCodeId?: string): Promise<boolean> {
  const [{ data: s }, { data: c }] = await Promise.all([
    admin.from("quiz_sessions").select("id").eq("join_code", code).maybeSingle(),
    admin.from("competition_access_codes").select("id").eq("code", code).maybeSingle(),
  ]);
  if (s) return true;
  if (c && c.id !== exceptCodeId) return true;
  return false;
}

async function freshCode(admin: Admin, len = 6): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = genCode(len);
    if (!(await codeTaken(admin, code))) return code;
  }
  return genCode(8);
}

function competitionPayload(formData: FormData) {
  const formatRaw = String(formData.get("format") ?? "live_synchronous");
  const visibilityRaw = String(formData.get("visibility") ?? "private");
  return {
    title: fstr(formData, "title", 200),
    description: fstr(formData, "description", 2000),
    category: fstr(formData, "category", 80) ?? "general",
    format: FORMATS.includes(formatRaw) ? formatRaw : "live_synchronous",
    target_audience: fstr(formData, "target_audience", 200),
    education_level: fstr(formData, "education_level", 120),
    registration_opens_at: fdate(formData, "registration_opens_at"),
    registration_closes_at: fdate(formData, "registration_closes_at"),
    starts_at: fdate(formData, "starts_at"),
    ends_at: fdate(formData, "ends_at"),
    duration_minutes: fint(formData, "duration_minutes"),
    max_participants: fint(formData, "max_participants"),
    visibility: ["public", "private", "unlisted"].includes(visibilityRaw) ? visibilityRaw : "private",
    instructions: fstr(formData, "instructions", 4000),
    rules: fstr(formData, "rules", 4000),
    quiz_id: fstr(formData, "quiz_id", 60),
    scoring: {
      points_per_correct: fint(formData, "scoring_points") ?? 100,
      time_bonus: formData.get("scoring_time_bonus") === "on",
      negative_marking: formData.get("scoring_negative") === "on",
      show_leaderboard: formData.get("scoring_leaderboard") !== "off",
    },
    updated_at: new Date().toISOString(),
  };
}

export async function createCompetition(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = fstr(formData, "organization_id", 60);
  const payload = competitionPayload(formData);
  if (!payload.title) redirect("/admin/competitions/new?e=title");
  if (!orgId) redirect("/admin/competitions/new?e=org");
  if (payload.quiz_id) {
    const { data: q } = await admin.from("quizzes").select("organization_id").eq("id", payload.quiz_id).maybeSingle();
    if (!q || q.organization_id !== orgId) redirect("/admin/competitions/new?e=quiz_org");
  }
  const statusRaw = String(formData.get("status") ?? "draft");

  const { data, error } = await admin
    .from("competitions")
    .insert({
      ...payload,
      organization_id: orgId,
      status: STATUSES.includes(statusRaw) ? statusRaw : "draft",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) redirect("/admin/competitions/new?e=failed");

  // Every competition starts with one shareable access code.
  const code = await freshCode(admin);
  await admin.from("competition_access_codes").insert({
    competition_id: data!.id, code, label: "General admission", created_by: ctx.user.id,
  });
  await audit(ctx, "competition.created", "competitions", data!.id, orgId, { title: payload.title });
  revalidatePath("/admin/competitions");
  redirect(`/admin/competitions/${data!.id}?ok=created`);
}

export async function updateCompetition(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const payload = competitionPayload(formData);
  if (!payload.title) redirect(`/admin/competitions/${id}?tab=settings&e=title`);
  const { data: comp0 } = await admin.from("competitions").select("organization_id").eq("id", id).maybeSingle();
  if (payload.quiz_id && comp0) {
    const { data: q } = await admin.from("quizzes").select("organization_id").eq("id", payload.quiz_id).maybeSingle();
    if (!q || q.organization_id !== comp0.organization_id) redirect(`/admin/competitions/${id}?tab=settings&e=quiz_org`);
  }
  await admin.from("competitions").update(payload).eq("id", id);
  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", id).maybeSingle();
  await audit(ctx, "competition.updated", "competitions", id, comp?.organization_id);
  revalidatePath(`/admin/competitions/${id}`);
  redirect(`/admin/competitions/${id}?tab=settings&ok=saved`);
}

export async function setCompetitionStatus(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!STATUSES.includes(status)) redirect(`/admin/competitions/${id}?e=status`);
  const { data: comp } = await admin
    .from("competitions")
    .select("organization_id, session_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!comp) redirect("/admin/competitions");

  // Keep the linked live session coherent with competition lifecycle.
  if (comp!.session_id) {
    if (status === "ended" || status === "cancelled" || status === "archived") {
      await admin.from("quiz_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", comp!.session_id).neq("status", "ended");
    } else if (status === "paused") {
      await admin.from("quiz_sessions").update({ status: "paused" }).eq("id", comp!.session_id).eq("status", "live");
    } else if (status === "live") {
      await admin.from("quiz_sessions").update({ status: "live" }).eq("id", comp!.session_id).eq("status", "paused");
    }
  }
  await admin.from("competitions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  await audit(ctx, `competition.status_${status}`, "competitions", id, comp!.organization_id);
  revalidatePath(`/admin/competitions/${id}`);
  redirect(`/admin/competitions/${id}?ok=status_${status}`);
}

export async function duplicateCompetition(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const { data: comp } = await admin.from("competitions").select("*").eq("id", id).maybeSingle();
  if (!comp) redirect("/admin/competitions");
  const { created_at: _c, updated_at: _u, id: _i, session_id: _s, ...rest } = comp!;
  const { data, error } = await admin
    .from("competitions")
    .insert({
      ...rest,
      title: `${comp!.title} (copy)`,
      status: "draft",
      results_published: false,
      session_id: null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/competitions/${id}?e=duplicate_failed`);
  const code = await freshCode(admin);
  await admin.from("competition_access_codes").insert({
    competition_id: data!.id, code, label: "General admission", created_by: ctx.user.id,
  });
  await audit(ctx, "competition.duplicated", "competitions", data!.id, comp!.organization_id, { from: id });
  redirect(`/admin/competitions/${data!.id}?ok=duplicated`);
}

export async function deleteCompetition(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect(`/admin/competitions/${id}?tab=settings&e=confirm`);
  const { data: comp } = await admin
    .from("competitions")
    .select("title, organization_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!comp) redirect("/admin/competitions");
  if (comp!.status === "live" || comp!.status === "paused") {
    redirect(`/admin/competitions/${id}?tab=settings&e=live_delete`);
  }
  await audit(ctx, "competition.deleted", "competitions", id, comp!.organization_id, { title: comp!.title });
  await admin.from("competitions").delete().eq("id", id);
  revalidatePath("/admin/competitions");
  redirect("/admin/competitions?ok=deleted");
}

/**
 * Start (or re-open) the live session behind a competition and hand
 * the Super Admin over to the host console inside that workspace.
 */
export async function startCompetitionSession(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const { data: comp } = await admin.from("competitions").select("*").eq("id", id).maybeSingle();
  if (!comp) redirect("/admin/competitions");
  if (!comp!.quiz_id) redirect(`/admin/competitions/${id}?e=no_quiz`);

  const { count: qCount } = await admin
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", comp!.quiz_id);
  if (!qCount) redirect(`/admin/competitions/${id}?e=no_questions`);

  let sessionId = comp!.session_id as string | null;
  if (sessionId) {
    const { data: s } = await admin.from("quiz_sessions").select("status").eq("id", sessionId).maybeSingle();
    if (!s || s.status === "ended") sessionId = null;
  }
  if (!sessionId) {
    const mode = comp!.format === "scheduled_individual" || comp!.format === "individual_ranking" ? "self_paced" : "synchronized";
    let created: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { data, error } = await admin
        .from("quiz_sessions")
        .insert({
          quiz_id: comp!.quiz_id,
          organization_id: comp!.organization_id,
          host_id: ctx.user.id,
          join_code: await freshCode(admin),
          title: comp!.title,
          mode,
          status: "lobby",
          settings: {
            show_leaderboard: (comp!.scoring as Record<string, unknown>)?.show_leaderboard !== false,
            max_participants: comp!.max_participants ?? 1000,
          },
        })
        .select("id")
        .single();
      if (!error && data) created = data;
    }
    if (!created) redirect(`/admin/competitions/${id}?e=session_failed`);
    sessionId = created!.id;
    await admin
      .from("competitions")
      .update({ session_id: sessionId, status: "live", updated_at: new Date().toISOString() })
      .eq("id", id);
  }
  await audit(ctx, "competition.session_started", "competitions", id, comp!.organization_id, { session_id: sessionId });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ORG_COOKIE, comp!.organization_id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
  redirect(`/dashboard/sessions/${sessionId}/host`);
}

/* ── Access codes ───────────────────────────────────────────────────── */

export async function saveAccessCode(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const id = fstr(formData, "id", 60);
  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", competitionId).maybeSingle();
  if (!comp) redirect("/admin/competitions");

  const payload: Record<string, unknown> = {
    competition_id: competitionId,
    label: fstr(formData, "label", 120),
    organization_id: fstr(formData, "organization_id", 60),
    class_id: fstr(formData, "class_id", 60),
    max_uses: fint(formData, "max_uses"),
    expires_at: fdate(formData, "expires_at"),
    is_active: formData.get("is_active") !== "off",
  };

  if (id) {
    await admin.from("competition_access_codes").update(payload).eq("id", id);
    await audit(ctx, "competition.code_updated", "competition_access_codes", id, comp!.organization_id);
    redirect(`/admin/competitions/${competitionId}?tab=codes&ok=code_saved`);
  }

  const manual = fstr(formData, "code", 12)?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let code: string;
  if (manual) {
    if (manual.length < 4) redirect(`/admin/competitions/${competitionId}?tab=codes&e=code_short`);
    if (await codeTaken(admin, manual!)) redirect(`/admin/competitions/${competitionId}?tab=codes&e=code_taken`);
    code = manual!;
  } else {
    code = await freshCode(admin);
  }
  const { data, error } = await admin
    .from("competition_access_codes")
    .insert({ ...payload, code, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/competitions/${competitionId}?tab=codes&e=code_failed`);
  await audit(ctx, "competition.code_created", "competition_access_codes", data!.id, comp!.organization_id, { code });
  redirect(`/admin/competitions/${competitionId}?tab=codes&ok=code_created`);
}

export async function accessCodeOp(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  const { data: row } = await admin
    .from("competition_access_codes")
    .select("id, code, is_active, competitions(organization_id)")
    .eq("id", id)
    .maybeSingle();
  if (!row) redirect(`/admin/competitions/${competitionId}?tab=codes`);
  const orgId = (row!.competitions as unknown as { organization_id: string } | null)?.organization_id ?? null;

  if (op === "toggle") {
    await admin.from("competition_access_codes").update({ is_active: !row!.is_active }).eq("id", id);
    await audit(ctx, row!.is_active ? "competition.code_disabled" : "competition.code_activated", "competition_access_codes", id, orgId);
  } else if (op === "regenerate") {
    const code = await freshCode(admin);
    await admin.from("competition_access_codes").update({ code }).eq("id", id);
    await audit(ctx, "competition.code_regenerated", "competition_access_codes", id, orgId, { previous: row!.code });
  } else if (op === "revoke") {
    if (formData.get("confirm") !== "on") redirect(`/admin/competitions/${competitionId}?tab=codes&e=confirm`);
    await admin.from("competition_access_codes").delete().eq("id", id);
    await audit(ctx, "competition.code_revoked", "competition_access_codes", id, orgId, { code: row!.code });
  }
  revalidatePath(`/admin/competitions/${competitionId}`);
  redirect(`/admin/competitions/${competitionId}?tab=codes&ok=code_${op}`);
}

/**
 * Regenerate the linked live session's own join code (the code shown
 * on the host screen). Old code stops working immediately.
 */
export async function regenerateSessionCode(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const { data: comp } = await admin
    .from("competitions")
    .select("organization_id, session_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp?.session_id) redirect(`/admin/competitions/${competitionId}?tab=codes&e=no_session`);
  const code = await freshCode(admin);
  await admin.from("quiz_sessions").update({ join_code: code }).eq("id", comp!.session_id);
  await audit(ctx, "competition.session_code_regenerated", "quiz_sessions", comp!.session_id!, comp!.organization_id);
  redirect(`/admin/competitions/${competitionId}?tab=codes&ok=session_code`);
}

/* ── Participants ───────────────────────────────────────────────────── */

export async function registerParticipant(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const fullName = fstr(formData, "full_name", 160);
  if (!fullName) redirect(`/admin/competitions/${competitionId}?tab=participants&e=name`);
  const studentId = fstr(formData, "student_id", 60);
  let userId: string | null = null;
  if (studentId) {
    const { data: st } = await admin.from("students").select("user_id").eq("id", studentId).maybeSingle();
    userId = st?.user_id ?? null;
  }
  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", competitionId).maybeSingle();
  const { data, error } = await admin
    .from("competition_registrations")
    .insert({
      competition_id: competitionId,
      full_name: fullName,
      participant_ref: fstr(formData, "participant_ref", 60),
      organization_id: fstr(formData, "organization_id", 60),
      class_id: fstr(formData, "class_id", 60),
      student_id: studentId,
      user_id: userId,
      access_code_id: fstr(formData, "access_code_id", 60),
      source: "admin",
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/competitions/${competitionId}?tab=participants&e=failed`);
  await audit(ctx, "competition.participant_registered", "competition_registrations", data!.id, comp?.organization_id);
  redirect(`/admin/competitions/${competitionId}?tab=participants&ok=registered`);
}

export async function importParticipants(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const csvText = String(formData.get("csv") ?? "");
  if (!csvText.trim()) redirect(`/admin/competitions/${competitionId}?tab=participants&e=empty_csv`);
  const { records } = parseCsvRecords(csvText);
  if (records.length === 0) redirect(`/admin/competitions/${competitionId}?tab=participants&e=empty_csv`);
  if (records.length > 1000) redirect(`/admin/competitions/${competitionId}?tab=participants&e=too_many`);

  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", competitionId).maybeSingle();
  const errors: string[] = [];
  const rows = records
    .map((r, i) => {
      const name = (r.full_name || r.name || "").trim();
      if (!name) {
        errors.push(`Row ${i + 2}: missing full_name`);
        return null;
      }
      return {
        competition_id: competitionId,
        full_name: name.slice(0, 160),
        participant_ref: (r.participant_ref || r.ref || r.student_ref || "").trim() || null,
        source: "import" as const,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let inserted = 0;
  if (rows.length > 0) {
    const { data, error } = await admin.from("competition_registrations").insert(rows).select("id");
    if (error) errors.push(`Database error: ${error.message}`);
    else inserted = data?.length ?? 0;
  }
  await audit(ctx, "competition.participants_imported", "competition_registrations", competitionId, comp?.organization_id, { inserted, failed: errors.length });
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(
    `Participant import: ${inserted} registered, ${errors.length} skipped.${errors.length ? " " + errors.slice(0, 10).join(" · ") : ""}`,
  ), { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 180 });
  redirect(`/admin/competitions/${competitionId}?tab=participants&ok=import_done`);
}

export async function registrationOp(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", competitionId).maybeSingle();

  if (op === "remove") {
    await admin.from("competition_registrations").update({ status: "removed" }).eq("id", id);
    await audit(ctx, "competition.participant_removed", "competition_registrations", id, comp?.organization_id);
  } else if (op === "restore") {
    await admin.from("competition_registrations").update({ status: "registered" }).eq("id", id);
    await audit(ctx, "competition.participant_restored", "competition_registrations", id, comp?.organization_id);
  } else if (op === "delete") {
    await admin.from("competition_registrations").delete().eq("id", id);
    await audit(ctx, "competition.registration_deleted", "competition_registrations", id, comp?.organization_id);
  }
  redirect(`/admin/competitions/${competitionId}?tab=participants&ok=participant_${op}`);
}

/** Register every active student of a class into this competition. */
export async function registerClassForCompetition(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const competitionId = String(formData.get("competition_id"));
  const classId = String(formData.get("class_id"));
  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", competitionId).maybeSingle();
  if (!comp) redirect("/admin/competitions");

  const { data: enrollments } = await admin
    .from("student_enrollments")
    .select("organization_id, students(id, full_name, student_ref, user_id, status)")
    .eq("class_id", classId)
    .eq("status", "active");
  const students = (enrollments ?? [])
    .map((e) => ({
      org: e.organization_id,
      s: e.students as unknown as { id: string; full_name: string; student_ref: string | null; user_id: string | null; status: string } | null,
    }))
    .filter((x) => x.s && x.s.status === "active");

  const { data: existing } = await admin
    .from("competition_registrations")
    .select("student_id")
    .eq("competition_id", competitionId)
    .not("student_id", "is", null);
  const taken = new Set((existing ?? []).map((r) => r.student_id));
  const rows = students
    .filter((x) => !taken.has(x.s!.id))
    .map((x) => ({
      competition_id: competitionId,
      student_id: x.s!.id,
      user_id: x.s!.user_id,
      full_name: x.s!.full_name,
      participant_ref: x.s!.student_ref,
      organization_id: x.org,
      class_id: classId,
      source: "admin" as const,
    }));
  if (rows.length > 0) await admin.from("competition_registrations").insert(rows);
  await audit(ctx, "competition.class_registered", "competition_registrations", competitionId, comp!.organization_id, {
    class_id: classId, added: rows.length,
  });
  redirect(`/admin/competitions/${competitionId}?tab=participants&ok=class_registered`);
}

export async function setResultsPublished(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const published = String(formData.get("published")) === "1";
  const { data: comp } = await admin.from("competitions").select("organization_id").eq("id", id).maybeSingle();
  await admin
    .from("competitions")
    .update({ results_published: published, updated_at: new Date().toISOString() })
    .eq("id", id);
  await audit(ctx, published ? "competition.results_published" : "competition.results_unpublished", "competitions", id, comp?.organization_id);
  redirect(`/admin/competitions/${id}?tab=results&ok=${published ? "results_published" : "results_unpublished"}`);
}
