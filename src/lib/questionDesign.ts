/**
 * Question Studio — design tokens.
 *
 * The Question Studio lets an administrator decide how a question LOOKS
 * without writing CSS. That is only safe if the vocabulary is closed: a design
 * is a small set of bounded numeric tokens plus one choice from a fixed list
 * per axis, and it resolves to (a) inline custom properties and (b) one class
 * name per axis, both drawn from a fixed table in globals.css.
 *
 * Nothing here accepts a raw style string, a class string or a selector, so a
 * no-code design tool can never become a way to inject arbitrary CSS into a
 * candidate's examination page.
 *
 * Snapshot rule (no-regression): a question stores the design it was authored
 * with. Editing a template or a default therefore cannot restyle an
 * examination that is already published or already sat — see
 * `effectiveDesign()`, which prefers the question's own snapshot.
 *
 * Pure module: no Next.js, no database, no React.
 */

export const CARD_LAYOUTS = ["standard", "plain", "panel", "outline_bold"] as const;
export const OPTION_LAYOUTS = ["vertical", "two_column", "inline"] as const;
export const IMAGE_POSITIONS = ["above", "below", "right"] as const;
export const NUMBERING_STYLES = ["arabic", "arabic_bracket", "arabic_dot_paren", "alpha_lower", "roman_lower"] as const;
export const TEXT_ALIGNMENTS = ["start", "center", "end", "justify"] as const;

export type CardLayout = (typeof CARD_LAYOUTS)[number];
export type OptionLayout = (typeof OPTION_LAYOUTS)[number];
export type ImagePosition = (typeof IMAGE_POSITIONS)[number];
export type NumberingStyle = (typeof NUMBERING_STYLES)[number];
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/* ─── narrowing guards ────────────────────────────────────────────────
   Configuration arrives as `unknown` from the database. Each guard accepts
   only a member of the closed vocabulary above, so an unrecognized stored
   value falls back to the shipped default instead of producing a class name
   that matches no rule in globals.css.                                */
export function isCardLayout(v: unknown): v is CardLayout {
  return typeof v === "string" && (CARD_LAYOUTS as readonly string[]).includes(v);
}
export function isOptionLayout(v: unknown): v is OptionLayout {
  return typeof v === "string" && (OPTION_LAYOUTS as readonly string[]).includes(v);
}
export function isImagePosition(v: unknown): v is ImagePosition {
  return typeof v === "string" && (IMAGE_POSITIONS as readonly string[]).includes(v);
}
export function isNumberingStyle(v: unknown): v is NumberingStyle {
  return typeof v === "string" && (NUMBERING_STYLES as readonly string[]).includes(v);
}
export function isTextAlignment(v: unknown): v is TextAlignment {
  return typeof v === "string" && (TEXT_ALIGNMENTS as readonly string[]).includes(v);
}

/** The complete, bounded design vocabulary. */
export interface QuestionDesign {
  cardLayout: CardLayout;
  cornerRadius: number;
  spacing: number;
  padding: number;
  optionLayout: OptionLayout;
  imagePosition: ImagePosition;
  imageMaxWidthPercent: number;
  fontSizePx: number;
  numberingStyle: NumberingStyle;
  textAlign: TextAlignment;
  /** Emphasis for the instruction panel above the question text. */
  showInstructionPanel: boolean;
  /** Print a page break before this question on the examination paper. */
  pageBreakBefore: boolean;
}

/** The shipped appearance — what every existing question already looks like. */
export const DEFAULT_QUESTION_DESIGN: QuestionDesign = {
  cardLayout: "standard",
  cornerRadius: 12,
  spacing: 16,
  padding: 20,
  optionLayout: "vertical",
  imagePosition: "above",
  imageMaxWidthPercent: 100,
  fontSizePx: 16,
  numberingStyle: "arabic",
  textAlign: "start",
  showInstructionPanel: true,
  pageBreakBefore: false,
};

/** Hard bounds — enforced again by the schema, restated here for safety. */
export const DESIGN_BOUNDS = {
  cornerRadius: { min: 0, max: 32 },
  spacing: { min: 4, max: 48 },
  padding: { min: 0, max: 64 },
  imageMaxWidthPercent: { min: 20, max: 100 },
  fontSizePx: { min: 12, max: 24 },
} as const;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(value ?? "").trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Normalise anything stored (a template's `design` jsonb, a question's
 * snapshot, a form payload) into a valid QuestionDesign. Unknown keys are
 * dropped; out-of-range numbers are clamped; a missing field falls back to the
 * shipped default. This is why a malformed row can never break rendering.
 */
