"use server";

/**
 * Server-only operations for the Oak event phases, generic question pools,
 * qualification approval and shareable examination invitations.
 *
 * Every mutation re-checks organization / parent event / phase / class
 * relationships server-side and writes an audit entry. Client-provided IDs
 * are never trusted as authorization.
 */

import { audit, fint, FLASH_COOKIE, requireSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const POOLS = "/admin/competitions/pools";
const QUALIFICATIONS = "/admin/competitions/qualifications";
const EVENTS = "/admin/competitions/events";
const INVITATIONS = "/admin/examinations/invitations";

type Admin = ReturnType<typeof createAdminClient>;

function val(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function go(path: string, ok?: string, e?: string, pool?: string): never {
  const q = new URLSearchParams();
  if (ok) q.set("ok", ok);
  if (e) q.set("e", e);
  if (pool) q.set("pool", pool);
  redirect(q.toString() ? `${path}?${q.toString()}` : path);
}

async function flash(message: string) {
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(message), {
    httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 120,
  });
}

interface PhaseRow { id: string; event_id: string | null; phase_key: string; title: string; max_questions: number | null; qualification_rule: unknown }
interface EventRow { id: string; organization_id: string; name: string; settings: unknown }
interface PoolRow { id: string; organization_id: string; event_id: string | null; phase_id: string | null; class_id: string; curriculum: string | null; status: string; target_count: number; filters: unknown; title: string }

async function phaseContext(admin: Admin, phaseId: string, classId: string, orgId: string) {
  const { data: phase } = await admin
    .from("competition_event_phases")
    .select("id,event_id,phase_key,title,max_questions,qualification_rule")
    .eq("id", phaseId)
    .maybeSingle();
  const p = phase as unknown as PhaseRow | null;
  if (!p?.event_id) return null;
  const { data: event } = await admin
    .from("competition_events")
    .select("id,organization_id,name,settings")
    .eq("id", p.event_id)
    .maybeSingle();
  const e = event as unknown as EventRow | null;
  if (!e || e.organization_id !== orgId) return null;
  const { data: link } = await admin
    .from("competition_phase_classes")
    .select("id")
    .eq("phase_id", phaseId)
    .eq("class_id", classId)
    .maybeSingle();
  if (!link) return null;
  return { phase: p, event: e };
}

async function poolContext(admin: Admin, poolId: string) {
  const { data } = await admin
    .from("question_pools")
    .select("id,organization_id,event_id,phase_id,class_id,curriculum,status,target_count,filters,title")
    .eq("id", poolId)
    .maybeSingle();
  return (data ?? null) as unknown as PoolRow | null;
}

function parseQuota(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(/[,;]/)) {
    const [key, n] = part.split(/[:=]/).map((s) => s.trim());
    const count = Number(n);
    if (key && Number.isFinite(count) && count >= 0) out[key] = Math.floor(count);
  }
  return out;
}

async function filtersFromForm(admin: Admin, fd: FormData, ctx: { phase: PhaseRow; event: EventRow }, classId: string, targetCount: number) {
  const curriculum = val(fd, "curriculum", 80) || null;
  const customQuota = parseQuota(val(fd, "curriculum_quota", 300));
  let quota = customQuota;
  if (!Object.keys(quota).length) {
    const settings = (ctx.event.settings ?? {}) as Record<string, unknown>;
    const split = (settings.curriculum_split ?? {}) as Record<string, string>;
    const raw = split[ctx.phase.phase_key];
    const { data: classCurricula } = await admin
      .from("class_curricula")
      .select("curriculum_programmes(key)")
      .eq("class_id", classId);
    const keys = (classCurricula ?? [])
      .map((c) => (c.curriculum_programmes as unknown as { key?: string } | null)?.key)
      .filter((k): k is string => Boolean(k));
    if (curriculum) quota = { [curriculum]: targetCount };
    else if (raw && keys.length) {
      const parts = raw.split("+").map((n) => Number(n.trim())).filter(Number.isFinite);
      keys.slice(0, parts.length).forEach((key, i) => { quota[key] = parts[i]; });
    }
  }
  const filters: Record<string, unknown> = {
    approval_status: "approved",
    previous_usage: val(fd, "previous_usage", 20) === "include" ? "include" : "exclude",
    curriculum_quota: quota,
  };
  for (const key of ["topic", "subtopic", "difficulty", "question_type", "creation_method"]) {
    const v = val(fd, key, 120);
    if (v) filters[key] = v;
  }
  return filters;
}

