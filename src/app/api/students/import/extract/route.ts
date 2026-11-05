import { activeOrg, can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import { extractStudentRows, IMPORT_FILE_EXTENSIONS } from "@/lib/extractServer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Extraction step of the student-import wizard. Authenticated staff
 * only. Returns a row×cell matrix for the caller to map and validate —
 * nothing is written to the database and file contents are not stored.
 */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  // Parsing uploaded documents is a privileged, resource-intensive operation.
  // Match the student-import creator roles before reading the request body;
  // platform administrators can use the separate cross-organization wizard.
  const org = activeOrg(ctx);
  if (ctx.profile.status === "suspended" || ctx.tenantDenied ||
      (ctx.profile.platform_role !== "super_admin" && (!org || !can(ctx, org.id, CREATOR_ROLES)))) {
    return NextResponse.json({ error: "You do not have permission to import students in this workspace." }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Expected a multipart file upload." }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 10 MB.` }, { status: 413 });
  }
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!IMPORT_FILE_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Unsupported format “${ext}”. Supported: CSV, XLS, XLSX, PDF, DOC, DOCX.` }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractStudentRows(file.name, buffer);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Diagnostics stay generic: never echo file contents or stack traces.
    console.error("student import extraction failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({
      error: error instanceof Error && error.message.startsWith("Unsupported")
        ? error.message
        : "This file could not be read. It may be corrupt, password-protected or in an unexpected format — try exporting it again as CSV or XLSX.",
    }, { status: 422 });
  }
}
