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
  const params = await searchParams;
  const inputCode = (params.code || params.exam || "").trim().toUpperCase();
  const token = params.token?.trim();
  const lockdown = params.lockdown;

  // 1. If an invitation token is passed in query, redirect directly to the join page
  if (token && validUuid(token)) {
    const qs = new URLSearchParams();
    if (inputCode) qs.set("code", inputCode);
    if (lockdown) qs.set("lockdown", lockdown);
    const search = qs.toString();
    redirect(`/exam/join/${token}${search ? `?${search}` : ""}`);
  }

  // 2. If an examination access code is passed (e.g. from an existing launcher or shortcut)
  // and no candidate code is present, check if this exam has a shared invitation link.
  // If it does, automatically redirect to its standard join page so students see
  // First Name, Last Name, Examination Code, Class instead of a personal candidate code prompt.
  if (inputCode && !params.candidate?.trim()) {
    const admin = createAdminClient();
    const { data: matchedExam } = await admin
      .from("exams")
      .select("invite_token, status, shared_link_enabled")
      .eq("access_code", inputCode)
      .maybeSingle();

    if (matchedExam?.invite_token) {
      const qs = new URLSearchParams();
      qs.set("code", inputCode);
      if (lockdown) qs.set("lockdown", lockdown);
      redirect(`/exam/join/${matchedExam.invite_token}?${qs.toString()}`);
    }
  }

  return (
    <ExamAccessClient
      initialExamCode={inputCode}
      initialCandidateCode={(params.candidate || "").trim().toUpperCase()}
    />
  );
}
