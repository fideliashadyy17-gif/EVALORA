import { createAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Premium result-processing gateway.
 *
 * After a student submits, the server grades the attempt synchronously inside
 * `applyDeadlineSubmission`. This page confirms grading is complete and hands
 * off to the result screen. If grading is somehow still in progress, the
 * client polls until it lands.
 */
export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  await requireUser();

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, status, grading_status, score, max_score, submitted_at")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) redirect(`/take-exam/${attemptId}`);

  const graded =
    attempt.status === "submitted" ||
    attempt.status === "auto_submitted" ||
    attempt.grading_status === "graded" ||
    attempt.grading_status === "grading_failed";

  if (graded) {
    redirect(`/take-exam/${attemptId}/result`);
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Grading your examination — EVALORA</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #fbfaf5;
            color: #14532d;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .card {
            background: #ffffff;
            border: 1px solid #d6d3d1;
            border-radius: 16px;
            padding: 40px 32px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          }
          .spinner {
            width: 56px;
            height: 56px;
            border: 5px solid #dcfce7;
            border-top-color: #15803d;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.02em;
          }
          p.sub {
            color: #6b7280;
            font-size: 15px;
            margin-bottom: 24px;
            line-height: 1.5;
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            background: #dcfce7;
            color: #166534;
            border: 1px solid #86efac;
            margin-bottom: 24px;
          }
          .badge span {
            display: inline-block;
            width: 7px;
            height: 7px;
            background: #166534;
            border-radius: 50%;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .message {
            font-size: 14px;
            font-weight: 500;
            color: #14532d;
            margin-bottom: 8px;
            animation: msgFade 6s steps(1) infinite;
          }
          @keyframes msgFade {
            0%, 20% { opacity: 1; }
            25%, 45% { opacity: 0; }
            50%, 70% { opacity: 1; }
            75%, 95% { opacity: 0; }
            100% { opacity: 1; }
          }
          .footer {
            margin-top: 24px;
            font-size: 11px;
            color: #9ca3af;
            text-transform: uppercase;
            letter-spacing: 0.14em;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="spinner" role="status" aria-label="Grading in progress"></div>
          <h1>Please wait while we grade<br/>your examination.</h1>
          <p class="sub">Your answers are being carefully evaluated.<br/>Every question is checked automatically.</p>
          <div class="badge"><span></span>Grading in progress</div>
          <p class="message">Great job! Your hard work matters.</p>
          <div class="footer">EVALORA &bull; Automatic Grading System</div>
        </div>

        <script>
          (async () => {
            const attemptId = ${JSON.stringify(attemptId)};
            const base = window.location.origin;
            let polls = 0;
            const maxPolls = 120;
            while (polls < maxPolls) {
              await new Promise((r) => setTimeout(r, 1000));
              try {
                const res = await fetch(`${base}/api/exam/grading-status/${attemptId}`);
                const data = await res.json();
                if (data && data.graded) {
                  window.location.href = `${base}/take-exam/${attemptId}/result`;
                  return;
                }
              } catch {
                // ignore and keep polling
              }
              polls++;
            }
            window.location.href = `${base}/take-exam/${attemptId}/result`;
          })();
        </script>
      </body>
    </html>
  );
}
