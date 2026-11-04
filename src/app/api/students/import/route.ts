import { audit } from "@/lib/admin";
import { activeOrg, can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import {
  identityKey, normalizeDateOfBirth, normalizeGender, resolveClass, validateImportRecord,
  type ExistingIdentities, type ImportClassRef, type StudentImportRecord,
} from "@/lib/studentImport";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORDS = 2000;
const CHUNK = 200;

interface ImportPayload {
  organization_id?: string;
  batch_id?: string;
  duplicate_mode?: "skip" | "update";
  default_class_id?: string;
  file?: { name?: string; type?: string; hash?: string; storage_path?: string | null };
  records?: StudentImportRecord[];
}

interface RowReport {
  row: number;
  name: string;
  status: "imported" | "updated" | "skipped" | "failed" | "duplicate";
  errors: string[];
  warnings: string[];
}

/**
 * Final, authoritative step of the student-import wizard.
 * The organization is resolved from the caller's verified session
 * (Super Admins may target a chosen organization explicitly) — never
 * trusted from the payload for ordinary users. Every record is
 * re-validated server-side; inserts run in atomic chunks and the whole
 * operation is logged in import_batches + the audit log.
 */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: ImportPayload;
  try {
    body = (await request.json()) as ImportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  const records = Array.isArray(body.records) ? body.records.slice(0, MAX_RECORDS) : [];
  if (records.length === 0) return NextResponse.json({ error: "No records to import." }, { status: 400 });

  const supabase = await createClient();

  // ── Resolve + authorize the target organization ──────────────────
  let orgId: string | null = null;
  if (ctx.profile.platform_role === "super_admin" && body.organization_id) {
    const { data: org } = await supabase.from("organizations").select("id").eq("id", body.organization_id).maybeSingle();
    orgId = org?.id ?? null;
  } else {
    const org = activeOrg(ctx);
    if (org && body.organization_id && body.organization_id !== org.id) {
      return NextResponse.json({ error: "You can only import students into your own school." }, { status: 403 });
    }
    orgId = org?.id ?? null;
  }
  if (!orgId) return NextResponse.json({ error: "No active school workspace." }, { status: 400 });
  if (!can(ctx, orgId, CREATOR_ROLES)) {
    return NextResponse.json({ error: "You do not have permission to register students in this school." }, { status: 403 });
  }

  const fileHash = body.file?.hash?.slice(0, 128) || null;
  const batchId = body.batch_id && /^[0-9a-f-]{36}$/i.test(body.batch_id) ? body.batch_id : crypto.randomUUID();

  // ── Idempotency: same file hash already completed for this school ─
  if (fileHash) {
    const { data: prior } = await supabase.from("import_batches")
      .select("id, file_name, created_at, imported_count")
      .eq("organization_id", orgId).eq("file_hash", fileHash).eq("status", "completed").maybeSingle();
    if (prior) {
      return NextResponse.json({
        ok: false, duplicateFile: true, batchId: prior.id,
        error: `This exact file was already imported on ${new Date(prior.created_at).toLocaleString()} (${prior.imported_count} students). Nothing was imported again.`,
      }, { status: 409 });
    }
  }

  await supabase.from("import_batches").insert({
    id: batchId, organization_id: orgId, created_by: ctx.user.id, kind: "students",
    file_name: body.file?.name?.slice(0, 200) ?? null, file_type: body.file?.type?.slice(0, 30) ?? null,
    file_hash: fileHash, storage_path: body.file?.storage_path ?? null,
    status: "processing", total_rows: records.length,
  });

  const failBatch = async (message: string, status = 500) => {
    await supabase.from("import_batches").update({
      status: "failed", completed_at: new Date().toISOString(), report: { error: message },
    }).eq("id", batchId);
    return NextResponse.json({ ok: false, batchId, error: message }, { status });
  };

  // ── Reference data (this school only) ────────────────────────────
  const [{ data: classRows }, { data: existingRows }, { data: yearRows }] = await Promise.all([
    supabase.from("classes").select("id, name, code, academic_year_id, status").eq("organization_id", orgId).eq("status", "active"),
    supabase.from("students").select("id, full_name, email, student_ref, date_of_birth").eq("organization_id", orgId).limit(20000),
    supabase.from("academic_years").select("id, name").eq("organization_id", orgId),
  ]);
  const classes = (classRows ?? []) as ImportClassRef[];
  const yearByName = new Map((yearRows ?? []).map((y) => [y.name.trim().toLowerCase(), y.id]));
  const existingByRef = new Map<string, string>();
  const existingByEmail = new Map<string, string>();
  const existing: ExistingIdentities = { refs: new Set(), emails: new Set(), nameDob: new Set() };
  for (const s of existingRows ?? []) {
    if (s.student_ref) { existing.refs.add(s.student_ref.trim().toLowerCase()); existingByRef.set(s.student_ref.trim().toLowerCase(), s.id); }
    if (s.email) { existing.emails.add(s.email.trim().toLowerCase()); existingByEmail.set(s.email.trim().toLowerCase(), s.id); }
    existing.nameDob.add(identityKey(s.full_name, s.date_of_birth));
  }

  const defaultClass = body.default_class_id ? classes.find((c) => c.id === body.default_class_id) ?? null : null;
  if (body.default_class_id && !defaultClass) return failBatch("The selected default class does not belong to this school.", 400);

  // ── Validate + classify every record ─────────────────────────────
  const seen: ExistingIdentities = { refs: new Set(), emails: new Set(), nameDob: new Set() };
  const report: RowReport[] = [];
  const toInsert: { rec: StudentImportRecord; cls: ImportClassRef | null; payload: Record<string, unknown> }[] = [];
  const toUpdate: { id: string; rec: StudentImportRecord; cls: ImportClassRef | null; payload: Record<string, unknown> }[] = [];

  for (const raw of records) {
    const rec: StudentImportRecord = {
      row: raw.row ?? 0, include: raw.include !== false,
      full_name: String(raw.full_name ?? "").trim(), student_ref: String(raw.student_ref ?? "").trim(),
      email: String(raw.email ?? "").trim(), gender: String(raw.gender ?? "").trim(),
      date_of_birth: String(raw.date_of_birth ?? "").trim(), phone: String(raw.phone ?? "").trim(),
      guardian_name: String(raw.guardian_name ?? "").trim(), guardian_contact: String(raw.guardian_contact ?? "").trim(),
      class_name: String(raw.class_name ?? "").trim(), class_id: String(raw.class_id ?? "").trim(),
      academic_year: String(raw.academic_year ?? "").trim(), source: [],
    };
    if (!rec.include) {
      report.push({ row: rec.row, name: rec.full_name, status: "skipped", errors: [], warnings: ["Excluded in preview."] });
      continue;
    }
    const validation = validateImportRecord(rec, classes, existing, seen, false);
    let cls = resolveClass(rec, classes) ?? defaultClass;
    if (!cls) validation.errors.push("No class resolved for this row (map a class column or choose a default class).");
    // Academic-year consistency: a stated year must match the class's year.
    if (cls && rec.academic_year) {
      const wantedYear = yearByName.get(rec.academic_year.toLowerCase());
      if (!wantedYear) validation.errors.push(`Unknown academic year “${rec.academic_year}” for this school.`);
      else if (cls.academic_year_id && wantedYear !== cls.academic_year_id) {
        validation.errors.push(`Class “${cls.name}” is not in academic year “${rec.academic_year}”.`);
        cls = null;
      }
    }
    if (validation.errors.length > 0) {
      report.push({ row: rec.row, name: rec.full_name, status: "failed", errors: validation.errors, warnings: validation.warnings });
      continue;
    }
    const payload: Record<string, unknown> = {
      organization_id: orgId,
      full_name: rec.full_name.slice(0, 160),
      email: rec.email ? rec.email.toLowerCase() : null,
      student_ref: rec.student_ref || null,
      gender: normalizeGender(rec.gender),
      date_of_birth: rec.date_of_birth ? normalizeDateOfBirth(rec.date_of_birth) : null,
      phone: rec.phone || null,
      guardian_name: rec.guardian_name || null,
      guardian_contact: rec.guardian_contact || null,
      status: "active",
    };
    if (validation.duplicate === "in_file") {
      report.push({ row: rec.row, name: rec.full_name, status: "duplicate", errors: [], warnings: validation.warnings });
      continue;
    }
    if (validation.duplicate === "existing") {
      const existingId = (rec.student_ref && existingByRef.get(rec.student_ref.toLowerCase()))
        || (rec.email && existingByEmail.get(rec.email.toLowerCase())) || null;
      if (body.duplicate_mode === "update" && existingId) {
        toUpdate.push({ id: existingId, rec, cls, payload });
        report.push({ row: rec.row, name: rec.full_name, status: "updated", errors: [], warnings: validation.warnings });
      } else {
        report.push({ row: rec.row, name: rec.full_name, status: "duplicate", errors: [], warnings: validation.warnings });
      }
      continue;
    }
    toInsert.push({ rec, cls, payload });
    report.push({ row: rec.row, name: rec.full_name, status: "imported", errors: [], warnings: validation.warnings });
  }

  // ── Write: atomic chunks + enrollments, compensating on failure ──
  let imported = 0;
  let updated = 0;
  const flipReport = (row: number, status: RowReport["status"], message: string) => {
    const r = report.find((x) => x.row === row);
    if (r) { r.status = status; r.errors.push(message); }
  };

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { data: inserted, error } = await supabase.from("students")
      .insert(chunk.map((c) => c.payload)).select("id");
    if (error || !inserted || inserted.length !== chunk.length) {
      chunk.forEach((c) => flipReport(c.rec.row, "failed", "Database rejected this batch (possible duplicate reference). No rows from this batch were saved."));
      continue;
    }
    const enrollments = inserted.map((s, idx) => ({
      organization_id: orgId, student_id: s.id, class_id: chunk[idx].cls!.id,
      academic_year_id: chunk[idx].cls!.academic_year_id, status: "active",
    }));
    const { error: enrollError } = await supabase.from("student_enrollments")
      .upsert(enrollments, { onConflict: "student_id,class_id" });
    if (enrollError) {
      // Compensate: remove the just-inserted students so nothing is half-imported.
      await supabase.from("students").delete().in("id", inserted.map((s) => s.id));
      chunk.forEach((c) => flipReport(c.rec.row, "failed", "Enrollment failed; the student record was rolled back."));
      continue;
    }
    imported += inserted.length;
  }

  for (const u of toUpdate) {
    const { organization_id: _omit, ...patch } = u.payload as Record<string, unknown> & { organization_id?: unknown };
    void _omit;
    const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== ""));
    const { error } = await supabase.from("students").update({ ...cleanPatch, updated_at: new Date().toISOString() })
      .eq("id", u.id).eq("organization_id", orgId);
    if (error) { flipReport(u.rec.row, "failed", "Update failed."); continue; }
    if (u.cls) {
      await supabase.from("student_enrollments").upsert(
        { organization_id: orgId, student_id: u.id, class_id: u.cls.id, academic_year_id: u.cls.academic_year_id, status: "active" },
        { onConflict: "student_id,class_id" },
      );
    }
    updated++;
  }

  const skipped = report.filter((r) => r.status === "skipped" || r.status === "duplicate").length;
  const failed = report.filter((r) => r.status === "failed").length;
  const summary = { total: records.length, imported, updated, skipped, failed };

  await supabase.from("import_batches").update({
    status: failed > 0 && imported === 0 && updated === 0 ? "failed" : "completed",
    imported_count: imported, updated_count: updated, skipped_count: skipped, failed_count: failed,
    report: { summary, rows: report }, completed_at: new Date().toISOString(),
  }).eq("id", batchId);

  await audit(ctx, "student.imported", "import_batches", batchId, orgId, {
    ...summary, file_name: body.file?.name ?? null, duplicate_mode: body.duplicate_mode ?? "skip",
  });

  return NextResponse.json({ ok: true, batchId, ...summary, report });
}
