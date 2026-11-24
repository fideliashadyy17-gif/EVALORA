import { Badge } from "@/components/ui";
import { parseQuestionAssessment, type QuestionAssessment } from "@/lib/questionAssessment";

/**
 * Question-level assessment reference for marking screens: which framework
 * assesses this question, which MYP criteria/strands (or framework
 * elements) were selected in the Paper Builder. Renders from the SNAPSHOT
 * stored on quiz_questions — later reference-library edits never change
 * what a marker sees for a historical examination.
 */
export function QuestionAssessmentBadges({ assessment }: { assessment: unknown }) {
  const parsed: QuestionAssessment | null = parseQuestionAssessment(assessment);
  if (!parsed) return null;
  const isMyp = parsed.curriculum === "myp" && parsed.myp;
  const hasContent = Boolean(isMyp ? parsed.myp?.criteria.length : parsed.elements?.length);
  if (!hasContent && !parsed.grading_system_id) return null;

  const framework = isMyp
    ? `IB MYP · ${parsed.myp?.subject_group_label ?? ""}`.trim()
    : parsed.curriculum.toUpperCase();

  return (
    <div
      className="mt-2 rounded-lg border border-evergreen-700/25 bg-evergreen-50/60 px-2.5 py-2"
      data-testid="question-assessment"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="gold">{framework}</Badge>
        <span className="text-[10px] text-ink-soft">assessment snapshot {parsed.reference}</span>
      </div>
      {isMyp && parsed.myp ? (
        <ul className="mt-1.5 space-y-1.5">
          {parsed.myp.criteria.map((criterion) => (
            <li key={criterion.code} className="text-[11px] leading-snug">
              <span className="font-semibold text-evergreen-950">
                Criterion {criterion.code} — {criterion.title}
              </span>
              {criterion.strands.length > 0 && (
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {criterion.strands.map((strand) => (
                    <span
                      key={strand.code}
                      title={strand.description}
                      className="rounded bg-white px-1.5 py-0.5 text-[10px] text-evergreen-800 ring-1 ring-evergreen-700/25"
                      data-testid={`question-assessment-strand-${strand.code}`}
                    >
                      {strand.code} · {strand.title}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {!isMyp && parsed.elements && parsed.elements.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {parsed.elements.map((element) => (
            <li
              key={element.code}
              title={element.description || undefined}
              className="rounded bg-white px-1.5 py-0.5 text-[10px] text-evergreen-800 ring-1 ring-evergreen-700/25"
              data-testid={`question-assessment-element-${element.code}`}
            >
              {element.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