export function normalizeQuestionDesign(raw: unknown): QuestionDesign {
  const d = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    cardLayout: oneOf(d.card_layout ?? d.cardLayout, CARD_LAYOUTS, DEFAULT_QUESTION_DESIGN.cardLayout),
    cornerRadius: clamp(d.corner_radius ?? d.cornerRadius, ...bounds("cornerRadius"), DEFAULT_QUESTION_DESIGN.cornerRadius),
    spacing: clamp(d.spacing, ...bounds("spacing"), DEFAULT_QUESTION_DESIGN.spacing),
    padding: clamp(d.padding, ...bounds("padding"), DEFAULT_QUESTION_DESIGN.padding),
    optionLayout: oneOf(d.option_layout ?? d.optionLayout, OPTION_LAYOUTS, DEFAULT_QUESTION_DESIGN.optionLayout),
    imagePosition: oneOf(d.image_position ?? d.imagePosition, IMAGE_POSITIONS, DEFAULT_QUESTION_DESIGN.imagePosition),
    imageMaxWidthPercent: clamp(
      d.image_max_width_percent ?? d.imageMaxWidthPercent,
      ...bounds("imageMaxWidthPercent"),
      DEFAULT_QUESTION_DESIGN.imageMaxWidthPercent,
    ),
    fontSizePx: clamp(d.font_size_px ?? d.fontSizePx, ...bounds("fontSizePx"), DEFAULT_QUESTION_DESIGN.fontSizePx),
    numberingStyle: oneOf(d.numbering_style ?? d.numberingStyle, NUMBERING_STYLES, DEFAULT_QUESTION_DESIGN.numberingStyle),
    textAlign: oneOf(d.text_align ?? d.textAlign, TEXT_ALIGNMENTS, DEFAULT_QUESTION_DESIGN.textAlign),
    showInstructionPanel: d.show_instruction_panel !== false && d.showInstructionPanel !== false,
    pageBreakBefore: d.page_break_before === true || d.pageBreakBefore === true,
  };
}

function bounds(key: keyof typeof DESIGN_BOUNDS): [number, number] {
  const b = DESIGN_BOUNDS[key];
  return [b.min, b.max];
}

/**
 * The design a question is actually rendered with: its own snapshot first, then
 * the template/organization default, then the shipped default. A question that
 * was published before the Studio existed has no snapshot and therefore keeps
 * the shipped appearance — nothing about it changes.
 */
export function effectiveDesign(
  questionSnapshot: unknown,
  fallback?: unknown,
): QuestionDesign {
  if (hasDesign(questionSnapshot)) return normalizeQuestionDesign(questionSnapshot);
  if (hasDesign(fallback)) return normalizeQuestionDesign(fallback);
  return { ...DEFAULT_QUESTION_DESIGN };
}

/** True when a stored value carries at least one recognizable design field. */
export function hasDesign(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw as Record<string, unknown>);
  if (!keys.length) return false;
  const known = new Set([
    "card_layout", "cardLayout", "corner_radius", "cornerRadius", "spacing", "padding",
    "option_layout", "optionLayout", "image_position", "imagePosition",
    "image_max_width_percent", "imageMaxWidthPercent", "font_size_px", "fontSizePx",
    "numbering_style", "numberingStyle", "text_align", "textAlign",
    "show_instruction_panel", "showInstructionPanel", "page_break_before", "pageBreakBefore",
  ]);
  return keys.some((k) => known.has(k));
}

/** Class names the design selects. Every value comes from the fixed tables. */
export function designClassNames(design: QuestionDesign): {
  card: string;
  options: string;
  media: string;
  body: string;
} {
  return {
    card: `qs-card qs-layout-${design.cardLayout}`,
    options: `qs-options qs-options-${design.optionLayout}`,
    media: design.imagePosition === "right" ? "qs-media" : `qs-media qs-media-${design.imagePosition}`,
    body: design.imagePosition === "right" ? "qs-body-right" : "",
  };
}

/**
 * Inline custom properties for the design. Bounded numbers only — this is the
 * entire mechanism by which a saved design changes appearance, and it cannot
 * carry a declaration the schema did not allow.
 */