/* ─── Generic question pools ─────────────────────────────────────── */

export async function createQuestionPool(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = val(formData, "organization_id", 60);
  const phaseId = val(formData, "phase_id", 60);
  const classId = val(formData, "class_id", 60);
  const curriculum = val(formData, "curriculum", 80) || null;
  const subjectId = val(formData, "subject_id", 60) || null;
  const phaseCtx = await phaseContext(admin, phaseId, classId, orgId);
  if (!orgId || !phaseId || !classId || !phaseCtx) go(POOLS, undefined, "scope");

  const requested = fint(formData, "target_count");
  const targetCount = Math.min(100, Math.max(1, requested ?? phaseCtx.phase.max_questions ?? 20));
  const filters = await filtersFromForm(admin, formData, phaseCtx, classId, targetCount);
  const title = val(formData, "title", 160) || `${phaseCtx.phase.title} — ${curriculum ?? "all curricula"}`;

  const { data: existing } = await admin
    .from("question_pools")
    .select("id")
    .eq("organization_id", orgId)
    .eq("phase_id", phaseId)
    .eq("class_id", classId)
    .is("curriculum", curriculum)
    .neq("status", "archived")
    .maybeSingle();
  if (existing?.id) go(POOLS, "existing", undefined, existing.id);

  const { data, error } = await admin
    .from("question_pools")
    .insert({
      organization_id: orgId,
      event_id: phaseCtx.event.id,
      phase_id: phaseId,
      class_id: classId,
      subject_id: subjectId,
      curriculum,
      title,
      status: "draft",
      target_count: targetCount,
      filters,
      notes: val(formData, "notes", 1000),
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) go(POOLS, undefined, error?.code === "23505" ? "duplicate" : "create_failed");
  await audit(ctx, "question_pool.created", "question_pools", data.id, orgId, { phase_id: phaseId, class_id: classId, target_count: targetCount });
  revalidatePath(POOLS);
  go(POOLS, "created", undefined, data.id);
}

export async function updateQuestionPoolFilters(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const poolId = val(formData, "pool_id", 60);
  const pool = await poolContext(admin, poolId);
  if (!pool || pool.status !== "draft") go(POOLS, undefined, "draft_only", poolId);
  const phaseCtx = pool.phase_id && pool.event_id
    ? await phaseContext(admin, pool.phase_id, pool.class_id, pool.organization_id)
    : null;
  if (!phaseCtx) go(POOLS, undefined, "scope", poolId);
  const filters = await filtersFromForm(admin, formData, phaseCtx, pool.class_id, pool.target_count);
  const { error } = await admin.from("question_pools").update({ filters, notes: val(formData, "notes", 1000) }).eq("id", poolId);
  if (error) go(POOLS, undefined, "update_failed", poolId);
  await audit(ctx, "question_pool.filters_updated", "question_pools", poolId, pool.organization_id, { filters });
  revalidatePath(POOLS);
  go(POOLS, "filters", undefined, poolId);
}

export async function generateQuestionPoolItems(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const poolId = val(formData, "pool_id", 60);
  const pool = await poolContext(admin, poolId);
  if (!pool || pool.status !== "draft") go(POOLS, undefined, "draft_only", poolId);
  const { data, error } = await admin.rpc("generate_question_pool_items", { p_pool_id: poolId, p_shuffle: true });
  if (error) go(POOLS, undefined, "generate_failed", poolId);
  const report = (data ?? {}) as Record<string, unknown>;
  if (report.insufficient) {
    await flash(`Pool shortfall: ${report.shortfall ?? 0} approved question(s) missing. Generate additional questions in the Question Bank, review and approve them, then regenerate this draft pool.`);
  } else {
    await flash(`Generated ${report.selected ?? 0} approved questions. Curriculum distribution: ${JSON.stringify(report.curriculum_counts ?? {})}.`);
  }
  await audit(ctx, "question_pool.generated", "question_pools", poolId, pool.organization_id, { report });
  revalidatePath(POOLS);
  go(POOLS, "generated", undefined, poolId);
}

export async function saveQuestionPoolSelections(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const poolId = val(formData, "pool_id", 60);
  const pool = await poolContext(admin, poolId);
  if (!pool || pool.status !== "draft") go(POOLS, undefined, "draft_only", poolId);
  const ids = formData.getAll("question_ids").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const { data, error } = await admin.rpc("set_question_pool_items", { p_pool_id: poolId, p_question_ids: ids });
  if (error) go(POOLS, undefined, "selection_failed", poolId);
  await audit(ctx, "question_pool.manual_selected", "question_pools", poolId, pool.organization_id, { count: ids.length });
  const report = (data ?? {}) as Record<string, unknown>;
  await flash(`Saved ${report.selected ?? ids.length} selected approved question(s).`);
  revalidatePath(POOLS);
  go(POOLS, "selected", undefined, poolId);
}

export async function shuffleQuestionPoolItems(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const poolId = val(formData, "pool_id", 60);
  const pool = await poolContext(admin, poolId);
  if (!pool || pool.status !== "draft") go(POOLS, undefined, "draft_only", poolId);
  const { error } = await admin.rpc("shuffle_question_pool_items", { p_pool_id: poolId });
  if (error) go(POOLS, undefined, "shuffle_failed", poolId);
  await audit(ctx, "question_pool.shuffled", "question_pools", poolId, pool.organization_id);
  revalidatePath(POOLS);
  go(POOLS, "shuffled", undefined, poolId);
}

export async function replaceQuestionPoolItem(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const poolId = val(formData, "pool_id", 60);
  const oldId = val(formData, "old_question_id", 60);
  const newId = val(formData, "new_question_id", 60);
  const pool = await poolContext(admin, poolId);
  if (!pool || pool.status !== "draft" || !oldId || !newId) go(POOLS, undefined, "replace_failed", poolId);
  const { error } = await admin.rpc("replace_question_pool_item", { p_pool_id: poolId, p_old: oldId, p_new: newId });
  if (error) go(POOLS, undefined, "replace_failed", poolId);
  await audit(ctx, "question_pool.replaced", "question_pools", poolId, pool.organization_id, { old_question_id: oldId, new_question_id: newId });
  revalidatePath(POOLS);
  go(POOLS, "replaced", undefined, poolId);
}

export async function setQuestionPoolStatus(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const poolId = val(formData, "pool_id", 60);
  const status = val(formData, "status", 20);
  if (!["draft", "published", "archived"].includes(status)) go(POOLS, undefined, "status", poolId);
  const pool = await poolContext(admin, poolId);
  if (!pool) go(POOLS, undefined, "not_found", poolId);
  const { error } = await admin.from("question_pools").update({ status }).eq("id", poolId);
  if (error) go(POOLS, undefined, status === "published" ? "publish_failed" : "status", poolId);
  if (status === "published") {
    await admin.rpc("track_question_pool_usage", { p_pool_id: poolId });
    await admin.from("competition_phase_classes").update({ question_pool_id: poolId }).eq("phase_id", pool.phase_id!).eq("class_id", pool.class_id);
  }
  await audit(ctx, `question_pool.${status}`, "question_pools", poolId, pool.organization_id, { status });
  revalidatePath(POOLS);
  revalidatePath(EVENTS);
  go(POOLS, status === "published" ? "published" : "reopened", undefined, poolId);
}

/* ─── Qualification, approval and audited overrides ─────────────── */

export async function computeQualifications(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const fromId = val(formData, "from_phase_id", 60);
  const toId = val(formData, "to_phase_id", 60);
  if (!fromId || !toId) go(QUALIFICATIONS, undefined, "scope");
  const { data, error } = await admin.rpc("compute_phase_qualification", { p_from_phase_id: fromId, p_to_phase_id: toId, p_actor: ctx.user.id });
  if (error) go(QUALIFICATIONS, undefined, "compute_failed");
  const report = (data ?? {}) as Record<string, unknown>;
  await flash(`Qualification computed: ${report.eligible ?? 0} eligible, ${report.rejected ?? 0} not eligible across ${report.classes ?? 0} class(es).`);
  await audit(ctx, "qualification.computed", "qualification_records", toId, String(report.organization_id ?? ""), { report });
  revalidatePath(QUALIFICATIONS);
  go(QUALIFICATIONS, "computed");
}

export async function approveQualification(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const recordId = val(formData, "record_id", 60);
  if (!recordId) go(QUALIFICATIONS, undefined, "not_found");
  const { data, error } = await admin.rpc("approve_phase_qualification", { p_record_id: recordId, p_actor: ctx.user.id, p_note: val(formData, "note", 500) || null });
  if (error) go(QUALIFICATIONS, undefined, "approve_failed");
  const result = (data ?? {}) as Record<string, unknown>;
  await flash(`Approved ${result.display_name ?? "candidate"}. One-time admission token: ${result.admission_token}. Give this to the candidate directly; only a hash is stored.`);
  await audit(ctx, "qualification.approved", "qualification_records", recordId, undefined, { status: "approved" });
  revalidatePath(QUALIFICATIONS);
  go(QUALIFICATIONS, "approved");
}

export async function overrideQualification(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const recordId = val(formData, "record_id", 60);
  const newStatus = val(formData, "new_status", 30);
  const reason = val(formData, "reason", 1000);
  if (!recordId || reason.length < 3) go(QUALIFICATIONS, undefined, "override_failed");
  const { data, error } = await admin.rpc("override_phase_qualification", { p_record_id: recordId, p_new_status: newStatus, p_reason: reason, p_actor: ctx.user.id });
  if (error) go(QUALIFICATIONS, undefined, "override_failed");
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.admission_token) await flash(`Manual override recorded for ${result.reason}. One-time admission token: ${result.admission_token}.`);
  else await flash(`Manual override recorded. ${result.original_status} → ${result.new_status}; reason: ${reason}.`);
  await audit(ctx, "qualification.overridden", "qualification_overrides", recordId, undefined, { original_status: result.original_status, new_status: result.new_status, reason });
  revalidatePath(QUALIFICATIONS);
  go(QUALIFICATIONS, "overridden");
}

