"use client";

/**
 * Question Studio — appearance designer.
 *
 * This is the no-code design surface for one question. Every control writes to a
 * `QuestionDesign` object that QuestionForm stores with the question as
 * `config.design`, so:
 *
 *   • the values an administrator sets in the Control Center
 *     (`question_studio.design_*`, `numbering_style`) are the DEFAULTS a new
 *     question starts from — that is what makes those settings real;
 *   • what is stored with the question is what renders later. Editing a default
 *     in the Control Center therefore cannot silently restyle a paper that has
 *     already been published, which is a hard requirement for examinations in
 *     progress.
 *
 * Nothing here accepts free CSS. Layouts come from closed vocabularies
 * (`CARD_LAYOUTS`, `OPTION_LAYOUTS`, …) and numbers are clamped by
 * `normalizeQuestionDesign`, so the only thing a saved design can do is select
 * one of the appearances the schema allows.
 */
import { useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import {
  CARD_LAYOUT_OPTIONS,
  IMAGE_POSITION_OPTIONS,
  NUMBERING_STYLE_OPTIONS,
  OPTION_LAYOUT_OPTIONS,
} from "@/lib/config/schema";
import {
  DESIGN_BOUNDS,
  DEFAULT_QUESTION_DESIGN,
  designClassNames,
  designCssVariables,
  describeDesign,
  formatQuestionNumber,
  normalizeQuestionDesign,
  TEXT_ALIGNMENTS,
  type QuestionDesign,
} from "@/lib/questionDesign";
import { cn } from "@/lib/utils";
import { ChevronDown, Eye, RotateCcw } from "lucide-react";

const TEXT_ALIGN_OPTIONS: Array<{ value: (typeof TEXT_ALIGNMENTS)[number]; label: string }> = [
  { value: "start", label: "Left (start)" },
  { value: "center", label: "Centred" },
  { value: "end", label: "Right (end)" },
  { value: "justify", label: "Justified" },
];

const SLIDERS: Array<{
  field: keyof QuestionDesign;
  label: string;
  min: number;
  max: number;
  unit: string;
  hint: string;
}> = [
  { field: "fontSizePx", label: "Text size", min: DESIGN_BOUNDS.fontSizePx.min, max: DESIGN_BOUNDS.fontSizePx.max, unit: "px", hint: "The question text, not the whole page." },
  { field: "padding", label: "Card padding", min: DESIGN_BOUNDS.padding.min, max: DESIGN_BOUNDS.padding.max, unit: "px", hint: "Space inside the question card." },
  { field: "spacing", label: "Spacing", min: DESIGN_BOUNDS.spacing.min, max: DESIGN_BOUNDS.spacing.max, unit: "px", hint: "Gap between the stem, media and options." },
  { field: "cornerRadius", label: "Corner radius", min: DESIGN_BOUNDS.cornerRadius.min, max: DESIGN_BOUNDS.cornerRadius.max, unit: "px", hint: "0 keeps a printed, square-edged look." },
  { field: "imageMaxWidthPercent", label: "Image width", min: DESIGN_BOUNDS.imageMaxWidthPercent.min, max: DESIGN_BOUNDS.imageMaxWidthPercent.max, unit: "%", hint: "Maximum width of an attached figure." },
];

export function QuestionDesignPanel({
  design,
  onChange,
  studioDefault,
  questionNumber = 1,
  defaultOpen = false,
}: {
  design: QuestionDesign;
  onChange: (next: QuestionDesign) => void;
  /** The configured default from Question Studio, used by "Reset to default". */
  studioDefault?: QuestionDesign | null;
  /** The number the preview prints, so the numbering style is visible. */
  questionNumber?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const classes = designClassNames(design);
  const variables = designCssVariables(design);
  const fallback = studioDefault ?? DEFAULT_QUESTION_DESIGN;
  const numberLabel = formatQuestionNumber(questionNumber, design.numberingStyle);

  const set = <K extends keyof QuestionDesign>(field: K, value: QuestionDesign[K]) => {
    onChange(normalizeQuestionDesign({ ...design, [field]: value }));
  };

  return (
    <section className="rounded-2xl border border-evergreen-900/12 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Appearance</h2>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{describeDesign(design)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="px-3 py-1.5 text-xs"
            onClick={() => onChange(normalizeQuestionDesign(fallback))}
            title="Restore the defaults your institution set in Question Studio"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to studio default
          </Button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="question-design-body"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-900 transition hover:bg-evergreen-50"
          >
            <Eye className="h-3.5 w-3.5" />
            {open ? "Hide designer" : "Open designer"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div id="question-design-body" className="grid gap-6 border-t border-evergreen-900/10 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Card layout" hint="How the question is framed on screen and in print.">
                <Select value={design.cardLayout} onChange={(e) => set("cardLayout", e.target.value as QuestionDesign["cardLayout"])}>
                  {CARD_LAYOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Option layout" hint="Applies to choice-based question types.">
                <Select value={design.optionLayout} onChange={(e) => set("optionLayout", e.target.value as QuestionDesign["optionLayout"])}>
                  {OPTION_LAYOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Question numbering" hint="How this question's number is printed.">
                <Select value={design.numberingStyle} onChange={(e) => set("numberingStyle", e.target.value as QuestionDesign["numberingStyle"])}>
                  {NUMBERING_STYLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Figure position" hint="Where an attached image or diagram sits.">
                <Select value={design.imagePosition} onChange={(e) => set("imagePosition", e.target.value as QuestionDesign["imagePosition"])}>
                  {IMAGE_POSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Text alignment">
                <Select value={design.textAlign} onChange={(e) => set("textAlign", e.target.value as QuestionDesign["textAlign"])}>
                  {TEXT_ALIGN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="space-y-3 rounded-xl border border-evergreen-900/10 bg-cream/60 p-4">
              {SLIDERS.map((slider) => (
                <label key={String(slider.field)} className="block">
                  <span className="flex items-baseline justify-between gap-3 text-xs font-semibold text-evergreen-950">
                    {slider.label}
                    <span className="font-display text-sm tabular-nums text-evergreen-800">
                      {Number(design[slider.field])}
                      {slider.unit}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={1}
                    value={Number(design[slider.field])}
                    onChange={(e) => set(slider.field, Number(e.target.value) as never)}
                    className="mt-1.5 w-full accent-evergreen-700"
                    aria-label={slider.label}
                  />
                  <span className="mt-0.5 block text-[11px] leading-4 text-ink-soft">{slider.hint}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={design.showInstructionPanel}
                  onChange={(e) => set("showInstructionPanel", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-evergreen-900/25 accent-evergreen-700"
                />
                <span>
                  Show the instruction panel
                  <span className="block text-xs text-ink-soft">The banner above the question text carrying marks and guidance.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={design.pageBreakBefore}
                  onChange={(e) => set("pageBreakBefore", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-evergreen-900/25 accent-evergreen-700"
                />
                <span>
                  Start a new page before this question
                  <span className="block text-xs text-ink-soft">Applies to the printed examination paper.</span>
                </span>
              </label>
            </div>
          </div>

          {/* Live preview: the same class names and CSS variables the candidate
              screen and the printable paper use, so what an author sees here is
              what a candidate gets. */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Live preview</p>
            <div className="mt-2 rounded-xl border border-dashed border-evergreen-900/20 bg-cream/40 p-4">
              <div className={cn("qs-card", classes.card)} style={{ ...variables, textAlign: design.textAlign } as React.CSSProperties}>
                {design.showInstructionPanel && (
                  <p className="qs-text mb-2 text-[11px] font-semibold uppercase tracking-wide text-evergreen-800">
                    Question {numberLabel} · {design.pageBreakBefore ? "new page · " : ""}4 marks
                  </p>
                )}
                <div className={cn("flex flex-col", classes.body)} style={{ gap: "var(--qs-spacing)" }}>
                  <div className="qs-text" style={{ textAlign: design.textAlign }}>
                    <span className="font-semibold">{numberLabel}.</span> A rectangle has a length of 12 cm and a
                    width of 5 cm. Work out its area, and show the working you used.
                  </div>
                  <div
                    className={cn("qs-media rounded-lg border border-evergreen-900/15 bg-white/70", classes.media)}
                    style={{ padding: "calc(var(--qs-spacing) * 0.75)", textAlign: "center" }}
                    aria-hidden="true"
                  >
                    <span className="text-[11px] uppercase tracking-wide text-ink-soft">Attached figure</span>
                  </div>
                </div>
                <div className={cn("qs-text mt-1", classes.options)}>
                  {["12 cm²", "60 cm²", "34 cm²", "17 cm²"].map((option) => (
                    <span
                      key={option}
                      className="rounded-md border border-evergreen-900/15 bg-white px-3 py-1.5 text-sm text-ink"
                    >
                      {option}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ink-soft">
              These choices are saved with this question. Changing the platform or organization default
              later affects newly authored questions only — papers that are already published keep the
              appearance they were published with.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
