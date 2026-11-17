/**
 * Language metadata for an examination paper.
 *
 * A paper keeps the language in which it was authored. The examination shell
 * sets the document language from this module and marks the paper content as
 * non-translatable; browsers that honour `translate="no"` then leave the
 * questions, choices, tables and formulae alone.
 *
 * `preferred` is the organizer's explicit paper language (settings.language).
 * When it is absent, a deliberately small French/English detector keeps older
 * papers correct without asking teachers to re-save every examination.
 */

export type PaperLanguage = "en" | "fr";

const SUPPORTED: Record<string, PaperLanguage> = {
  en: "en",
  "en-gb": "en",
  "en-us": "en",
  english: "en",
  anglais: "en",
  fr: "fr",
  "fr-fr": "fr",
  "fr-ca": "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
};

export function normalizeExamLanguage(value: unknown): PaperLanguage | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/_/g, "-");
  return SUPPORTED[key] ?? null;
}

const FRENCH_MARKERS = /\b(le|la|les|des|une|un|du|de|est|sont|dans|pour|avec|sur|par|que|qui|quel|quelle|quels|quelles|calculer|calcul|montrer|montre|expliquer|explique|donner|donne|trouver|trouve|valeur|nombre|fonction|tableau|diagramme|graphique|réponse|reponse|question|exercice|démontrer|demontrer|déterminer|determiner|résoudre|resoudre|soit|alors|donc|chaque|cette|ces|son|sa|ses|au|aux|et|ou)\b/gi;
const ENGLISH_MARKERS = /\b(the|a|an|and|or|of|to|in|on|for|with|from|by|is|are|was|were|be|been|this|that|these|those|what|which|calculate|calculate|compute|find|show|explain|state|write|work|value|number|function|table|diagram|graph|question|answer|solve|determine|given|each|its|their|has|have|not|than|then|so)\b/gi;

function markerCount(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * Resolve the paper language. An explicit valid setting always wins; otherwise
 * the prompt text (and optional title/instructions) decides, defaulting to
 * English only when both languages are equally represented.
 */
export function detectExamLanguage(preferred: unknown, sample: string): PaperLanguage {
  const explicit = normalizeExamLanguage(preferred);
  if (explicit) return explicit;
  const text = String(sample ?? "");
  // Accented letters and French-only forms are strong signals even in a short
  // instruction. The stop-word count then breaks ties in longer papers.
  const frenchAccents = (text.match(/[àâçéèêëîïôùûüÿœæ]/gi) ?? []).length;
  const french = markerCount(text, FRENCH_MARKERS) + frenchAccents * 2;
  const english = markerCount(text, ENGLISH_MARKERS);
  return french > english ? "fr" : "en";
}

export function examLanguageLabel(language: PaperLanguage): string {
  return language === "fr" ? "French" : "English";
}
