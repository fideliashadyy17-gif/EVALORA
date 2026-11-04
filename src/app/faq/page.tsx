import { StaticPage } from "@/components/site/StaticPage";
import { Card } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ" };

const QA = [
  ["Do participants need an account to join a live quiz?", "No. Participants join with the session's 6-character code or QR code and a display name. Only organizers and staff need EVALORA accounts."],
  ["How do examination candidates access their paper?", "Each registered candidate receives a personal access code. They enter it together with the examination code on the exam access page. Their identity, timer and answers are all tracked server-side."],
  ["Can a candidate cheat the timer?", "No. The examination clock is computed from the server-side start timestamp and duration. Submissions after the deadline are rejected or auto-submitted with only the autosaved answers counted."],
  ["What happens if a connection drops mid-exam?", "Every answer is autosaved to the server as it is entered. When the candidate reconnects and re-enters their access code, they resume exactly where they left off — within the original time window."],
  ["How does video proctoring work?", "Examinations with proctoring enabled open a private LiveKit room. Candidates publish their camera (and screen, if required). Supervisors monitor a paginated grid and can log incidents. Tokens are generated on our server and are valid only for the assigned examination."],
  ["Are proctoring alerts treated as proof of cheating?", "Never. Incidents are observations that an authorized supervisor or corrector must review and classify (valid, invalid, or requiring investigation) before any conclusion is drawn."],
  ["How many participants can join a live session?", "It depends on your plan: 30 on Free, 500 on Premium and 1,000 on Institution. Video-proctored examinations are a different, heavier workload — we recommend piloting proctoring with small cohorts and scaling gradually."],
  ["How do payments work? Is my card charged automatically?", "EVALORA uses verified manual payments. You pay by bank transfer or Mobile Money, submit your transaction reference, and a member of our team approves it. Paid features activate only after approval. There are no automatic card charges."],
  ["Can I import my existing questions?", "Yes — CSV import is built in. Imported questions enter a pending-review state with a row-by-row error report; a teacher publishes them only after checking."],
  ["Is my organization's data isolated from others?", "Yes. EVALORA is multi-tenant with database row-level security: members only ever see their own organization's questions, quizzes, exams and results."],
  ["Does EVALORA support mathematics?", "Fully. Write LaTeX between $…$ (inline) or $$…$$ (display) anywhere in a question or answer option — fractions, roots, powers, matrices and symbols render beautifully with KaTeX."],
];

export default function FaqPage() {
  return (
    <StaticPage eyebrow="FAQ" title="Questions, answered honestly" intro="Straight answers about participation, fairness, proctoring, capacity and payments.">
      <div className="space-y-4">
        {QA.map(([q, a]) => (
          <Card key={q} className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">{q}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{a}</p>
          </Card>
        ))}
      </div>
    </StaticPage>
  );
}
