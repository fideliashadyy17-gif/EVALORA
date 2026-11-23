import { Prose, StaticPage } from "@/components/site/StaticPage";
import { ButtonLink } from "@/components/ui";
import { ORG_ROLES, QUESTION_TYPES } from "@/lib/brand";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Features" };

// Derived from the same constants the application uses to render its creator
// and role pickers. Hard-coded counts here had already drifted ("Ten question
// types", "nine roles") while the product shipped eleven and ten, so the page
// would have kept advertising the wrong thing indefinitely.
const QUESTION_TYPE_COUNT = QUESTION_TYPES.length;
const ROLE_COUNT = ORG_ROLES.length;
/** "Multiple choice (single answer)" -> "single choice", etc. */
const TYPE_LABELS = QUESTION_TYPES.map((type) =>
  type.label
    .replace(" (single answer)", "")
    .replace(" (no correct answer)", "")
    .replace(" (manually marked)", "")
    .replace("Assess Prep multi-part (typed answers)", "multi-part papers")
    .replace("Multiple choice", "single choice")
    .replace("True / False", "true/false")
    .toLowerCase()
    // Lowercasing first means this matches the singular label it is replacing;
    // matching before toLowerCase() silently left "presentation slide".
    .replace("presentation slide", "presentation slides"),
);
const LAST_LABEL = TYPE_LABELS[TYPE_LABELS.length - 1];

export default function FeaturesPage() {
  return (
    <StaticPage
      eyebrow="Features"
      title="Everything needed to assess with confidence"
      intro="EVALORA combines four engines — live quizzes, assessments, formal examinations and video proctoring — on one secure, multi-tenant foundation."
    >
      <Prose>
        <h2>Quiz creation studio</h2>
        <ul>
          <li>
            <strong>{QUESTION_TYPE_COUNT} question types:</strong>{" "}
            {TYPE_LABELS.slice(0, -1).join(", ")} and {LAST_LABEL}.
          </li>
          <li><strong>Real mathematics:</strong> LaTeX rendering with KaTeX — fractions, powers, roots, equations, matrices and symbols, inline or as display blocks.</li>
          <li><strong>Media-rich questions:</strong> attach images, audio or video to any question.</li>
          <li><strong>Question bank:</strong> categories, topics, tags, difficulty levels, explanations and points — reuse questions across quizzes and exams.</li>
          <li><strong>Reviewed imports:</strong> CSV question imports land in a pending-review state with a row-by-row error report. Nothing publishes itself.</li>
        </ul>

        <h2>Live interactive quiz engine</h2>
        <ul>
          <li>Join by 6-character code or QR code — participants never need an account.</li>
          <li>Synchronized mode (host releases each question) or self-paced mode.</li>
          <li>Server-authoritative countdowns, scoring and leaderboards.</li>
          <li>Three genuinely separate live interfaces: private Host Control Screen, secure Public Live Screen, and mobile-first Student Answer Screen with illustrated avatars.</li>
          <li>Host controls for admission/approval, pause/resume, answer reveals, rankings, final podium, presentation animations and projector sound.</li>
          <li>Read-only, token-protected projector screen for classrooms and halls — a participant join code alone never opens it.</li>
          <li>Session recovery: a dropped connection never loses a submitted answer.</li>
        </ul>

        <h2>Examination engine</h2>
        <ul>
          <li>Candidate registration with personal access codes and admission control.</li>
          <li>Randomized question order and option order per candidate.</li>
          <li>Autosave on every answer; resume an in-progress paper after reconnection.</li>
          <li>Automatic submission at the server deadline; candidates cannot extend their own time.</li>
          <li>Automatic marking of objective items, a corrector queue for written answers, and controlled publication of results.</li>
        </ul>

        <h2>Video proctoring (LiveKit)</h2>
        <ul>
          <li>Secure, server-generated room tokens — candidates can only join their assigned examination room.</li>
          <li>Camera and microphone publishing, optional screen sharing, connection status and reconnection handling.</li>
          <li>Supervisor grid (12–16 candidates per page) with incident logging and human review workflow.</li>
          <li>Automated flags are never treated as proof of misconduct — an authorized person always reviews.</li>
        </ul>

        <h2>Organization &amp; platform administration</h2>
        <ul>
          <li>Multi-tenant organizations with {ROLE_COUNT} roles and explicit, server-enforced permissions.</li>
          <li>Freemium + Premium plans with configurable limits, trials and entitlements checked on the server.</li>
          <li>Manual payment workflow: submit a reference, upload proof, activation only after Super Admin approval.</li>
          <li>In-app notifications, audit logs, support tickets and a complete Super Admin console.</li>
        </ul>
      </Prose>
      <div className="mt-10">
        <ButtonLink href="/register" variant="gold" className="px-6 py-3">Start free today</ButtonLink>
      </div>
    </StaticPage>
  );
}