export function designCssVariables(design: QuestionDesign): Record<string, string> {
  return {
    "--qs-radius": `${design.cornerRadius}px`,
    "--qs-spacing": `${design.spacing}px`,
    "--qs-padding": `${design.padding}px`,
    "--qs-font-size": `${design.fontSizePx}px`,
    "--qs-image-max": `${design.imageMaxWidthPercent}%`,
  };
}

/** Serialise a design for storage in `question_templates.design` / a question snapshot. */
export function designToStorage(design: QuestionDesign): Record<string, unknown> {
  const d = normalizeQuestionDesign(design);
  return {
    card_layout: d.cardLayout,
    corner_radius: d.cornerRadius,
    spacing: d.spacing,
    padding: d.padding,
    option_layout: d.optionLayout,
    image_position: d.imagePosition,
    image_max_width_percent: d.imageMaxWidthPercent,
    font_size_px: d.fontSizePx,
    numbering_style: d.numberingStyle,
    text_align: d.textAlign,
    show_instruction_panel: d.showInstructionPanel,
    page_break_before: d.pageBreakBefore,
  };
}

/** Map the question_studio configuration namespace onto a design. */
export function designFromConfig(config: {
  design_card_layout?: unknown;
  design_corner_radius?: unknown;
  design_spacing?: unknown;
  design_padding?: unknown;
  design_option_layout?: unknown;
  design_image_position?: unknown;
  design_image_max_width_percent?: unknown;
  design_font_size_px?: unknown;
  numbering_style?: unknown;
}): QuestionDesign {
  return normalizeQuestionDesign({
    card_layout: config.design_card_layout,
    corner_radius: config.design_corner_radius,
    spacing: config.design_spacing,
    padding: config.design_padding,
    option_layout: config.design_option_layout,
    image_position: config.design_image_position,
    image_max_width_percent: config.design_image_max_width_percent,
    font_size_px: config.design_font_size_px,
    numbering_style: config.numbering_style,
  });
}

// ─────────────────────────── question numbering ────────────────────────────

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

function toRoman(n: number): string {
  let value = Math.max(1, Math.floor(n));
  let out = "";
  for (const [amount, symbol] of ROMAN) {
    while (value >= amount) {
      out += symbol;
      value -= amount;
    }
  }
  return out;
}

function toAlpha(n: number): string {
  const value = Math.max(1, Math.floor(n));
  let out = "";
  let v = value;
  while (v > 0) {
    const rem = (v - 1) % 26;
    out = String.fromCharCode(97 + rem) + out;
    v = Math.floor((v - 1) / 26);
  }
  return out;
}

/**
 * Render a question number in the configured style. Used by the candidate
 * screen, the printable paper and the Question Studio preview so all three
 * agree — one function, one source of truth.
 */
export function formatQuestionNumber(n: number, style: NumberingStyle = "arabic"): string {
  const value = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
  switch (style) {
    case "arabic_bracket":
      return `${value})`;
    case "arabic_dot_paren":
      return `${value}.`;
    case "alpha_lower":
      return toAlpha(value);
    case "roman_lower":
      return toRoman(value);
    case "arabic":
    default:
      return String(value);
  }
}

/** Option letter for an answer choice (A, B, C …), independent of numbering style. */
export function formatOptionLetter(index: number): string {
  return toAlpha(Math.max(0, Math.floor(index)) + 1).toUpperCase();
}

/**
 * Human summary of a design, for the Question Studio preview panel and the
 * template list. Says plainly what will change.
 */
export function describeDesign(design: QuestionDesign): string[] {
  const d = normalizeQuestionDesign(design);
  return [
    `Card: ${d.cardLayout.replace(/_/g, " ")}`,
    `Corner radius ${d.cornerRadius}px · padding ${d.padding}px · spacing ${d.spacing}px`,
    `Answer options: ${d.optionLayout.replace(/_/g, " ")}`,
    `Media: ${d.imagePosition === "right" ? "beside the text" : d.imagePosition} the text, max ${d.imageMaxWidthPercent}% width`,
    `Question text ${d.fontSizePx}px, aligned ${d.textAlign}`,
    `Numbering: ${formatQuestionNumber(1, d.numberingStyle)} style (${d.numberingStyle.replace(/_/g, " ")})`,
    d.showInstructionPanel ? "Instruction panel shown" : "Instruction panel hidden",
    d.pageBreakBefore ? "Page break before this question on the paper" : "No forced page break",
  ];
}
