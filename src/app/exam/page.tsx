import { Card } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { examEntryHref, parseExamEntryInput } from "@/lib/examEntry";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Examination entry" };
export const dynamic = "force-dynamic";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Entry point for `/exam`.
 *
 * A candidate normally arrives through the invitation link
 * (`/exam/join/<token>`) generated for their assessment, but the bare address
 * `/exam` used to be a 404 — which is what a student sees when they type
 * "evalora-six.vercel.app/exam" instead of pasting the whole link. This page
 * resolves what they have:
 *
 *  - a pasted invitation link, or a bare invitation token → straight to the join page;
 *  - an access code → the one OPEN assessment whose server-stored hash matches.
 *
 * The code lookup only ever maps a code the candidate already holds to the
 * public join page; it grants nothing extra, because the join page still
 * validates the code, the identity and the assessment window server-side. The
 * answer is deliberately the same for "unknown code", "closed assessment" and
 * "code used by several assessments", so the page cannot confirm which codes exist.
 */
export default async function ExamEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token?: string }>;
}) {
  const { code, token } = await searchParams;
  const input = parseExamEntryInput(code ?? token);
  const href = examEntryHref(input);
  if (href) redirect(href);

  if (input.kind === "code") {
    const admin = createAdminClient();
    const { data: matches } = await admin
      .from("exams")
      .select("invite_token,status,shared_link_enabled")
      .eq("access_code_hash", sha256(input.code))
      .eq("shared_link_enabled", true)
      .eq("status", "open")
      .limit(2);
    // Only redirect when exactly one open assessment answers to that code.
    if (matches?.length === 1 && matches[0].invite_token)
      redirect(`/exam/join/${matches[0].invite_token}?code=${encodeURIComponent(input.code)}`);
    return <Shell code={input.code} problem="code" />;
  }

  return <Shell code="" problem={input.kind === "invalid" ? "invalid" : null} />;
}

function Shell({ code, problem }: { code: string; problem: "code" | "invalid" | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-lg p-7 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Examination entry</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-evergreen-950">Open your assessment</h1>
        <p className="mt-2 text-sm text-ink-soft">
          No EVALORA account and no login are required. Open the invitation link your teacher sent you — it looks like
          <span className="mx-1 rounded bg-evergreen-50 px-1.5 py-0.5 font-mono text-[11px] text-evergreen-900">/exam/join/…</span>
          — or paste that link, or type the access code, below.
        </p>

        {problem === "code" && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No open assessment answered to <strong>{code}</strong>. Check the code with your teacher, or open the full
            invitation link they sent you.
          </p>
        )}
        {problem === "invalid" && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            That link or code is not complete. An invitation link must contain a long identifier, and an access code is
            usually 8 to 20 characters.
          </p>
        )}

        <form action="/exam" method="get" className="mt-5 space-y-3">
          <label htmlFor="exam-code" className="block text-sm font-medium text-evergreen-950">
            Invitation link or access code
          </label>
          <input
            id="exam-code"
            name="code"
            autoComplete="off"
            spellCheck={false}
            placeholder="MYP4-STAT-2026 or https://…/exam/join/…"
            className="w-full rounded-xl border border-evergreen-900/20 bg-white px-3 py-2.5 text-sm text-ink shadow-sm outline-none focus:border-evergreen-600"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-evergreen-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-evergreen-800"
          >
            Continue
          </button>
        </form>

        <p className="mt-4 border-t border-evergreen-900/10 pt-4 text-xs text-ink-soft">
          Sitting an examination your school organised with an exam code and a personal candidate code?{" "}
          <Link href="/exam-access" className="font-medium text-evergreen-800 underline">
            Use the candidate access page
          </Link>
          .
        </p>
      </Card>
      <p className="mt-5 text-xs text-ink-soft">
        <Link href="/" className="underline">EVALORA</Link> · ask your invigilator if you cannot get in
      </p>
    </div>
  );
}
