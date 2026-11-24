"use client";

/**
 * Mandatory result publication workflow stepper:
 * Draft → In Progress → Submitted → Marking → Results Review → Validated → Published.
 *
 * Pure presentation of `deriveResultStage()`; all gating (validation before
 * publication, publication before candidate visibility) happens in the server
 * actions and candidate-facing APIs, never here.
 */
import { useI18n } from "@/components/i18n/I18nProvider";
import { RESULT_STAGES, type ResultStage } from "@/lib/resultLifecycle";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDashed } from "lucide-react";

const LABEL_KEY: Record<ResultStage, string> = {
  draft: "results.stageDraft",
  in_progress: "results.stageInProgress",
  submitted: "results.stageSubmitted",
  marking: "results.stageMarking",
  results_review: "results.stageReview",
  validated: "results.stageValidated",
  published: "results.stagePublished",
};

const DESC_KEY: Record<ResultStage, string> = {
  draft: "results.stageDraftDesc",
  in_progress: "results.stageInProgressDesc",
  submitted: "results.stageSubmittedDesc",
  marking: "results.stageMarkingDesc",
  results_review: "results.stageReviewDesc",
  validated: "results.stageValidatedDesc",
  published: "results.stagePublishedDesc",
};

export function ResultLifecycle({
  stage,
  index,
}: {
  stage: ResultStage;
  index: number;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("results.lifecycleLabel")}
      className="mb-5 rounded-xl border border-evergreen-900/10 bg-cream/70 p-4"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {RESULT_STAGES.map((s, i) => {
          const state = i < index ? "done" : i === index ? "current" : "todo";
          return (
            <li
              key={s}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                  state === "current" && "bg-evergreen-700 text-white shadow-sm",
                  state === "done" && "bg-evergreen-100 text-evergreen-900",
                  state === "todo" && "bg-white text-ink-soft ring-1 ring-evergreen-900/10",
                )}
                title={t(DESC_KEY[s])}
              >
                {state === "done" ? (
                  <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <CircleDashed
                    aria-hidden
                    className={cn("h-3.5 w-3.5", state === "current" && "text-gold-300")}
                  />
                )}
                {t(LABEL_KEY[s])}
              </span>
              {i < RESULT_STAGES.length - 1 && (
                <span aria-hidden className="h-px w-4 bg-evergreen-900/20" />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 text-xs leading-5 text-ink-soft">
        {t(DESC_KEY[stage])} {t("results.lifecycleNote")}
      </p>
    </section>
  );
}
