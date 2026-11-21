import { validUuid } from "@/lib/exam-access";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExamAccessClient } from "./ExamAccessClient";

export const dynamic = "force-dynamic";

export default async function ExamAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; exam?: string; candidate?: string; lockdown?: string; token?: string }>;
}) {
  const rawParams = ((await searchParams) ?? {}) as Record<string, string | undefined>;
  const rawCode = rawParams.code || rawParams["^code"] || rawParams.exam || rawParams["^exam"] || "";
  const inputCode = rawCode.replace(/\^+$/, "").trim().toUpperCase();
  const rawToken = rawParams.token || rawParams["^token"] || "";
  const token = rawToken.replace(/\^+$/, "").trim();
  const rawLockdown = rawParams.lockdown || rawParams["^lockdown"] || "";
  const lockdown = rawLockdown.replace(/\^+$/, "").trim();

  // 1. If an invitation token is passed in query, redirect directly to the join page
  if (token && validUuid(token)) {
    const qs = new URLSearchParams();
    if (inputCode) qs.set("code", inputCode);
    if (lockdown) qs.set("lockdown", lockdown === "1" ? "1" : lockdown);
    const search = qs.toString();
    redirect(`/exam/join/${token}${search ? `?${search}` : ""}`);
  }

  const admin = createAdminClient();

  // 2. If an examination access code is passed, resolve matching exam
  let matchedExam = null;
  if (inputCode) {
    const { data: byCode } = await admin
      .from("exams")
      .select("id, organization_id, title, description, instructions, invite_token, status, shared_link_enabled, access_code, settings, class_id")
      .eq("access_code", inputCode)
      .maybeSingle();
    matchedExam = byCode;
    if (!matchedExam) {
      const { createHash } = await import("crypto");
      const hash = createHash("sha256").update(inputCode, "utf8").digest("hex");
      const { data: byHash } = await admin
        .from("exams")
        .select("id, organization_id, title, description, instructions, invite_token, status, shared_link_enabled, access_code, settings, class_id")
        .eq("access_code_hash", hash)
        .maybeSingle();
      matchedExam = byHash;
    }
  }

  // If the matched exam has an invite_token, automatically redirect to its dedicated join page
  if (matchedExam?.invite_token) {
    const qs = new URLSearchParams();
    qs.set("code", inputCode);
    const examSettings = (matchedExam.settings ?? {}) as Record<string, unknown>;
    const examLockdown = (examSettings.lockdown ?? {}) as Record<string, unknown>;
    const isLockdown = lockdown === "1" || Boolean(examLockdown.enabled);
    if (isLockdown) {
      qs.set("lockdown", "1");
      qs.set("secure_browser", "1");
    }
    redirect(`/exam/join/${matchedExam.invite_token}?${qs.toString()}`);
  }

  // Fetch available classes for the organization so students can select their class
  const { data: classesData } = await admin
    .from("classes")
    .select("id, name, code, organization_id")
    .order("name", { ascending: true });

  const classes = (classesData ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  // Fetch open exams to build a code-to-class map for auto-selection
  const { data: openExams } = await admin
    .from("exams")
    .select("access_code, class_id")
    .not("access_code", "is", null);

  const codeToClassMap: Record<string, string> = {};
  for (const ex of openExams ?? []) {
    if (ex.access_code && ex.class_id) {
      codeToClassMap[ex.access_code.toUpperCase().trim()] = ex.class_id as string;
    }
  }

  return (
    <ExamAccessClient
      initialExamCode={inputCode}
      classes={classes}
      codeToClassMap={codeToClassMap}
      defaultClassId={(matchedExam?.class_id as string | null | undefined) ?? null}
    />
  );
}
