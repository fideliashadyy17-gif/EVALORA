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
    <main className="exam-entry min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo />
          <span className="exam-entry-secure">Candidate access</span>
        </div>
        <Card className="exam-entry-card overflow-hidden">
          <div className="exam-entry-heading px-6 py-7 sm:px-9 sm:py-8">
            <p className="exam-entry-kicker">Examination check-in</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">Open your assessment</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/80">
              Paste the invitation link from your teacher or enter the assessment access code to continue.
            </p>
          </div>
          <div className="p-6 sm:p-9">
            <div className="exam-entry-assurance mb-5 grid gap-3 sm:grid-cols-3">
              <div><span>01</span><p>No account required</p></div>
              <div><span>02</span><p>Invitation verified securely</p></div>
              <div><span>03</span><p>Continue to candidate check-in</p></div>
            </div>
            <p className="text-sm leading-6 text-ink-soft">
              An invitation link looks like <span className="rounded bg-evergreen-50 px-1.5 py-0.5 font-mono text-xs text-evergreen-900">/exam/join/…</span>. You can paste the entire link here, or enter the access code supplied by your institution.
            </p>

            {problem === "code" && (
              <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                No open assessment answered to <strong>{code}</strong>. Check the code with your teacher, or open the full
                invitation link they sent you.
              </p>
            )}
            {problem === "invalid" && (
              <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                That link or code is not complete. An invitation link must contain a long identifier, and an access code is
                usually 8 to 20 characters.
              </p>
            )}

            <form action="/exam" method="get" className="mt-6 space-y-3">
              <label htmlFor="exam-code" className="block text-sm font-semibold text-evergreen-950">
                Invitation link or access code
              </label>
              <input
                id="exam-code"
                name="code"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Paste link or enter your access code"
                className="w-full rounded-xl border border-evergreen-900/25 bg-white px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-evergreen-600 focus:ring-2 focus:ring-evergreen-600/20"
                required
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-gold-500 px-4 py-3 text-sm font-bold text-evergreen-950 transition hover:bg-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen-700 focus-visible:ring-offset-2"
              >
                Continue to candidate check-in
              </button>
            </form>
            <p className="mt-4 border-t border-evergreen-900/10 pt-4 text-xs text-ink-soft">
          Sitting an examination your school organised with an exam code and a personal candidate code?{" "}
          <Link href="/exam-access" className="font-medium text-evergreen-800 underline">
            Use the candidate access page
          </Link>
          .
            </p>
          </div>
        </Card>
        <p className="mt-5 text-center text-xs text-ink-soft">
          <Link href="/" className="underline">EVALORA</Link> · ask your invigilator if you cannot get in
        </p>
      </div>
    </main>
  );
}
