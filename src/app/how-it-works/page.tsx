import { Prose, StaticPage } from "@/components/site/StaticPage";
import { ButtonLink, Card } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "How It Works" };

const JOURNEYS = [
  {
    title: "Run a live quiz",
    steps: [
      ["Create your organization", "Register, name your school or center, and invite your team with the right roles."],
      ["Build questions", "Author questions in the bank — with mathematics, media and explanations — or import a reviewed CSV."],
      ["Assemble a quiz", "Pick questions, set points and per-question time, choose randomization, publish."],
      ["Open a live session", "EVALORA generates a participant join code/QR and a separate secure Public Live Screen link for the hall display."],
      ["Host the round", "From the private Host Control Screen, admit participants, release questions, watch answers arrive, reveal answers/rankings and finish with a podium. Students answer independently on their own devices."],
      ["Review results", "Scores are already computed. Export the full report to CSV."],
    ],
  },
  {
    title: "Run a proctored examination",
    steps: [
      ["Create the examination", "Attach a question set, set duration, pass mark and the examination window."],
      ["Register candidates", "Add candidates individually or in bulk; each receives a personal access code."],
      ["Enable proctoring", "Turn on LiveKit video supervision; optionally require screen sharing."],
      ["Candidates sit the paper", "They verify with their code, consent to proctoring, and answer with autosave and a server clock."],
      ["Supervise & review", "Supervisors watch the video grid, log observations and classify incidents."],
      ["Mark & publish", "Objective items auto-mark; correctors grade written work; results publish when you say so."],
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <StaticPage
      eyebrow="How it works"
      title="Two journeys, one platform"
      intro="Whether it's a joyful classroom quiz or a high-stakes proctored examination, the path is the same: author once, run fairly, publish with confidence."
      wide
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {JOURNEYS.map((j) => (
          <Card key={j.title} className="p-7">
            <h2 className="font-display text-2xl font-semibold text-evergreen-950">{j.title}</h2>
            <ol className="mt-5 space-y-4">
              {j.steps.map(([t, b], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-evergreen-700 font-display text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-evergreen-950">{t}</p>
                    <p className="text-sm text-ink-soft">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <Prose>
        <h2>Fairness is architectural, not cosmetic</h2>
        <p>
          In EVALORA, the server — never the participant&apos;s device — owns the
          clock, validates every submission window and computes every score.
          Answers are idempotent: submitting twice can never double-count.
          Examination deadlines are enforced when the paper is graded, so a
          modified browser clock gains a candidate nothing.
        </p>
      </Prose>
      <div className="mt-8">
        <ButtonLink href="/register" variant="gold" className="px-6 py-3">Create your organization</ButtonLink>
      </div>
    </StaticPage>
  );
}
