import { StaticPage } from "@/components/site/StaticPage";
import { ButtonLink, Card } from "@/components/ui";
import { Award, BookOpenCheck, Building2, GraduationCap, Trophy, UserCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Use Cases" };

const CASES = [
  { icon: GraduationCap, title: "Primary & secondary schools", body: "Weekly class quizzes that pupils actually look forward to, end-of-unit assessments with instant marking, and national-exam-style papers with formal conditions — all from the same question bank.", points: ["Live classroom quizzes with projector mode", "Topic-level mastery reports for every class", "Parents can follow published results"] },
  { icon: Building2, title: "Universities & colleges", body: "Departmental examinations for hundreds of candidates with randomized papers, video proctoring and a corrector workflow for essay components.", points: ["Randomized papers per candidate", "LiveKit proctoring with incident review", "Pass marks and controlled publication"] },
  { icon: Trophy, title: "Competitions & olympiads", body: "Championship rounds where fairness is everything: synchronized release, server-kept clocks, speed-aware scoring and a hall-screen leaderboard.", points: ["Synchronized or self-paced rounds", "Join by code or QR in seconds", "Exportable final rankings"] },
  { icon: BookOpenCheck, title: "Training centers", body: "Certification prep, placement tests and continuing-education assessments with reusable item banks and per-cohort analytics.", points: ["Reusable, categorized question banks", "CSV import with human review", "One-time event passes via manual payment"] },
  { icon: Award, title: "Examination organizations", body: "High-stakes sittings with candidate admission lists, personal access codes, autosave and audit trails for every administrative action.", points: ["Candidate registers & admission control", "Full audit log of staff actions", "Results released only on approval"] },
  { icon: UserCheck, title: "Independent educators", body: "A free tier that is genuinely useful: run your tutoring group's quizzes and mock exams today, upgrade when your cohort grows.", points: ["Free plan with real limits, no card", "14-day Premium trial", "Upgrade only when you need proctoring or scale"] },
];

export default function UseCasesPage() {
  return (
    <StaticPage
      eyebrow="Use cases"
      title="Built for every kind of assessor"
      intro="From a single classroom to a national examination board, EVALORA adapts to the stakes of your assessment."
      wide
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {CASES.map((c) => (
          <Card key={c.title} className="p-6">
            <c.icon className="h-7 w-7 text-evergreen-700" />
            <h2 className="mt-3 font-display text-xl font-semibold text-evergreen-950">{c.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.body}</p>
            <ul className="mt-4 space-y-1.5">
              {c.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm text-ink">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> {p}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="mt-10 text-center">
        <ButtonLink href="/register" variant="gold" className="px-6 py-3">Start with the free plan</ButtonLink>
      </div>
    </StaticPage>
  );
}