export async function setPhaseStatus(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const phaseId = val(formData, "phase_id", 60);
  const status = val(formData, "status", 30);
  if (!phaseId || !["draft", "scheduled", "open", "completed", "closed"].includes(status)) go(EVENTS, undefined, "phase_status");
  const { data: phase } = await admin.from("competition_event_phases").select("event_id").eq("id", phaseId).maybeSingle();
  const { data: event } = phase?.event_id ? await admin.from("competition_events").select("organization_id").eq("id", phase.event_id).maybeSingle() : { data: null };
  await admin.from("competition_event_phases").update({ status }).eq("id", phaseId);
  await audit(ctx, "event.phase_status", "competition_event_phases", phaseId, event?.organization_id ?? null, { status });
  revalidatePath(EVENTS);
  go(EVENTS, "phase_status");
}

/* ─── Shareable examination links + access codes ────────────────── */

export async function updateExamInvitation(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = val(formData, "exam_id", 60);
  const { data: exam } = await admin
    .from("exams")
    .select("id,organization_id,title,access_code,invite_token,status,settings")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) go(INVITATIONS, undefined, "not_found");
  const action = val(formData, "action", 30);
  const patch: Record<string, unknown> = {};
  if (action === "new_code") patch.access_code = genCode(8);
  if (action === "new_link") patch.invite_token = crypto.randomUUID();
  if (action === "settings") {
    patch.shared_link_enabled = val(formData, "shared_link_enabled", 5) === "1";
    const expires = val(formData, "invite_expires_at", 40);
    patch.invite_expires_at = expires ? new Date(expires).toISOString() : null;
    const settings = { ...((exam.settings ?? {}) as Record<string, unknown>) };
    const policy = val(formData, "attempt_policy", 30);
    settings.attempt_policy = policy === "read_only_reentry" ? "read_only_reentry" : "single_resume";
    patch.settings = settings;
  }
  const { error } = await admin.from("exams").update(patch).eq("id", exam.id);
  if (error) go(INVITATIONS, undefined, "update_failed");
  await audit(ctx, `exam.invitation.${action}`, "exams", exam.id, exam.organization_id);
  revalidatePath(INVITATIONS);
  go(INVITATIONS, "updated");
}
