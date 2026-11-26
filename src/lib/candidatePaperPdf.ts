import {
  PDFDocument,
  PDFImage,
  PDFPage,
  PDFFont,
  rgb,
  type Color,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { normaliseAssessDiagram, type AssessDiagramSpec } from "./assessDiagram.ts";
import { latexToUnicode } from "./latexToUnicode.ts";
import { renderMathProse } from "./mathProse.ts";
import { embedPaperFonts } from "./pdfFonts.ts";
import { type RichDoc, type RichNode } from "./content.ts";
import { normaliseDataTableSpec, type DataTableSpec } from "./dataTableSpec.ts";
import { normaliseGeometrySpec, type GeometrySpec } from "./geometrySpec.ts";
import {
  GRAPH_VIEW,
  graphLayout,
  normaliseGraphSpec,
  sampleGraphFunction,
  type GraphSpec,
} from "./graphSpec.ts";
import { type ProbabilityTreeSpec } from "./probabilityTreeSpec.ts";
import {
  cumulativeFrequencies,
  groupedCumulativePoints,
  groupedSeries,
  histogramBins,
  normaliseStatsSpec,
  statsSummary,
  type StatsSpec,
} from "./statsSpec.ts";
import { type StemLeafSpec } from "./stemLeafSpec.ts";
import { type VennSpec } from "./vennSpec.ts";
import type {
  CandidatePaperData,
  CandidatePaperQuestion,
} from "./candidatePaper.ts";

/**
 * Pure server-side A4 PDF renderer for an individual candidate's submitted
 * examination paper (ManageBac academic evidence).
 *
 * Uses `pdf-lib` with native vector rendering for graphs, statistics charts,
 * assessment diagrams, geometry sketches, bordered tables, and structured
 * mathematical workspaces — no headless browser or native binary required.
 *
 * Structurally accepts ONLY `CandidatePaperData`, which excludes answer keys,
 * model answers, marking schemes, proctoring logs, and internal DB IDs.
 */

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN_X = 42;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 44;
const CONTENT_W = A4_W - MARGIN_X * 2; // 511.28 pt

const C_EVERGREEN = rgb(0.039, 0.361, 0.212); // #0a5c36
const C_EVERGREEN_DARK = rgb(0.024, 0.212, 0.125); // #063620
const C_EVERGREEN_SOFT = rgb(0.929, 0.961, 0.941); // #edf5f0
const C_GOLD = rgb(0.788, 0.635, 0.153); // #c9a227
const C_GOLD_SOFT = rgb(0.985, 0.969, 0.918); // #fbf7ea
const C_CREAM = rgb(0.980, 0.973, 0.949); // #faf8f2
const C_INK = rgb(0.090, 0.137, 0.118); // #17231e
const C_MUTED = rgb(0.322, 0.384, 0.357); // #52625b
const C_SUBTLE = rgb(0.510, 0.565, 0.541); // #82908a
const C_RULE = rgb(0.835, 0.875, 0.855); // #d5dfd9
const C_GRID = rgb(0.905, 0.925, 0.914); // #e7ece9
const C_WHITE = rgb(1, 1, 1);
const C_CARD_BG = rgb(0.976, 0.984, 0.978); // #f9fbfa
const C_BLUE = rgb(0.118, 0.365, 0.690); // #1e5db0
const C_CORAL = rgb(0.761, 0.239, 0.239); // #c23d3d
const C_AMBER = rgb(0.706, 0.475, 0.047); // #b4790c
const C_PURPLE = rgb(0.451, 0.267, 0.678); // #7344ad

/* ─── Unicode-safe text preparation ───────────────────────────────────
 *
 * The paper is set in embedded DejaVu Serif (see pdfFonts.ts), which carries the
 * Unicode mathematical operators, Greek letters and the super/subscript blocks.
 * So unlike the old WinAnsi pipeline, text is NOT transliterated to ASCII:
 * `≤`, `√`, `u₂₅`, `π` and `Δ` are printed as themselves.
 *
 * What is still cleaned up:
 *   * characters with no glyph in the embedded face (emoji, symbols used as
 *     decoration) are dropped rather than printing as tofu;
 *   * control characters and zero-width joiners are removed;
 *   * combining marks are kept only where the font composes them.
 * ─────────────────────────────────────────────────────────────────────── */

/** Characters the embedded fonts do not draw; dropped before printing. */
const DROPPED_CHARS = new Set([
  "\u200b", "\u200c", "\u200d", "\u2060", "\ufeff", "\u00ad",
]);

function isPrintable(cp: number): boolean {
  // Control characters never print; tabs and newlines are handled by callers.
  if (cp < 0x20 || cp === 0x7f) return false;
  // Private use areas are never real text.
  if (cp >= 0xe000 && cp <= 0xf8ff) return false;
  // Astral-plane pictographs (emoji) are decoration, not content.
  if (cp >= 0x1f000 && cp <= 0x1faff) return false;
  return true;
}

/**
 * Make text safe to draw with the embedded fonts while preserving every
 * mathematical character the fonts can render.
 */
export function sanitizeForPdfFont(input: string): string {
  if (!input) return "";
  // Emphasis markers are typography, never content. Stripping them here as well
  // as in `renderMathProse` makes it impossible for any remaining draw path to
  // print "**Find**" to a student, even one that skips the prose formatter.
  let out = "";
  for (const ch of input.replace(/\*{2,}/g, "")) {
    if (ch === "\n") { out += ch; continue; }
    if (ch === "\t") { out += "  "; continue; }
    if (ch === "\r") continue;
    if (DROPPED_CHARS.has(ch)) continue;
    const cp = ch.codePointAt(0) ?? 0;
    if (!isPrintable(cp)) continue;
    if (ch === "\u00a0" || ch === "\u202f") { out += " "; continue; }
    out += ch;
  }
  return out;
}

/**
 * Convert a single LaTeX expression to Unicode mathematics.
 *
 * Delegates to the shared converter so the paper and the results view set an
 * expression identically. The old implementation applied regular substitutions
 * that broke on nesting and on TeX shorthands: `\frac12` printed as "frac12"
 * because only `\frac{..}{..}` was handled, and `^{n-1}` printed as a caret.
 */
export function formatLatexExpr(latex: string): string {
  if (!latex) return "";
  return sanitizeForPdfFont(latexToUnicode(latex));
}

/**
 * Format prose that may contain embedded `$...$` / `$$...$$` / `\(...\)` maths.
 *
 * Currency amounts are protected, so `$25 000 in Year 1` stays money while
 * `$V_n = 25 000(0.8)^{n-1}$` is typeset.
 */
export function formatProseWithMath(input: string): string {
  if (!input) return "";
  return sanitizeForPdfFont(renderMathProse(input));
}

/**
 * The marker printed before a part's prompt.
 *
 * Part labels are authored as "(i) r" while the prompt already says "Common
 * ratio r", so printing both repeats the variable. When the label's tail is a
 * word the prompt already contains, only the sub-part marker is printed.
 */
/**
 * Parse a block that was authored as a pipe-delimited table.
 *
 * Production prompts carry tables as plain text: a caption line, then a header
 * row followed by "| 1", "| 2", … value rows, repeated per column group. Printed
 * verbatim that becomes a tall list of lonely numbers, which is unreadable.
 *
 * A line is a header when the next non-empty line starts with "|", so a leading
 * sentence stays a caption rather than being swallowed as a column title.
 */
function parsePipedTable(lines: string[]): {
  caption: string | null;
  headers: string[];
  rows: string[][];
  trailing: string | null;
} | null {
  const items = lines.map((l) => l.trim()).filter(Boolean);
  const pipeCount = items.filter((l) => l.startsWith("|")).length;
  if (pipeCount < 2) return null;

  const prose: string[] = [];
  const trailing: string[] = [];
  const groups: { header: string; values: string[] }[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const line = items[i];
    if (line.startsWith("|")) {
      const target = groups[groups.length - 1];
      if (!target) return null;
      target.values.push(...line.replace(/^\|/, "").split("|").map((c) => c.trim()));
      continue;
    }
    const next = items[i + 1];
    if (next && next.startsWith("|")) {
      groups.push({ header: line, values: [] });
      continue;
    }
    // A line with no values under it is prose. Before the table it is the
    // caption; after it, the question's own instruction ("Find k.").
    if (groups.length) trailing.push(line);
    else prose.push(line);
  }
  if (!groups.length || !groups.every((g) => g.values.length)) return null;

  // Consecutive groups are the columns of a single table: the first names the
  // row axis ("Term n") and the rest carry the values. Stacking them would put
  // the term numbers beside the wrong values.
  if (groups.length > 1) {
    const height = Math.max(...groups.map((g) => g.values.length));
    const rows: string[][] = [];
    for (let r = 0; r < height; r += 1) rows.push(groups.map((g) => g.values[r] ?? ""));
    return {
      caption: prose.join(" ") || null,
      headers: groups.map((g) => g.header),
      rows,
      trailing: trailing.join(" ") || null,
    };
  }

  const [only] = groups;
  return {
    caption: prose.join(" ") || null,
    headers: [only.header, "Value"],
    rows: only.values.map((v, i) => [String(i + 1), v]),
    trailing: trailing.join(" ") || null,
  };
}

/**
 * The prefix to print before a part's prompt.
 *
 * A label like "(a)(iii) total" carries a marker plus a description of the part.
 * Printing the description is right when it adds information ("Q1" before "Lower
 * quartile"), but it reads as a stutter when the prompt already says the same
 * words ("grouped mean" before "Common grouped estimated mean"). So a tail is
 * dropped as soon as any of its content words appear in the prompt, and a tail
 * made only of generic words ("third", "total") is dropped too — it names
 * nothing the prompt has not already said.
 */
function partMarker(label: string, prompt: string | null | undefined): string {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return "";
  const prose = (prompt ?? "").toLowerCase();
  // With no prompt the label *is* the description, so print it whole.
  if (!prose.trim()) return trimmed;

  const restated = (words: string[]) => words.some((w) => hasWord(prose, w));

  // A label can carry several parenthesised markers plus a trailing word, as in
  // "(a)(iii) total" or "(i) Common ratio r".
  const m = /^((?:\([^)]*\)\s*)+|[A-Za-z0-9]+\s+)(.*)$/.exec(trimmed);
  if (!m) return restated(wordsOf(trimmed)) ? "" : trimmed;
  const [, marker, tail] = m;
  const isLetterMarker = /^\(/.test(marker);

  // "Midpoint 1" / "Midpoint 2": the tail is a bare ordinal, so the words that
  // describe the part come from the marker itself.
  const descriptive = /^\d+$/.test(tail.trim())
    ? wordsOf(marker.replace(/[^A-Za-z].*$/, ""))
    : wordsOf(tail);

  // A tail of only generic words ("(c)(i) third", "(b) total") names nothing, so
  // keep the marker and let the prompt speak for itself.
  if (!descriptive.length) return isLetterMarker ? marker.trim() : trimmed;

  if (!restated(descriptive)) return trimmed;
  // The prompt already carries the description: keep only a letter marker,
  // which is a reference the prompt cannot supply.
  return isLetterMarker ? marker.trim() : "";
}

/** Lower-case content words of a label tail, ignoring number and filler words. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 &]+/g, " ")
    .split(/[\s&]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !STOP_WORDS.has(w))
    .flatMap((w) => LABEL_ABBREVIATIONS[w] ?? [w]);
}

/** Abbreviations that a prompt spells out, so comparisons happen on meaning. */
const LABEL_ABBREVIATIONS: Record<string, string[]> = {
  sd: ["standard", "deviation"],
  std: ["standard", "deviation"],
  iqr: ["interquartile", "range"],
  med: ["median"],
  var: ["variance"],
  q1: ["lower", "quartile"],
  q3: ["upper", "quartile"],
};

const STOP_WORDS = new Set([
  "the", "of", "and", "for", "in", "on", "to", "with", "using", "all", "each",
  "a", "an", "two", "three", "one", "first", "second", "third", "total",
]);

/**
 * Whole-word (or bare number) membership, case-insensitive.
 *
 * A label and its prompt often differ only in number ("medians and ranges" for
 * "Median and range for each group"), so a simple plural ending is accepted as
 * the same word rather than treated as new information.
 */
function hasWord(haystack: string, needle: string): boolean {
  const stem = needle.replace(/(?:es|s)$/i, "");
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?:e?s)?([^a-z0-9]|$)`, "i").test(haystack);
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

/**
 * How a candidate's question-level mark is presented on the paper.
 *
 * `null` marks mean the question has not been marked, so no verdict is shown.
 * A full award is CORRECT (green), a zero is WRONG (red), and anything in
 * between is labelled PARTIAL CREDIT (amber) rather than being coloured like a
 * full mark. Pure presentation: it reads the engine's awarded mark and never
 * re-derives or adjusts it.
 */
type QuestionVerdict = { label: string; color: ReturnType<typeof rgb> };

function verdictForStatus(status: string): QuestionVerdict | null {
  if (status === "correct") return { label: "CORRECT", color: C_EVERGREEN };
  if (status === "partial") return { label: "PARTIAL CREDIT", color: C_AMBER };
  if (status === "wrong") return { label: "WRONG", color: C_CORAL };
  if (status === "unanswered") return { label: "NOT ANSWERED", color: C_CORAL };
  return null;
}

function questionVerdict(awarded: number | null, marks: number): QuestionVerdict | null {
  if (awarded === null || !Number.isFinite(awarded)) return null;
  const max = Number.isFinite(marks) ? marks : 0;
  if (max > 0 && awarded >= max - 1e-9) return verdictForStatus("correct");
  if (awarded <= 1e-9) return verdictForStatus("wrong");
  return verdictForStatus("partial");
}

function fmtDateUtc(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()] ?? "Jan";
  const yr = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${mon} ${yr}, ${hh}:${mm} UTC`;
}

function parseHexColor(hex: string | undefined, fallback: Color): Color {
  if (!hex || typeof hex !== "string") return fallback;
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function niceTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + step * 1e-6 && out.length < 24; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out.length ? out : [min, max];
}

/* ─── Safe Image Loading (SSRF-hardened, bounded size & timeout) ─────── */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const IMAGE_FETCH_TIMEOUT_MS = 2_500;
/**
 * Logos are printed at most ~34pt high, so ~4x that in pixels is already beyond
 * print resolution. Downscaling keeps the PDF small and avoids embedding a
 * multi-megapixel original.
 */
const MAX_LOGO_WIDTH_PX = 600;

function isAllowedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "evalora-edu.online" || h.endsWith(".evalora-edu.online")) return true;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const supaHost = new URL(supabaseUrl).hostname.toLowerCase();
      if (h === supaHost) return true;
    } catch {
      // ignore invalid env URL
    }
  }
  if (h.endsWith(".supabase.co") || h.endsWith(".supabase.in")) return true;
  return false;
}

/**
 * Which raster the bytes actually are, decided from the magic number rather
 * than from a Content-Type header or a file extension. An organization logo URL
 * is user-supplied data, so trusting its extension is how a WebP gets handed to
 * `embedPng` and silently disappears from the document.
 */
function sniffRaster(bytes: Uint8Array): "png" | "jpeg" | "webp" | "other" {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return "other";
}

/**
 * Read a logo that lives in this application's own `public/` directory.
 *
 * Organization logos are commonly stored as a site-relative path
 * (e.g. `/brand/oak-international-school-logo.webp`). The PDF engine runs on the
 * server, where a relative path has no origin to resolve against, so it must be
 * read from disk. Only a strictly-relative path is accepted and traversal is
 * rejected, so a crafted logo_url can never read outside `public/`.
 */
/**
 * The committed PNG companion for a WebP logo, when one exists.
 *
 * `scripts/build-logo-pngs.mjs` writes `<name>.png` beside every `<name>.webp`
 * in `public/brand`. Embedding that directly keeps the school logo deterministic
 * on hosts where the native `sharp` module is unavailable, instead of quietly
 * dropping it from an official student record.
 */
function pngCompanionPath(src: string): string | null {
  if (!/\.webp$/i.test(src)) return null;
  return src.replace(/\.webp$/i, ".png");
}

async function readPublicAsset(relativePath: string): Promise<Uint8Array | null> {
  let path: string;
  try {
    path = decodeURIComponent(relativePath);
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("\0") || path.split("/").includes("..")) return null;
  if (!/\.(png|jpe?g|webp)$/i.test(path)) return null;
  const absolute = join(process.cwd(), "public", path.replace(/^\/+/, ""));
  try {
    const resolved = resolve(absolute);
    const publicRoot = resolve(process.cwd(), "public");
    if (resolved !== publicRoot && !resolved.startsWith(publicRoot + sep)) return null;
    const bytes = await readFile(resolved);
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode any browser-supported raster (WebP in particular) into a raster
 * `pdf-lib` can embed.
 *
 * `pdf-lib` only embeds PNG and JPEG. Organization logos are routinely uploaded
 * or generated as WebP, which is why the school logo was missing from candidate
 * papers entirely. `sharp` is already a project dependency (it backs the Next.js
 * image optimizer), so it is used to transcode to PNG and to size the logo down
 * to a print-appropriate resolution rather than embedding a 2560px original.
 */
async function transcodeToPng(
  bytes: Uint8Array,
  targetWidthPx = MAX_LOGO_WIDTH_PX,
): Promise<Uint8Array | null> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default ?? (sharpModule as unknown as typeof sharpModule.default);
    if (typeof sharp !== "function") return null;
    const out = await sharp(Buffer.from(bytes))
      .resize({ width: targetWidthPx, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    if (!out.byteLength || out.byteLength > MAX_IMAGE_BYTES) return null;
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function tryEmbedImage(
  pdf: PDFDocument,
  src: string,
  cache: Map<string, PDFImage | null>,
): Promise<PDFImage | null> {
  if (!src || typeof src !== "string") return null;
  if (cache.has(src)) return cache.get(src) ?? null;

  try {
    let bytes: Uint8Array | null = null;

    if (src.startsWith("data:image/")) {
      // Base64 data URL — any supported image type is accepted and sniffed below.
      const m = src.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
      if (!m) {
        cache.set(src, null);
        return null;
      }
      const buf = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
      if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) {
        cache.set(src, null);
        return null;
      }
      bytes = new Uint8Array(buf);
    } else if (/^https:\/\//i.test(src)) {
      let parsed: URL;
      try {
        parsed = new URL(src);
      } catch {
        cache.set(src, null);
        return null;
      }
      if (!isAllowedImageHost(parsed.hostname)) {
        cache.set(src, null);
        return null;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(parsed.toString(), { signal: ctrl.signal, redirect: "error" });
        if (!res.ok) {
          cache.set(src, null);
          return null;
        }
        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0 || ab.byteLength > MAX_IMAGE_BYTES) {
          cache.set(src, null);
          return null;
        }
        bytes = new Uint8Array(ab);
      } finally {
        clearTimeout(timer);
      }
    } else if (src.startsWith("/")) {
      // Site-relative asset shipped with the application (the usual case for an
      // organization logo: "/brand/oak-international-school-logo.webp").
      bytes = await readPublicAsset(src);
    } else {
      cache.set(src, null);
      return null;
    }

    if (!bytes) {
      cache.set(src, null);
      return null;
    }

    // Decide the real format from the bytes, then transcode anything that is not
    // already a PNG/JPEG into PNG.
    let kind = sniffRaster(bytes);
    let raster: Uint8Array = bytes;
    if (kind === "webp" || kind === "other") {
      // Prefer a committed PNG sibling: no native module, no per-request cost,
      // and a guaranteed result on serverless hosts.
      const companion = pngCompanionPath(src);
      const fromCompanion = companion ? await readPublicAsset(companion) : null;
      const png = fromCompanion ?? (await transcodeToPng(bytes));
      if (!png) {
        cache.set(src, null);
        return null;
      }
      raster = png;
      kind = sniffRaster(png) === "png" ? "png" : "other";
      if (kind !== "png") {
        cache.set(src, null);
        return null;
      }
    }

    const embedded =
      kind === "png" ? await pdf.embedPng(raster) : kind === "jpeg" ? await pdf.embedJpg(raster) : null;
    cache.set(src, embedded);
    return embedded;
  } catch {
    cache.set(src, null);
    return null;
  }
}

/* ─── Layout Engine ──────────────────────────────────────────────────── */

class PaperLayout {
  readonly pdf: PDFDocument;
  readonly fontRegular: PDFFont;
  readonly fontBold: PDFFont;
  readonly fontItalic: PDFFont;
  readonly fontMono: PDFFont;
  readonly header: CandidatePaperData["header"];
  readonly pages: PDFPage[] = [];
  readonly imageCache = new Map<string, PDFImage | null>();
  page!: PDFPage;
  y = 0;

  constructor(
    pdf: PDFDocument,
    fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont },
    header: CandidatePaperData["header"],
  ) {
    this.pdf = pdf;
    this.fontRegular = fonts.regular;
    this.fontBold = fonts.bold;
    this.fontItalic = fonts.italic;
    this.fontMono = fonts.mono;
    this.header = header;
  }

  newPage(first = false): PDFPage {
    const page = this.pdf.addPage([A4_W, A4_H]);
    this.pages.push(page);
    this.page = page;

    if (first) {
      this.y = A4_H - 28;
    } else {
      // Compact running header on continuation pages
      page.drawRectangle({ x: 0, y: A4_H - 4, width: A4_W, height: 4, color: C_EVERGREEN });
      const leftText = this.truncate(
        `EVALORA  ·  ${sanitizeForPdfFont(this.header.schoolName)}  ·  ${sanitizeForPdfFont(this.header.candidateFullName)}`,
        335,
        this.fontBold,
        7.5,
      );
      const rightLabel = [this.header.subject, this.header.examVersion].filter(Boolean).join(" · ") || "Candidate Paper";
      const rightText = this.truncate(sanitizeForPdfFont(rightLabel), 165, this.fontRegular, 7.5);
      page.drawText(leftText, {
        x: MARGIN_X,
        y: A4_H - 24,
        size: 7.5,
        font: this.fontBold,
        color: C_EVERGREEN_DARK,
      });
      const rw = this.fontRegular.widthOfTextAtSize(rightText, 7.5);
      page.drawText(rightText, {
        x: A4_W - MARGIN_X - rw,
        y: A4_H - 24,
        size: 7.5,
        font: this.fontRegular,
        color: C_MUTED,
      });
      page.drawLine({
        start: { x: MARGIN_X, y: A4_H - 30 },
        end: { x: A4_W - MARGIN_X, y: A4_H - 30 },
        thickness: 0.6,
        color: C_RULE,
      });
      this.y = A4_H - MARGIN_TOP;
    }
    return page;
  }

  ensure(heightNeeded: number): void {
    const minY = MARGIN_BOTTOM + 8;
    if (this.y - heightNeeded < minY) {
      this.newPage(false);
    }
  }

  truncate(text: string, maxWidth: number, font: PDFFont, size: number): string {
    const clean = sanitizeForPdfFont(text).replace(/\s+/g, " ").trim();
    if (!clean) return "";
    if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
    const ellipsis = "...";
    let lo = 0;
    let hi = clean.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (font.widthOfTextAtSize(clean.slice(0, mid) + ellipsis, size) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return clean.slice(0, Math.max(1, lo)).trimEnd() + ellipsis;
  }

  wrap(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
    const safe = sanitizeForPdfFont(text);
    const out: string[] = [];
    const paragraphs = safe.split(/\r?\n/);
    for (const para of paragraphs) {
      const trimmedRight = para.replace(/[ \t]+$/g, "");
      if (!trimmedRight.trim()) {
        out.push("");
        continue;
      }
      const words = trimmedRight.split(/\s+/);
      let line = "";
      for (const word of words) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
        } else {
          if (line) out.push(line);
          // Break overlong token gracefully (e.g. long URLs or expressions)
          if (font.widthOfTextAtSize(word, size) <= maxWidth) {
            line = word;
          } else {
            let chunk = "";
            for (const ch of word) {
              if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
                chunk += ch;
              } else {
                if (chunk) out.push(chunk);
                chunk = ch;
              }
            }
            line = chunk;
          }
        }
      }
      if (line) out.push(line);
    }
    return out;
  }

  drawWrapped(
    text: string,
    opts: {
      x?: number;
      maxWidth?: number;
      font?: PDFFont;
      size?: number;
      lineHeight?: number;
      color?: Color;
      gapAfter?: number;
    } = {},
  ): void {
    const x = opts.x ?? MARGIN_X;
    const maxWidth = opts.maxWidth ?? CONTENT_W - (x - MARGIN_X);
    const font = opts.font ?? this.fontRegular;
    const size = opts.size ?? 9.5;
    const lineHeight = opts.lineHeight ?? Math.round((size * 1.42) * 10) / 10;
    const color = opts.color ?? C_INK;
    const lines = this.wrap(text, maxWidth, font, size);
    for (const line of lines) {
      this.ensure(lineHeight);
      if (line) {
        this.page.drawText(line, { x, y: this.y - size, size, font, color });
      }
      this.y -= lineHeight;
    }
    if (opts.gapAfter) this.y -= opts.gapAfter;
  }

  /* ─── Page 1 Header & Metadata ─────────────────────────────────────── */

  async drawFirstPageHeader(): Promise<void> {
    this.newPage(true);
    const h = this.header;

    // Top EVALORA evergreen + gold accent bars
    this.page.drawRectangle({ x: 0, y: A4_H - 6, width: A4_W, height: 6, color: C_EVERGREEN });
    this.page.drawRectangle({ x: 0, y: A4_H - 8.5, width: A4_W, height: 2.5, color: C_GOLD });

    this.y = A4_H - 26;

    // The school's own logo, top-right. This is the administering institution's
    // mark from its organization record — never the EVALORA brand, which appears
    // only as the small platform attribution below.
    let logoWidthReserved = 0;
    if (h.organizationLogoUrl) {
      const logo = await tryEmbedImage(this.pdf, h.organizationLogoUrl, this.imageCache);
      if (logo) {
        const maxH = 40;
        const maxW = 104;
        const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
        const w = logo.width * scale;
        const height = logo.height * scale;
        this.page.drawImage(logo, {
          x: A4_W - MARGIN_X - w,
          y: this.y - height + 4,
          width: w,
          height,
        });
        logoWidthReserved = w + 12;
      }
    }

    // Document classification leads; the platform is attribution, not the subject.
    this.page.drawText("CANDIDATE EXAMINATION PAPER", {
      x: MARGIN_X,
      y: this.y - 10,
      size: 9.5,
      font: this.fontBold,
      color: C_EVERGREEN,
    });
    const classificationW = this.fontBold.widthOfTextAtSize("CANDIDATE EXAMINATION PAPER", 9.5);
    this.page.drawText("  |  OFFICIAL STUDENT RECORD", {
      x: MARGIN_X + classificationW,
      y: this.y - 9.5,
      size: 7.5,
      font: this.fontBold,
      color: C_GOLD,
    });
    this.y -= 16;

    // School Name
    this.drawWrapped(h.schoolName, {
      x: MARGIN_X,
      maxWidth: CONTENT_W - logoWidthReserved,
      font: this.fontBold,
      size: 13.5,
      lineHeight: 16.5,
      color: C_EVERGREEN_DARK,
      gapAfter: 2,
    });

    // Examination Title
    this.drawWrapped(h.examTitle, {
      x: MARGIN_X,
      maxWidth: CONTENT_W - logoWidthReserved,
      font: this.fontBold,
      size: 11.5,
      lineHeight: 15,
      color: C_INK,
      gapAfter: 8,
    });

    // Structured Metadata Box
    const leftPairs: [string, string][] = [
      ["Candidate", h.candidateFullName],
      ["Class / Grade", h.className ?? h.gradeLabel ?? "—"],
      ["Subject", h.subject ?? "—"],
      ...(h.examVersion ? [["Exam Version", h.examVersion] as [string, string]] : []),
    ];

    const marksVisible = h.resultsPublished || h.markingPreview;
    const scoreSummary =
      marksVisible && h.score !== null && h.maxScore !== null
        ? `${fmtNum(h.score)} / ${fmtNum(h.maxScore)}${h.percentage !== null ? ` (${fmtNum(h.percentage)}%)` : ""}${
            h.markingPreview ? "  ·  STAFF PREVIEW — NOT RELEASED" : ""
          }`
        : h.resultsPublished
          ? "Published — Pending final mark"
          : "Pending publication (withheld)";

    const rightPairs: [string, string][] = [
      ["Date of Exam", fmtDateUtc(h.examDateIso)],
      [
        "Status",
        h.attemptNumber > 1
          ? `${h.submissionStatusLabel} (Attempt ${h.attemptNumber})`
          : h.submissionStatusLabel,
      ],
      [
        "Paper Summary",
        `${h.answeredCount}/${h.questionCount} answered · ${fmtNum(h.totalMarks)} marks`,
      ],
      ["Score", scoreSummary],
    ];

    const rowCount = Math.max(leftPairs.length, rightPairs.length);
    const rowH = 15.5;
    const boxPadY = 9;
    const boxH = rowCount * rowH + boxPadY * 2;
    const boxY = this.y - boxH;

    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: CONTENT_W,
      height: boxH,
      color: C_CREAM,
      borderColor: C_RULE,
      borderWidth: 0.8,
    });
    // Evergreen left edge accent on metadata box
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: 3,
      height: boxH,
      color: C_EVERGREEN,
    });

    const colW = (CONTENT_W - 22) / 2;
    const leftX = MARGIN_X + 11;
    const rightX = MARGIN_X + 14 + colW;

    // The label column is measured from the face actually in use. A fixed width
    // was fine for Helvetica but the embedded serif is wider, and "Paper Summary"
    // ran into its value.
    const labelSize = 8.2;
    const labelW =
      Math.max(
        ...[...leftPairs, ...rightPairs].map(([label]) =>
          this.fontBold.widthOfTextAtSize(`${label}:`, labelSize),
        ),
      ) + 7;

    for (let i = 0; i < rowCount; i += 1) {
      const baseline = this.y - boxPadY - i * rowH - 10;
      const lp = leftPairs[i];
      if (lp) {
        this.page.drawText(`${lp[0]}:`, {
          x: leftX,
          y: baseline,
          size: labelSize,
          font: this.fontBold,
          color: C_MUTED,
        });
        const val = this.truncate(lp[1], colW - labelW - 4, this.fontRegular, 8.5);
        this.page.drawText(val, {
          x: leftX + labelW,
          y: baseline,
          size: 8.5,
          font: i === 0 ? this.fontBold : this.fontRegular,
          color: C_INK,
        });
      }
      const rp = rightPairs[i];
      if (rp) {
        this.page.drawText(`${rp[0]}:`, {
          x: rightX,
          y: baseline,
          size: labelSize,
          font: this.fontBold,
          color: C_MUTED,
        });
        const isPublishedScore = rp[0] === "Score" && h.resultsPublished && h.score !== null;
        const val = this.truncate(rp[1], colW - labelW - 4, isPublishedScore ? this.fontBold : this.fontRegular, 8.5);
        this.page.drawText(val, {
          x: rightX + labelW,
          y: baseline,
          size: 8.5,
          font: isPublishedScore ? this.fontBold : this.fontRegular,
          color: isPublishedScore ? C_EVERGREEN_DARK : C_INK,
        });
      }
    }

    this.y = boxY - 12;

    // Official notice banner
    const notice = h.resultsPublished
      ? "Official candidate submission record showing the candidate's exam paper, submitted responses, and published marks. Answer keys and internal marking schemes are excluded."
      : "Official candidate submission record showing the candidate's exam paper and submitted responses exactly as recorded. Marks and answer keys are excluded.";
    this.drawWrapped(notice, {
      x: MARGIN_X,
      maxWidth: CONTENT_W,
      font: this.fontItalic,
      size: 7.8,
      lineHeight: 11,
      color: C_MUTED,
      gapAfter: 10,
    });
  }

  /* ─── Criterion-Level Results Summary ─────────────────────────────── */

  /**
   * The candidate's validated result, broken down by MYP criterion.
   *
   * Printed only when results are published AND the examination's marking
   * records actually cover a criterion, so an unpublished or non-MYP paper can
   * never show a fabricated breakdown. Marks come straight from the results
   * engine — this method performs no scoring of its own.
   */
  drawCriterionResults(): void {
    const h = this.header;
    if (!h.resultsPublished || h.criteria.length === 0) return;

    const title = "Validated Results by Criterion";
    const cols = h.criteria;
    const rowH = 17;
    const headerH = 22;
    const tableH = headerH + cols.length * rowH;
    const totalH = tableH + 34;
    this.ensure(totalH + 28);

    const topY = this.y;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: topY - totalH,
      width: CONTENT_W,
      height: totalH,
      color: C_CREAM,
      borderColor: C_RULE,
      borderWidth: 0.8,
    });
    this.page.drawRectangle({ x: MARGIN_X, y: topY - totalH, width: 3, height: totalH, color: C_GOLD });

    // Title
    this.page.drawText(sanitizeForPdfFont(title), {
      x: MARGIN_X + 12,
      y: topY - 15,
      size: 10,
      font: this.fontBold,
      color: C_EVERGREEN_DARK,
    });

    // Column geometry: criterion | title | awarded / maximum | %
    const x0 = MARGIN_X + 12;
    const xCriterion = x0;
    const xTitle = x0 + 74;
    const xMarks = MARGIN_X + CONTENT_W - 132;
    const xPercent = MARGIN_X + CONTENT_W - 58;
    const headerBaseline = topY - headerH - 6;

    this.page.drawText("Criterion", { x: xCriterion, y: headerBaseline, size: 7.4, font: this.fontBold, color: C_MUTED });
    this.page.drawText("Description", { x: xTitle, y: headerBaseline, size: 7.4, font: this.fontBold, color: C_MUTED });
    this.page.drawText("Marks", { x: xMarks, y: headerBaseline, size: 7.4, font: this.fontBold, color: C_MUTED });
    this.page.drawText("%", { x: xPercent, y: headerBaseline, size: 7.4, font: this.fontBold, color: C_MUTED });

    this.page.drawLine({
      start: { x: x0, y: topY - headerH - 10 },
      end: { x: MARGIN_X + CONTENT_W - 12, y: topY - headerH - 10 },
      thickness: 0.6,
      color: C_RULE,
    });

    cols.forEach((criterion, index) => {
      const baseline = topY - headerH - 10 - (index + 1) * rowH + 6;
      this.page.drawText(sanitizeForPdfFont(`Criterion ${criterion.code}`), {
        x: xCriterion,
        y: baseline,
        size: 8.6,
        font: this.fontBold,
        color: C_EVERGREEN_DARK,
      });
      const titleText = this.truncate(criterion.title, xMarks - xTitle - 10, this.fontRegular, 8.4);
      this.page.drawText(titleText, { x: xTitle, y: baseline, size: 8.4, font: this.fontRegular, color: C_INK });
      this.page.drawText(sanitizeForPdfFont(`${fmtNum(criterion.marksAwarded)} / ${fmtNum(criterion.marksMax)}`), {
        x: xMarks,
        y: baseline,
        size: 8.6,
        font: this.fontBold,
        color: C_INK,
      });
      this.page.drawText(sanitizeForPdfFont(criterion.percent === null ? "—" : `${fmtNum(criterion.percent)}%`), {
        x: xPercent,
        y: baseline,
        size: 8.6,
        font: this.fontRegular,
        color: C_MUTED,
      });
    });

    // Overall total line, deliberately kept subordinate to the breakdown.
    const totalBaseline = topY - totalH + 13;
    const overall = `${h.score !== null ? fmtNum(h.score) : "—"} / ${h.maxScore !== null ? fmtNum(h.maxScore) : "—"}${
      h.percentage !== null ? `  (${fmtNum(h.percentage)}%)` : ""
    }`;
    this.page.drawText(sanitizeForPdfFont("Overall total"), {
      x: x0,
      y: totalBaseline,
      size: 8.6,
      font: this.fontBold,
      color: C_EVERGREEN_DARK,
    });
    this.page.drawText(sanitizeForPdfFont(overall), {
      x: xMarks,
      y: totalBaseline,
      size: 8.8,
      font: this.fontBold,
      color: C_EVERGREEN_DARK,
    });

    this.y = topY - totalH - 12;
  }

  /* ─── Section Banner ───────────────────────────────────────────────── */

  drawSectionBanner(title: string, instructions: string | null, marks: number | null): void {
    const instLines = instructions ? this.wrap(formatProseWithMath(instructions), CONTENT_W - 20, this.fontRegular, 8.2) : [];
    const h = 24 + (instLines.length ? instLines.length * 11.5 + 4 : 0);
    this.ensure(h + 44); // prevent orphaned section header at bottom of page

    const topY = this.y;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: topY - h,
      width: CONTENT_W,
      height: h,
      color: C_EVERGREEN_SOFT,
      borderColor: C_EVERGREEN,
      borderWidth: 0.7,
    });
    this.page.drawRectangle({
      x: MARGIN_X,
      y: topY - h,
      width: 4,
      height: h,
      color: C_EVERGREEN,
    });

    const headingText = this.truncate(sanitizeForPdfFont(title), CONTENT_W - 110, this.fontBold, 10);
    this.page.drawText(headingText, {
      x: MARGIN_X + 11,
      y: topY - 15.5,
      size: 10,
      font: this.fontBold,
      color: C_EVERGREEN_DARK,
    });

    if (marks !== null && marks > 0) {
      const mText = `${fmtNum(marks)} marks`;
      const mw = this.fontBold.widthOfTextAtSize(mText, 8.5);
      this.page.drawText(mText, {
        x: MARGIN_X + CONTENT_W - 10 - mw,
        y: topY - 15,
        size: 8.5,
        font: this.fontBold,
        color: C_EVERGREEN,
      });
    }

    let iy = topY - 27;
    for (const line of instLines) {
      this.page.drawText(line, {
        x: MARGIN_X + 11,
        y: iy,
        size: 8.2,
        font: this.fontRegular,
        color: C_INK,
      });
      iy -= 11.5;
    }

    this.y = topY - h - 10;
  }

  /* ─── Rich Document Rendering ──────────────────────────────────────── */

  async drawRichDoc(doc: RichDoc | null, indent = 0, baseSize = 9.3): Promise<void> {
    if (!doc || !Array.isArray(doc.content)) return;
    const nodes = doc.content;
    for (let i = 0; i < nodes.length; i += 1) {
      // A plain-text table is authored one column group per paragraph, so the
      // groups only form a table when read together. Collect the whole run of
      // consecutive paragraphs that look like table text and typeset it once.
      const run = this.pipeTableRunFrom(nodes, i);
      if (run) {
        await this.drawPipedTableRun(run, indent, baseSize);
        i = run.end;
        continue;
      }
      await this.drawRichNode(nodes[i], indent, baseSize);
    }
  }

  /** The paragraphs from `start` that together form one plain-text table. */
  private pipeTableRunFrom(nodes: RichNode[], start: number): { paragraphs: string[]; end: number } | null {
    const first = nodes[start];
    if (!first || first.type !== "paragraph") return null;
    const paragraphs: string[] = [];
    let end = start;
    for (let i = start; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node || node.type !== "paragraph") break;
      if (Array.isArray(node.content) && node.content.some((c) => c.type === "image")) break;
      const text = this.inlineTextFromNode(node).trim();
      if (!text) break;
      paragraphs.push(text);
      end = i;
      // Stop once the block no longer contains a table row; a lone caption line
      // at the very start is allowed so the header can be included.
      if (i > start && !text.split("\n").some((l) => l.trim().startsWith("|"))) break;
    }
    if (!paragraphs.length) return null;
    const joined = paragraphs.join("\n").split("\n");
    if (!parsePipedTable(joined)) return null;
    return { paragraphs, end };
  }

  private async drawPipedTableRun(run: { paragraphs: string[] }, indent: number, baseSize: number): Promise<void> {
    const x = MARGIN_X + indent;
    const maxW = CONTENT_W - indent;
    const parsed = parsePipedTable(run.paragraphs.join("\n").split("\n"));
    if (!parsed) return;
    if (parsed.caption) {
      this.drawWrapped(formatProseWithMath(parsed.caption), { x, maxWidth: maxW, size: baseSize, gapAfter: 3 });
    }
    this.drawGridTable(parsed.headers, parsed.rows, x, maxW);
    if (parsed.trailing) {
      this.drawWrapped(formatProseWithMath(parsed.trailing), { x, maxWidth: maxW, size: baseSize, gapAfter: 4 });
    }
    this.y -= 6;
  }

  private inlineTextFromNode(node: RichNode): string {
    if (!node) return "";
    if (node.type === "text") {
      return formatProseWithMath(node.text ?? "");
    }
    if (node.type === "mathInline" || node.type === "mathBlock") {
      const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
      // A formula sits *inside* running text, so it keeps its surrounding
      // spacing. Without this an adjoined formula swallowed the space next to it
      // ("with u₄" printed as "withu₄") because the text nodes on either side
      // are drawn as one run.
      const rendered = formatLatexExpr(latex);
      if (!rendered) return "";
      return rendered;
    }
    if (node.type === "hardBreak") return "\n";
    if (!Array.isArray(node.content)) return "";
    // Join inline runs with exactly one space between them.
    //
    // Every run is trimmed first: `formatProseWithMath` tidies each text node on
    // its own, which drops the space that used to separate "hours $h$ of" into
    // "hours" + "h" + "of". Joining on the trimmed pieces restores one space
    // without ever gluing a formula to the word beside it, and punctuation such
    // as the colon in "$d =$: [2]" still binds tightly to the formula.
    const pieces: string[] = [];
    for (const child of node.content) {
      const piece = this.inlineTextFromNode(child);
      if (!piece) continue;
      if (piece === "\n") pieces.push("\n");
      // A *trailing* space is meaningful: it marks where the author's `$…$`
      // ended before a word ("writes $n = …$ and"), and trimming it glued the
      // two runs into one word. Only the leading space is dropped, because the
      // joiner supplies its own.
      else pieces.push(piece.replace(/^[ \t]+/, ""));
    }
    let joined = "";
    for (const piece of pieces) {
      if (piece === "\n") {
        joined += "\n";
        continue;
      }
      if (!piece.trim()) continue;
      // A bullet that follows running text starts its own line. Prompts store a
      // list inline ("… (in kg): • Set A … • Set B …"), and printing that as one
      // paragraph hides the structure the author wrote.
      const startsBullet = /^[ \t]*\u2022/.test(piece);
      const needsBreak = startsBullet && joined.trim().length > 0 && !/\n[ \t]*$/.test(joined);
      const needsSpace =
        !needsBreak &&
        joined.length > 0 && !/\s$/.test(joined) && !/^[ \t]/.test(piece) && !/^[,.;:!?)\]]/.test(piece);
      joined += `${needsBreak ? "\n" : needsSpace ? " " : ""}${piece}`;
      if (/[ \t]$/.test(piece)) joined = joined.replace(/[ \t]+$/, " ");
    }
    return joined;
  }

  private async drawRichNode(node: RichNode, indent: number, baseSize: number): Promise<void> {
    if (!node) return;
    const x = MARGIN_X + indent;
    const maxW = CONTENT_W - indent;

    switch (node.type) {
      case "paragraph": {
        // Check if paragraph embeds block-like images inline
        const hasImage = Array.isArray(node.content) && node.content.some((c) => c.type === "image");
        if (hasImage && Array.isArray(node.content)) {
          let buf = "";
          for (const child of node.content) {
            if (child.type === "image") {
              if (buf.trim()) {
                this.drawWrapped(buf.trim(), { x, maxWidth: maxW, size: baseSize, gapAfter: 3 });
                buf = "";
              }
              await this.drawImageNode(child, x, maxW);
            } else {
              buf += this.inlineTextFromNode(child);
            }
          }
          if (buf.trim()) {
            this.drawWrapped(buf.trim(), { x, maxWidth: maxW, size: baseSize, gapAfter: 4 });
          }
          return;
        }
        const text = this.inlineTextFromNode(node).trim();
        if (!text) return;
        const isAllBold =
          Array.isArray(node.content) &&
          node.content.length > 0 &&
          node.content.every(
            (c) =>
              c.type !== "text" ||
              !(c.text ?? "").trim() ||
              (Array.isArray(c.marks) && c.marks.some((m) => m.type === "bold")),
          );
        this.drawWrapped(text, {
          x,
          maxWidth: maxW,
          font: isAllBold ? this.fontBold : this.fontRegular,
          size: baseSize,
          gapAfter: 4,
        });
        return;
      }

      case "heading": {
        const text = this.inlineTextFromNode(node).trim();
        if (!text) return;
        const level = Number(node.attrs?.level ?? 3);
        const size = level <= 2 ? baseSize + 1.8 : baseSize + 0.8;
        this.ensure(size * 2 + 12);
        this.drawWrapped(text, {
          x,
          maxWidth: maxW,
          font: this.fontBold,
          size,
          color: C_EVERGREEN_DARK,
          gapAfter: 4,
        });
        return;
      }

      case "mathBlock": {
        const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
        const formatted = formatLatexExpr(latex);
        if (!formatted) return;
        const lines = this.wrap(formatted, maxW - 24, this.fontBold, baseSize + 0.3);
        const boxH = lines.length * 13.5 + 10;
        this.ensure(boxH + 4);
        const boxY = this.y - boxH;
        this.page.drawRectangle({
          x,
          y: boxY,
          width: maxW,
          height: boxH,
          color: C_CARD_BG,
          borderColor: C_RULE,
          borderWidth: 0.5,
        });
        let ty = this.y - 14.5;
        for (const line of lines) {
          const w = this.fontBold.widthOfTextAtSize(line, baseSize + 0.3);
          this.page.drawText(line, {
            x: x + Math.max(10, (maxW - w) / 2),
            y: ty,
            size: baseSize + 0.3,
            font: this.fontBold,
            color: C_INK,
          });
          ty -= 13.5;
        }
        this.y = boxY - 6;
        return;
      }

      case "bulletList": {
        for (const item of node.content ?? []) {
          const txt = this.inlineTextFromNode(item).trim();
          if (!txt) continue;
          const lines = this.wrap(txt, maxW - 14, this.fontRegular, baseSize);
          lines.forEach((line, idx) => {
            this.ensure(13.5);
            if (idx === 0) {
              this.page.drawText("•", {
                x: x + 3,
                y: this.y - baseSize,
                size: baseSize,
                font: this.fontBold,
                color: C_EVERGREEN,
              });
            }
            this.page.drawText(line, {
              x: x + 13,
              y: this.y - baseSize,
              size: baseSize,
              font: this.fontRegular,
              color: C_INK,
            });
            this.y -= 13.2;
          });
        }
        this.y -= 3;
        return;
      }

      case "orderedList": {
        const startNum = Number(node.attrs?.start ?? 1);
        (node.content ?? []).forEach((item, i) => {
          const txt = this.inlineTextFromNode(item).trim();
          if (!txt) return;
          const prefix = `${startNum + i}.`;
          const lines = this.wrap(txt, maxW - 18, this.fontRegular, baseSize);
          lines.forEach((line, idx) => {
            this.ensure(13.5);
            if (idx === 0) {
              this.page.drawText(prefix, {
                x: x + 1,
                y: this.y - baseSize,
                size: baseSize,
                font: this.fontBold,
                color: C_EVERGREEN_DARK,
              });
            }
            this.page.drawText(line, {
              x: x + 17,
              y: this.y - baseSize,
              size: baseSize,
              font: this.fontRegular,
              color: C_INK,
            });
            this.y -= 13.2;
          });
        });
        this.y -= 3;
        return;
      }

      case "blockquote": {
        const txt = (node.content ?? []).map((c) => this.inlineTextFromNode(c)).join("\n").trim();
        if (!txt) return;
        const lines = this.wrap(txt, maxW - 16, this.fontItalic, baseSize);
        const h = lines.length * 13 + 6;
        this.ensure(h + 4);
        this.page.drawRectangle({
          x,
          y: this.y - h,
          width: 2.5,
          height: h,
          color: C_GOLD,
        });
        for (const line of lines) {
          this.page.drawText(line, {
            x: x + 10,
            y: this.y - baseSize - 2,
            size: baseSize,
            font: this.fontItalic,
            color: C_MUTED,
          });
          this.y -= 13;
        }
        this.y -= 8;
        return;
      }

      case "codeBlock": {
        const txt = this.inlineTextFromNode(node).trim();
        if (!txt) return;
        this.drawWrapped(txt, {
          x: x + 6,
          maxWidth: maxW - 12,
          font: this.fontMono,
          size: 8.5,
          lineHeight: 12,
          color: C_INK,
          gapAfter: 5,
        });
        return;
      }

      case "horizontalRule": {
        this.ensure(10);
        this.page.drawLine({
          start: { x, y: this.y - 4 },
          end: { x: x + maxW, y: this.y - 4 },
          thickness: 0.6,
          color: C_RULE,
        });
        this.y -= 10;
        return;
      }

      case "table": {
        this.drawTipTapTable(node, x, maxW);
        return;
      }

      case "image": {
        await this.drawImageNode(node, x, maxW);
        return;
      }

      case "graphBlock": {
        const spec = normaliseGraphSpec(node.attrs?.spec);
        this.drawGraphSpec(spec, x, maxW);
        return;
      }

      case "statsBlock": {
        const spec = normaliseStatsSpec(node.attrs?.spec);
        this.drawStatsSpec(spec, x, maxW);
        return;
      }

      case "assessDiagramBlock": {
        const spec = normaliseAssessDiagram(node.attrs?.spec);
        if (spec) this.drawAssessDiagramSpec(spec, x, maxW);
        return;
      }

      case "geometryBlock": {
        const spec = normaliseGeometrySpec(node.attrs?.spec);
        this.drawGeometrySpec(spec, x, maxW);
        return;
      }

      case "dataTableBlock": {
        const spec = normaliseDataTableSpec(node.attrs?.spec);
        this.drawDataTableSpec(spec, x, maxW);
        return;
      }

      default: {
        const fallback = this.inlineTextFromNode(node).trim();
        if (fallback) {
          this.drawWrapped(fallback, { x, maxWidth: maxW, size: baseSize, gapAfter: 4 });
        }
      }
    }
  }

  /* ─── Embedded Image Node ──────────────────────────────────────────── */

  private async drawImageNode(node: RichNode, x: number, maxW: number): Promise<void> {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.trim() : "";
    const caption = typeof node.attrs?.caption === "string" ? node.attrs.caption.trim() : "";
    const label = caption || alt || "Embedded examination figure";

    const img = src ? await tryEmbedImage(this.pdf, src, this.imageCache) : null;
    if (img) {
      const maxH = 210;
      const targetW = Math.min(maxW - 12, 380);
      const scale = Math.min(targetW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const capH = caption ? 14 : 0;
      this.ensure(h + capH + 14);

      const drawX = x + (maxW - w) / 2;
      const drawY = this.y - h - 4;
      this.page.drawRectangle({
        x: drawX - 3,
        y: drawY - 3,
        width: w + 6,
        height: h + 6,
        color: C_WHITE,
        borderColor: C_RULE,
        borderWidth: 0.6,
      });
      this.page.drawImage(img, { x: drawX, y: drawY, width: w, height: h });
      this.y = drawY - 6;
      if (caption) {
        const capText = this.truncate(formatProseWithMath(caption), maxW - 10, this.fontItalic, 8);
        const cw = this.fontItalic.widthOfTextAtSize(capText, 8);
        this.page.drawText(capText, {
          x: x + Math.max(0, (maxW - cw) / 2),
          y: this.y - 8,
          size: 8,
          font: this.fontItalic,
          color: C_MUTED,
        });
        this.y -= 13;
      }
      this.y -= 4;
      return;
    }

    // Graceful visible fallback (never silently drops embedded figures)
    const note = `[Figure: ${formatProseWithMath(label)} — image format unavailable in print export]`;
    const lines = this.wrap(note, maxW - 16, this.fontItalic, 8.2);
    const boxH = lines.length * 12 + 10;
    this.ensure(boxH + 4);
    this.page.drawRectangle({
      x,
      y: this.y - boxH,
      width: maxW,
      height: boxH,
      color: C_CARD_BG,
      borderColor: C_RULE,
      borderWidth: 0.6,
    });
    let ty = this.y - 13;
    for (const l of lines) {
      this.page.drawText(l, { x: x + 8, y: ty, size: 8.2, font: this.fontItalic, color: C_MUTED });
      ty -= 12;
    }
    this.y -= boxH + 6;
  }

  /* ─── Bordered Tables (Tiptap + DataTableSpec + Generic) ───────────── */

  private drawTipTapTable(node: RichNode, x: number, maxW: number): void {
    const rows: { cells: string[]; isHeader: boolean }[] = [];
    for (const rowNode of node.content ?? []) {
      if (rowNode.type !== "tableRow") continue;
      const cells: string[] = [];
      let isHeader = false;
      for (const cell of rowNode.content ?? []) {
        if (cell.type === "tableHeader") isHeader = true;
        const text = (cell.content ?? [])
          .map((c) => this.inlineTextFromNode(c).trim())
          .filter(Boolean)
          .join(" ");
        cells.push(text);
      }
      if (cells.length) rows.push({ cells, isHeader });
    }
    if (!rows.length) return;
    const headers = rows[0].isHeader ? rows[0].cells : null;
    const body = headers ? rows.slice(1).map((r) => r.cells) : rows.map((r) => r.cells);
    this.drawGridTable(headers, body, x, maxW);
  }

  drawDataTableSpec(spec: DataTableSpec, x: number, maxW: number): void {
    if (spec.title) {
      this.drawWrapped(formatProseWithMath(spec.title), {
        x,
        maxWidth: maxW,
        font: this.fontBold,
        size: 8.8,
        color: C_EVERGREEN_DARK,
        gapAfter: 2,
      });
    }
    const headers = spec.columns.map((c) => formatProseWithMath(c));
    const body = spec.rows.map((row) => row.map((cell) => formatProseWithMath(cell ?? "")));
    this.drawGridTable(headers, body, x, maxW);
  }

  drawGridTable(
    headers: string[] | null,
    bodyRows: string[][],
    x: number,
    maxW: number,
    title?: string | null,
  ): void {
    const colCount = Math.max(
      headers ? headers.length : 0,
      ...bodyRows.map((r) => r.length),
      1,
    );
    const colW = maxW / colCount;
    const cellPadX = 5;
    const cellPadY = 4;
    const fontSize = colCount >= 7 ? 7.4 : colCount >= 5 ? 8 : 8.4;
    const lineH = fontSize * 1.35;

    if (title) {
      this.drawWrapped(formatProseWithMath(title), {
        x,
        maxWidth: maxW,
        font: this.fontBold,
        size: 8.6,
        color: C_EVERGREEN_DARK,
        gapAfter: 2,
      });
    }

    // A table is a unit: keep it on one page when it fits on a page at all.
    // Splitting a four-row table across a page break separated a grid from its
    // header row and left the marks panel stranded on the next sheet.
    const tableHeight = bodyRows.reduce((sum, r) => sum + lineH + cellPadY * 2, 0) +
      (headers ? lineH + cellPadY * 2 : 0) + 4;
    const pageBody = A4_H - MARGIN_BOTTOM - MARGIN_TOP;
    if (tableHeight <= pageBody && this.y - tableHeight < MARGIN_BOTTOM + 8) {
      this.newPage(false);
    }

    const drawRow = (cells: string[], isHeader: boolean, shaded: boolean) => {
      const font = isHeader ? this.fontBold : this.fontRegular;
      const wrappedCols: string[][] = [];
      let maxLines = 1;
      for (let c = 0; c < colCount; c += 1) {
        const raw = formatProseWithMath(cells[c] ?? "");
        const lines = this.wrap(raw, Math.max(16, colW - cellPadX * 2), font, fontSize);
        const safeLines = lines.length ? lines : [""];
        wrappedCols.push(safeLines);
        if (safeLines.length > maxLines) maxLines = safeLines.length;
      }
      const rowH = maxLines * lineH + cellPadY * 2;
      if (this.y - rowH < MARGIN_BOTTOM + 8) {
        this.newPage(false);
        if (!isHeader && headers) {
          drawRow(headers, true, false);
        }
      }
      const rowTop = this.y;
      const rowBottom = rowTop - rowH;
      this.page.drawRectangle({
        x,
        y: rowBottom,
        width: maxW,
        height: rowH,
        color: isHeader ? C_EVERGREEN_SOFT : shaded ? C_CARD_BG : C_WHITE,
        borderColor: C_RULE,
        borderWidth: 0.6,
      });

      for (let c = 0; c < colCount; c += 1) {
        const cx = x + c * colW;
        if (c > 0) {
          this.page.drawLine({
            start: { x: cx, y: rowBottom },
            end: { x: cx, y: rowTop },
            thickness: 0.5,
            color: C_RULE,
          });
        }
        const lines = wrappedCols[c];
        let ty = rowTop - cellPadY - fontSize;
        for (const line of lines) {
          if (line) {
            this.page.drawText(line, {
              x: cx + cellPadX,
              y: ty,
              size: fontSize,
              font,
              color: isHeader ? C_EVERGREEN_DARK : C_INK,
            });
          }
          ty -= lineH;
        }
      }
      this.y = rowBottom;
    };

    if (headers) drawRow(headers, true, false);
    bodyRows.forEach((row, idx) => drawRow(row, false, idx % 2 === 1));
    this.y -= 7;
  }

  /* ─── Native Vector GraphSpec Renderer ─────────────────────────────── */

  drawGraphSpec(spec: GraphSpec, x: number, maxW: number): void {
    const titleText = spec.title ? formatProseWithMath(spec.title) : "";
    const sampled = spec.functions.map((fn) => sampleGraphFunction(fn, spec));
    const legendItems = sampled
      .filter((s) => s.label)
      .map((s) => ({ label: formatProseWithMath(s.label), color: parseHexColor(s.color, C_EVERGREEN) }));

    const cardW = Math.min(maxW, 430);
    const cardX = x + (maxW - cardW) / 2;
    const titleH = titleText ? 16 : 0;
    const legendH = legendItems.length ? 16 : 0;
    const plotBoxH = 185;
    const totalH = titleH + plotBoxH + legendH + 14;
    this.ensure(totalH + 6);

    const cardTop = this.y;
    const cardBottom = cardTop - totalH;
    this.page.drawRectangle({
      x: cardX,
      y: cardBottom,
      width: cardW,
      height: totalH,
      color: C_WHITE,
      borderColor: C_RULE,
      borderWidth: 0.7,
    });

    if (titleText) {
      const t = this.truncate(titleText, cardW - 18, this.fontBold, 8.8);
      this.page.drawText(t, {
        x: cardX + 9,
        y: cardTop - 13,
        size: 8.8,
        font: this.fontBold,
        color: C_EVERGREEN_DARK,
      });
    }

    const padL = 34;
    const padR = 14;
    const padT = 10 + titleH;
    const padB = 24 + legendH;
    const plotX = cardX + padL;
    const plotY = cardBottom + padB;
    const plotW = cardW - padL - padR;
    const plotH = totalH - padT - padB;

    const { xMin, xMax, yMin, yMax } = spec.domain;
    const spanX = Math.max(0.5, xMax - xMin);
    const spanY = Math.max(0.5, yMax - yMin);
    const toPdfX = (vx: number) => plotX + ((vx - xMin) / spanX) * plotW;
    const toPdfY = (vy: number) => plotY + ((vy - yMin) / spanY) * plotH;
    const clampX = (px: number) => Math.max(plotX, Math.min(plotX + plotW, px));
    const clampY = (py: number) => Math.max(plotY, Math.min(plotY + plotH, py));

    // Plot background
    this.page.drawRectangle({
      x: plotX,
      y: plotY,
      width: plotW,
      height: plotH,
      color: rgb(0.994, 0.996, 0.995),
      borderColor: C_RULE,
      borderWidth: 0.6,
    });

    const layout = graphLayout(spec);

    // Grid lines & ticks
    if (spec.domain.showGrid !== false) {
      for (const tx of layout.xTicks) {
        if (tx < xMin - 1e-6 || tx > xMax + 1e-6) continue;
        const px = toPdfX(tx);
        this.page.drawLine({
          start: { x: px, y: plotY },
          end: { x: px, y: plotY + plotH },
          thickness: 0.4,
          color: C_GRID,
        });
      }
      for (const ty of layout.yTicks) {
        if (ty < yMin - 1e-6 || ty > yMax + 1e-6) continue;
        const py = toPdfY(ty);
        this.page.drawLine({
          start: { x: plotX, y: py },
          end: { x: plotX + plotW, y: py },
          thickness: 0.4,
          color: C_GRID,
        });
      }
    }

    // Axes
    const xAxisY = yMin <= 0 && yMax >= 0 ? toPdfY(0) : plotY;
    const yAxisX = xMin <= 0 && xMax >= 0 ? toPdfX(0) : plotX;
    if (spec.domain.showAxes !== false) {
      this.page.drawLine({
        start: { x: plotX, y: xAxisY },
        end: { x: plotX + plotW, y: xAxisY },
        thickness: 1.0,
        color: C_INK,
      });
      this.page.drawLine({
        start: { x: yAxisX, y: plotY },
        end: { x: yAxisX, y: plotY + plotH },
        thickness: 1.0,
        color: C_INK,
      });
    }

    // Tick labels (thinned if dense so labels never overlap)
    const xTickStep = Math.max(1, Math.ceil(layout.xTicks.length / 9));
    layout.xTicks.forEach((tx, idx) => {
      if (idx % xTickStep !== 0 && tx !== 0) return;
      if (tx < xMin - 1e-6 || tx > xMax + 1e-6) return;
      const px = toPdfX(tx);
      const lbl = fmtNum(tx);
      const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
      this.page.drawText(lbl, {
        x: px - lw / 2,
        y: plotY - 9,
        size: 6.8,
        font: this.fontRegular,
        color: C_MUTED,
      });
    });

    const yTickStep = Math.max(1, Math.ceil(layout.yTicks.length / 7));
    layout.yTicks.forEach((ty, idx) => {
      if (idx % yTickStep !== 0 && ty !== 0) return;
      if (ty < yMin - 1e-6 || ty > yMax + 1e-6) return;
      const py = toPdfY(ty);
      const lbl = fmtNum(ty);
      const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
      this.page.drawText(lbl, {
        x: plotX - lw - 4,
        y: py - 2.3,
        size: 6.8,
        font: this.fontRegular,
        color: C_MUTED,
      });
    });

    // Axis indicators (x / y)
    this.page.drawText("x", {
      x: plotX + plotW - 6,
      y: Math.min(plotY + plotH - 9, xAxisY + 4),
      size: 7.4,
      font: this.fontBold,
      color: C_INK,
    });
    this.page.drawText("y", {
      x: Math.min(plotX + plotW - 9, yAxisX + 4),
      y: plotY + plotH - 9,
      size: 7.4,
      font: this.fontBold,
      color: C_INK,
    });

    // Plotted functions (clipped strictly inside plot box)
    for (const fn of sampled) {
      if (fn.samples.length < 2) continue;
      const color = parseHexColor(fn.color, C_EVERGREEN);
      const thickness = Math.max(1.0, Math.min(2.2, fn.width * 0.65));
      const dashArray = fn.style === "dashed" ? [4, 3] : fn.style === "dotted" ? [1.5, 2.5] : undefined;

      for (let i = 1; i < fn.samples.length; i += 1) {
        const a = fn.samples[i - 1];
        const b = fn.samples[i];
        // Skip discontinuities across poles
        if (Math.abs(b.y - a.y) > spanY * 0.85 && Math.abs(b.x - a.x) < spanX * 0.05) continue;
        // Skip segments completely outside y-bounds
        if ((a.y < yMin && b.y < yMin) || (a.y > yMax && b.y > yMax)) continue;
        const p1x = clampX(toPdfX(a.x));
        const p1y = clampY(toPdfY(a.y));
        const p2x = clampX(toPdfX(b.x));
        const p2y = clampY(toPdfY(b.y));
        this.page.drawLine({
          start: { x: p1x, y: p1y },
          end: { x: p2x, y: p2y },
          thickness,
          color,
          dashArray,
        });
      }
    }

    // Shaded rectangular regions (e.g. solution sets or highlighted intervals)
    for (const reg of spec.regions) {
      if (reg.visible === false) continue;
      const rx1 = clampX(toPdfX(Math.min(reg.x1, reg.x2)));
      const rx2 = clampX(toPdfX(Math.max(reg.x1, reg.x2)));
      const ry1 = clampY(toPdfY(Math.min(reg.y1, reg.y2)));
      const ry2 = clampY(toPdfY(Math.max(reg.y1, reg.y2)));
      if (rx2 > rx1 && ry2 > ry1) {
        this.page.drawRectangle({
          x: rx1,
          y: ry1,
          width: rx2 - rx1,
          height: ry2 - ry1,
          color: parseHexColor(reg.color, C_EVERGREEN),
          opacity: 0.16,
        });
      }
    }

    // Segments
    for (const seg of spec.segments) {
      if (seg.visible === false) continue;
      const color = parseHexColor(seg.color, C_EVERGREEN);
      const dashArray = seg.style === "dashed" ? [4, 3] : seg.style === "dotted" ? [1.5, 2.5] : undefined;
      this.page.drawLine({
        start: { x: clampX(toPdfX(seg.x1)), y: clampY(toPdfY(seg.y1)) },
        end: { x: clampX(toPdfX(seg.x2)), y: clampY(toPdfY(seg.y2)) },
        thickness: 1.4,
        color,
        dashArray,
      });
    }

    // Freehand / student strokes
    for (const stroke of spec.strokes) {
      if (stroke.visible === false || stroke.points.length < 2) continue;
      const color = parseHexColor(stroke.color, C_BLUE);
      for (let i = 1; i < stroke.points.length; i += 1) {
        const a = stroke.points[i - 1];
        const b = stroke.points[i];
        this.page.drawLine({
          start: { x: clampX(toPdfX(a.x)), y: clampY(toPdfY(a.y)) },
          end: { x: clampX(toPdfX(b.x)), y: clampY(toPdfY(b.y)) },
          thickness: 1.2,
          color,
        });
      }
    }

    // Plotted points
    for (const pt of spec.points) {
      if (pt.visible === false) continue;
      if (pt.x < xMin - 1e-6 || pt.x > xMax + 1e-6 || pt.y < yMin - 1e-6 || pt.y > yMax + 1e-6) continue;
      const px = toPdfX(pt.x);
      const py = toPdfY(pt.y);
      const color = parseHexColor(pt.color, C_CORAL);
      this.page.drawCircle({
        x: px,
        y: py,
        size: 3.0,
        color: pt.open ? C_WHITE : color,
        borderColor: color,
        borderWidth: 1.2,
      });
      const labelText = pt.label || (pt.showCoordinates ? `(${fmtNum(pt.x)}, ${fmtNum(pt.y)})` : "");
      if (labelText) {
        const lbl = formatProseWithMath(labelText);
        this.page.drawText(this.truncate(lbl, 70, this.fontBold, 7), {
          x: Math.min(plotX + plotW - 30, px + 4.5),
          y: Math.min(plotY + plotH - 9, py + 3.5),
          size: 7,
          font: this.fontBold,
          color: C_INK,
        });
      }
    }

    // Annotations
    for (const ann of spec.annotations) {
      const px = clampX(toPdfX(ann.x));
      const py = clampY(toPdfY(ann.y));
      this.page.drawText(this.truncate(formatProseWithMath(ann.text), 110, this.fontBold, 7.2), {
        x: Math.min(plotX + plotW - 40, px),
        y: Math.min(plotY + plotH - 9, py),
        size: 7.2,
        font: this.fontBold,
        color: parseHexColor(ann.color, C_INK),
      });
    }

    // Legend row
    if (legendItems.length) {
      let lx = cardX + 10;
      const ly = cardBottom + 6;
      for (const item of legendItems) {
        const lbl = this.truncate(item.label, 125, this.fontRegular, 7.2);
        const needed = 16 + this.fontRegular.widthOfTextAtSize(lbl, 7.2);
        if (lx + needed > cardX + cardW - 8) break;
        this.page.drawLine({
          start: { x: lx, y: ly + 2.5 },
          end: { x: lx + 10, y: ly + 2.5 },
          thickness: 1.8,
          color: item.color,
        });
        this.page.drawText(lbl, {
          x: lx + 13,
          y: ly,
          size: 7.2,
          font: this.fontRegular,
          color: C_INK,
        });
        lx += needed + 8;
      }
    }

    this.y = cardBottom - 8;
    // Reference GRAPH_VIEW so unused import is avoided and scales remain aligned
    void GRAPH_VIEW;
  }

  /* ─── Native Vector StatsSpec Renderer ─────────────────────────────── */

  drawStatsSpec(spec: StatsSpec, x: number, maxW: number): void {
    const cardW = Math.min(maxW, 430);
    const cardX = x + (maxW - cardW) / 2;
    const titleText = spec.title ? formatProseWithMath(spec.title) : "";
    const titleH = titleText ? 16 : 0;
    const cardH = 166 + titleH;
    this.ensure(cardH + 6);

    const cardTop = this.y;
    const cardBottom = cardTop - cardH;
    this.page.drawRectangle({
      x: cardX,
      y: cardBottom,
      width: cardW,
      height: cardH,
      color: C_WHITE,
      borderColor: C_RULE,
      borderWidth: 0.7,
    });

    if (titleText) {
      this.page.drawText(this.truncate(titleText, cardW - 18, this.fontBold, 8.8), {
        x: cardX + 9,
        y: cardTop - 13,
        size: 8.8,
        font: this.fontBold,
        color: C_EVERGREEN_DARK,
      });
    }

    const padL = 38;
    const padR = 14;
    const padT = 12 + titleH;
    const padB = 26;
    const plotX = cardX + padL;
    const plotY = cardBottom + padB;
    const plotW = cardW - padL - padR;
    const plotH = cardH - padT - padB;

    // Axis labels
    if (spec.xLabel) {
      const xl = this.truncate(formatProseWithMath(spec.xLabel), plotW, this.fontBold, 7.2);
      const xw = this.fontBold.widthOfTextAtSize(xl, 7.2);
      this.page.drawText(xl, {
        x: plotX + (plotW - xw) / 2,
        y: cardBottom + 5,
        size: 7.2,
        font: this.fontBold,
        color: C_INK,
      });
    }
    if (spec.yLabel) {
      this.page.drawText(this.truncate(formatProseWithMath(spec.yLabel), 140, this.fontBold, 7.0), {
        x: cardX + 6,
        y: plotY + plotH + 2,
        size: 7.0,
        font: this.fontBold,
        color: C_INK,
      });
    }

    const drawAxes = (xMin: number, xMax: number, yMin: number, yMax: number, drawY = true) => {
      const sx = (v: number) => plotX + ((v - xMin) / Math.max(1e-6, xMax - xMin)) * plotW;
      const sy = (v: number) => plotY + ((v - yMin) / Math.max(1e-6, yMax - yMin)) * plotH;

      const xTicks = niceTicks(xMin, xMax, 7);
      for (const tx of xTicks) {
        const px = sx(tx);
        this.page.drawLine({ start: { x: px, y: plotY }, end: { x: px, y: plotY + plotH }, thickness: 0.35, color: C_GRID });
        const lbl = fmtNum(tx);
        const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
        this.page.drawText(lbl, { x: px - lw / 2, y: plotY - 9, size: 6.8, font: this.fontRegular, color: C_MUTED });
      }
      if (drawY) {
        const yTicks = niceTicks(yMin, yMax, 5);
        for (const ty of yTicks) {
          const py = sy(ty);
          this.page.drawLine({ start: { x: plotX, y: py }, end: { x: plotX + plotW, y: py }, thickness: 0.35, color: C_GRID });
          const lbl = fmtNum(ty);
          const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
          this.page.drawText(lbl, { x: plotX - lw - 4, y: py - 2.3, size: 6.8, font: this.fontRegular, color: C_MUTED });
        }
      }
      this.page.drawLine({ start: { x: plotX, y: plotY }, end: { x: plotX + plotW, y: plotY }, thickness: 1, color: C_INK });
      if (drawY) {
        this.page.drawLine({ start: { x: plotX, y: plotY }, end: { x: plotX, y: plotY + plotH }, thickness: 1, color: C_INK });
      }
      return { sx, sy };
    };

    const groups = spec.groups ?? [];

    if (spec.chart === "bar_chart" && spec.categories.length) {
      const yMax = Math.max(1, ...spec.categories.map((c) => c.value)) * 1.15;
      const { sy } = drawAxes(0, spec.categories.length, 0, yMax, true);
      const slotW = plotW / spec.categories.length;
      const barW = Math.min(36, slotW * 0.65);
      spec.categories.forEach((cat, i) => {
        const bx = plotX + i * slotW + (slotW - barW) / 2;
        const bh = Math.max(0.5, sy(cat.value) - plotY);
        this.page.drawRectangle({
          x: bx,
          y: plotY,
          width: barW,
          height: bh,
          color: C_EVERGREEN,
          opacity: 0.78,
          borderColor: C_EVERGREEN_DARK,
          borderWidth: 0.7,
        });
        const lbl = this.truncate(formatProseWithMath(cat.label), slotW - 2, this.fontRegular, 6.8);
        const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
        this.page.drawText(lbl, {
          x: bx + (barW - lw) / 2,
          y: plotY - 9,
          size: 6.8,
          font: this.fontRegular,
          color: C_INK,
        });
      });
    } else if (spec.chart === "box_plot") {
      const five = spec.fiveNumberSummary ?? (spec.values.length ? statsSummary(spec.values) : null);
      if (five) {
        const span = Math.max(1, five.max - five.min);
        const xMin = five.min - span * 0.1;
        const xMax = five.max + span * 0.1;
        const { sx } = drawAxes(xMin, xMax, 0, 1, false);
        const midY = plotY + plotH * 0.52;
        const halfH = 18;
        this.page.drawLine({ start: { x: sx(five.min), y: midY }, end: { x: sx(five.max), y: midY }, thickness: 1.6, color: C_EVERGREEN });
        this.page.drawLine({ start: { x: sx(five.min), y: midY - 10 }, end: { x: sx(five.min), y: midY + 10 }, thickness: 1.6, color: C_EVERGREEN });
        this.page.drawLine({ start: { x: sx(five.max), y: midY - 10 }, end: { x: sx(five.max), y: midY + 10 }, thickness: 1.6, color: C_EVERGREEN });
        this.page.drawRectangle({
          x: sx(five.q1),
          y: midY - halfH,
          width: Math.max(2, sx(five.q3) - sx(five.q1)),
          height: halfH * 2,
          color: C_GOLD_SOFT,
          borderColor: C_EVERGREEN,
          borderWidth: 1.5,
        });
        this.page.drawLine({
          start: { x: sx(five.median), y: midY - halfH },
          end: { x: sx(five.median), y: midY + halfH },
          thickness: 2.2,
          color: C_EVERGREEN_DARK,
        });
        const summaryLbl = `Min: ${fmtNum(five.min)}   Q1: ${fmtNum(five.q1)}   Median: ${fmtNum(five.median)}   Q3: ${fmtNum(five.q3)}   Max: ${fmtNum(five.max)}`;
        this.page.drawText(this.truncate(summaryLbl, plotW, this.fontRegular, 7.2), {
          x: plotX + 4,
          y: plotY + plotH - 12,
          size: 7.2,
          font: this.fontRegular,
          color: C_MUTED,
        });
      }
    } else if (spec.chart === "cumulative_frequency") {
      const pts =
        spec.dataMode === "grouped" && groups.length
          ? groupedCumulativePoints(groups, true)
          : cumulativeFrequencies(spec.values);
      if (pts.length) {
        const xMin = Math.min(...pts.map((p) => p.value));
        const xMax = Math.max(...pts.map((p) => p.value));
        const yMax = Math.max(1, ...pts.map((p) => p.cumulative)) * 1.1;
        const { sx, sy } = drawAxes(xMin, xMax === xMin ? xMin + 1 : xMax, 0, yMax, true);
        for (let i = 1; i < pts.length; i += 1) {
          this.page.drawLine({
            start: { x: sx(pts[i - 1].value), y: sy(pts[i - 1].cumulative) },
            end: { x: sx(pts[i].value), y: sy(pts[i].cumulative) },
            thickness: 1.6,
            color: C_EVERGREEN,
          });
        }
        for (const p of pts) {
          this.page.drawCircle({ x: sx(p.value), y: sy(p.cumulative), size: 2.5, color: C_GOLD, borderColor: C_EVERGREEN_DARK, borderWidth: 0.9 });
        }
      }
    } else if (spec.chart === "frequency_polygon") {
      const bars =
        spec.dataMode === "grouped" && groups.length
          ? groupedSeries(groups).rows.map((r) => ({ mid: r.midpoint, h: r.frequency }))
          : histogramBins(spec.values, spec.binWidth).map((b) => ({ mid: (b.from + b.to) / 2, h: b.count }));
      if (bars.length) {
        const xMin = Math.min(...bars.map((b) => b.mid)) - 1;
        const xMax = Math.max(...bars.map((b) => b.mid)) + 1;
        const yMax = Math.max(1, ...bars.map((b) => b.h)) * 1.15;
        const { sx, sy } = drawAxes(xMin, xMax, 0, yMax, true);
        for (let i = 1; i < bars.length; i += 1) {
          this.page.drawLine({
            start: { x: sx(bars[i - 1].mid), y: sy(bars[i - 1].h) },
            end: { x: sx(bars[i].mid), y: sy(bars[i].h) },
            thickness: 1.6,
            color: C_EVERGREEN,
          });
        }
        for (const b of bars) {
          this.page.drawCircle({ x: sx(b.mid), y: sy(b.h), size: 2.6, color: C_GOLD, borderColor: C_EVERGREEN_DARK, borderWidth: 0.9 });
        }
      }
    } else if (spec.chart === "dot_plot" && spec.values.length) {
      const sorted = spec.values.slice().sort((a, b) => a - b);
      const xMin = sorted[0] - 1;
      const xMax = sorted[sorted.length - 1] + 1;
      const counts = new Map<number, number>();
      for (const v of sorted) counts.set(v, (counts.get(v) ?? 0) + 1);
      const maxStack = Math.max(1, ...counts.values());
      const { sx, sy } = drawAxes(xMin, xMax, 0, maxStack + 1, true);
      for (const [val, cnt] of counts.entries()) {
        for (let k = 1; k <= cnt; k += 1) {
          this.page.drawCircle({ x: sx(val), y: sy(k), size: 3.0, color: C_EVERGREEN });
        }
      }
    } else {
      // Histogram (grouped frequency density when unequal widths, or raw bin counts)
      const grouped = spec.dataMode === "grouped" && groups.length ? groupedSeries(groups) : null;
      const bars = grouped
        ? grouped.rows.map((r) => ({
            from: r.from,
            to: r.to,
            height: grouped.unequalWidths ? r.frequencyDensity : r.frequency,
          }))
        : histogramBins(spec.values, spec.binWidth).map((b) => ({
            from: b.from,
            to: b.to,
            height: b.count,
          }));
      if (bars.length) {
        const xMin = Math.min(...bars.map((b) => b.from));
        const xMax = Math.max(...bars.map((b) => b.to));
        const yMax = Math.max(1, ...bars.map((b) => b.height)) * 1.15;
        const { sx, sy } = drawAxes(xMin, xMax === xMin ? xMin + 1 : xMax, 0, yMax, true);
        for (const b of bars) {
          const bx = sx(b.from);
          const bw = Math.max(1.5, sx(b.to) - bx);
          const bh = Math.max(0.5, sy(b.height) - plotY);
          this.page.drawRectangle({
            x: bx,
            y: plotY,
            width: bw,
            height: bh,
            color: C_EVERGREEN,
            opacity: 0.75,
            borderColor: C_EVERGREEN_DARK,
            borderWidth: 0.7,
          });
        }
      }
    }

    this.y = cardBottom - 8;
  }

  /* ─── Native Vector AssessDiagramSpec Renderer ─────────────────────── */

  drawAssessDiagramSpec(spec: AssessDiagramSpec, x: number, maxW: number): void {
    const title = spec.title ? formatProseWithMath(spec.title) : null;

    if (spec.kind === "table" && spec.columns?.length) {
      this.drawGridTable(
        spec.columns,
        (spec.rows ?? []).map((r) => r.map((c) => String(c))),
        x,
        maxW,
        title,
      );
      return;
    }

    if (spec.kind === "stem_leaf" && spec.stemRows?.length) {
      const isBackToBack = spec.stemRows.some((r) => r.left && r.left.length > 0);
      const headers = isBackToBack
        ? [spec.leftTitle ?? "Left", "Stem", spec.rightTitle ?? "Right"]
        : ["Stem", "Leaves"];
      const body = spec.stemRows.map((r) =>
        isBackToBack
          ? [
              (r.left ?? []).slice().reverse().join("  "),
              String(r.stem),
              r.leaves.join("  "),
            ]
          : [String(r.stem), r.leaves.join("  ")],
      );
      this.drawGridTable(headers, body, x, Math.min(maxW, 340), title);
      if (spec.stemKey) {
        this.drawWrapped(`Key: ${formatProseWithMath(spec.stemKey)}`, {
          x,
          maxWidth: maxW,
          font: this.fontItalic,
          size: 8.2,
          color: C_MUTED,
          gapAfter: 5,
        });
      }
      return;
    }

    if (spec.kind === "grid_pattern" && spec.gridPatterns?.length) {
      const grids = spec.gridPatterns;
      const cell = 13;
      const maxRows = Math.max(...grids.map((g) => g.rows));
      const boxH = maxRows * cell + 36 + (title ? 16 : 0);
      this.ensure(boxH + 6);
      const topY = this.y;
      const bottomY = topY - boxH;
      this.page.drawRectangle({
        x,
        y: bottomY,
        width: maxW,
        height: boxH,
        color: C_WHITE,
        borderColor: C_RULE,
        borderWidth: 0.6,
      });
      if (title) {
        this.page.drawText(this.truncate(title, maxW - 16, this.fontBold, 8.8), {
          x: x + 8,
          y: topY - 13,
          size: 8.8,
          font: this.fontBold,
          color: C_EVERGREEN_DARK,
        });
      }
      const gap = 18;
      const totalGridsW =
        grids.reduce((sum, g) => sum + g.cols * cell, 0) + (grids.length - 1) * gap;
      let gx = x + Math.max(10, (maxW - totalGridsW) / 2);
      const baseGridY = bottomY + 20;

      for (const g of grids) {
        const gw = g.cols * cell;
        const gh = g.rows * cell;
        if (gx + gw > x + maxW - 6) break;
        for (let r = 0; r < g.rows; r += 1) {
          for (let c = 0; c < g.cols; c += 1) {
            const onEdge =
              g.style === "core_border"
                ? r === 0 || c === 0 || r === g.rows - 1 || c === g.cols - 1
                : g.style === "top_bottom_border"
                  ? r === 0 || r === g.rows - 1
                  : false;
            this.page.drawRectangle({
              x: gx + c * cell,
              y: baseGridY + (g.rows - 1 - r) * cell,
              width: cell - 1.5,
              height: cell - 1.5,
              color: onEdge ? rgb(0.910, 0.886, 0.784) : C_EVERGREEN,
              opacity: onEdge ? 1 : 0.8,
              borderColor: onEdge ? C_GOLD : C_EVERGREEN_DARK,
              borderWidth: 0.7,
            });
          }
        }
        const lbl = formatProseWithMath(g.label);
        const lw = this.fontBold.widthOfTextAtSize(lbl, 7.8);
        this.page.drawText(lbl, {
          x: gx + Math.max(0, (gw - lw) / 2),
          y: baseGridY - 12,
          size: 7.8,
          font: this.fontBold,
          color: C_INK,
        });
        void gh;
        gx += gw + gap;
      }
      this.y = bottomY - 8;
      return;
    }

    if (spec.kind === "box_plot" && (spec.boxPlots?.length || spec.fiveNumber)) {
      const series = spec.boxPlots?.length
        ? spec.boxPlots
        : spec.fiveNumber
          ? [{ label: spec.title ?? "", ...spec.fiveNumber }]
          : [];
      const cardW = Math.min(maxW, 430);
      const cardX = x + (maxW - cardW) / 2;
      const laneH = 38;
      const titleH = title ? 16 : 0;
      const cardH = Math.max(105, series.length * laneH + 46 + titleH);
      this.ensure(cardH + 6);
      const topY = this.y;
      const bottomY = topY - cardH;
      this.page.drawRectangle({
        x: cardX,
        y: bottomY,
        width: cardW,
        height: cardH,
        color: C_WHITE,
        borderColor: C_RULE,
        borderWidth: 0.7,
      });
      if (title) {
        this.page.drawText(this.truncate(title, cardW - 18, this.fontBold, 8.8), {
          x: cardX + 9,
          y: topY - 13,
          size: 8.8,
          font: this.fontBold,
          color: C_EVERGREEN_DARK,
        });
      }
      const lo = Math.min(...series.map((s) => s.min));
      const hi = Math.max(...series.map((s) => s.max));
      const pad = Math.max(1, (hi - lo) * 0.08);
      const xMin = spec.xMin ?? Math.floor(lo - pad);
      const xMax = spec.xMax ?? Math.ceil(hi + pad);
      const plotX = cardX + 26;
      const plotW = cardW - 44;
      const axisY = bottomY + 26;
      const sx = (v: number) => plotX + ((v - xMin) / Math.max(1e-6, xMax - xMin)) * plotW;

      // X axis & ticks
      this.page.drawLine({ start: { x: plotX, y: axisY }, end: { x: plotX + plotW, y: axisY }, thickness: 1, color: C_INK });
      for (const tx of niceTicks(xMin, xMax, 8)) {
        const px = sx(tx);
        this.page.drawLine({
          start: { x: px, y: axisY },
          end: { x: px, y: topY - titleH - 10 },
          thickness: 0.35,
          color: C_GRID,
        });
        const lbl = fmtNum(tx);
        const lw = this.fontRegular.widthOfTextAtSize(lbl, 7);
        this.page.drawText(lbl, { x: px - lw / 2, y: axisY - 10, size: 7, font: this.fontRegular, color: C_MUTED });
      }
      if (spec.xLabel) {
        const xl = this.truncate(formatProseWithMath(spec.xLabel), plotW, this.fontBold, 7.2);
        const xw = this.fontBold.widthOfTextAtSize(xl, 7.2);
        this.page.drawText(xl, { x: plotX + (plotW - xw) / 2, y: bottomY + 4, size: 7.2, font: this.fontBold, color: C_INK });
      }

      series.forEach((b, idx) => {
        const cy = topY - titleH - 22 - idx * laneH;
        if (b.label) {
          this.page.drawText(this.truncate(formatProseWithMath(b.label), plotW, this.fontBold, 7.8), {
            x: plotX + 2,
            y: cy + 12,
            size: 7.8,
            font: this.fontBold,
            color: C_INK,
          });
        }
        this.page.drawLine({ start: { x: sx(b.min), y: cy }, end: { x: sx(b.max), y: cy }, thickness: 1.5, color: C_EVERGREEN });
        this.page.drawLine({ start: { x: sx(b.min), y: cy - 7 }, end: { x: sx(b.min), y: cy + 7 }, thickness: 1.5, color: C_EVERGREEN });
        this.page.drawLine({ start: { x: sx(b.max), y: cy - 7 }, end: { x: sx(b.max), y: cy + 7 }, thickness: 1.5, color: C_EVERGREEN });
        this.page.drawRectangle({
          x: sx(b.q1),
          y: cy - 9,
          width: Math.max(2, sx(b.q3) - sx(b.q1)),
          height: 18,
          color: C_GOLD_SOFT,
          borderColor: C_EVERGREEN,
          borderWidth: 1.3,
        });
        this.page.drawLine({ start: { x: sx(b.median), y: cy - 9 }, end: { x: sx(b.median), y: cy + 9 }, thickness: 2, color: C_EVERGREEN_DARK });
      });

      this.y = bottomY - 8;
      return;
    }

    if ((spec.kind === "histogram" && spec.bars?.length) || ((spec.kind === "cumulative_curve" || spec.kind === "term_graph") && spec.points?.length)) {
      const cardW = Math.min(maxW, 430);
      const cardX = x + (maxW - cardW) / 2;
      const titleH = title ? 16 : 0;
      const cardH = 160 + titleH;
      this.ensure(cardH + 6);
      const topY = this.y;
      const bottomY = topY - cardH;
      this.page.drawRectangle({
        x: cardX,
        y: bottomY,
        width: cardW,
        height: cardH,
        color: C_WHITE,
        borderColor: C_RULE,
        borderWidth: 0.7,
      });
      if (title) {
        this.page.drawText(this.truncate(title, cardW - 18, this.fontBold, 8.8), {
          x: cardX + 9,
          y: topY - 13,
          size: 8.8,
          font: this.fontBold,
          color: C_EVERGREEN_DARK,
        });
      }
      const plotX = cardX + 36;
      const plotY = bottomY + 24;
      const plotW = cardW - 50;
      const plotH = cardH - 36 - titleH;

      let xMin = spec.xMin ?? 0;
      let xMax = spec.xMax ?? 10;
      const yMin = spec.yMin ?? 0;
      let yMax = spec.yMax ?? 10;
      if (spec.kind === "histogram" && spec.bars?.length) {
        xMin = spec.xMin ?? Math.min(...spec.bars.map((b) => b.from));
        xMax = spec.xMax ?? Math.max(...spec.bars.map((b) => b.to));
        yMax = spec.yMax ?? Math.max(1, ...spec.bars.map((b) => b.height)) * 1.15;
      } else if (spec.points?.length) {
        xMax = spec.xMax ?? Math.max(...spec.points.map((p) => p[0]));
        yMax = spec.yMax ?? Math.max(1, ...spec.points.map((p) => p[1])) * 1.1;
      }
      const sx = (v: number) => plotX + ((v - xMin) / Math.max(1e-6, xMax - xMin)) * plotW;
      const sy = (v: number) => plotY + ((v - yMin) / Math.max(1e-6, yMax - yMin)) * plotH;

      for (const tx of niceTicks(xMin, xMax, 7)) {
        const px = sx(tx);
        this.page.drawLine({ start: { x: px, y: plotY }, end: { x: px, y: plotY + plotH }, thickness: 0.35, color: C_GRID });
        const lbl = fmtNum(tx);
        const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
        this.page.drawText(lbl, { x: px - lw / 2, y: plotY - 9, size: 6.8, font: this.fontRegular, color: C_MUTED });
      }
      for (const ty of niceTicks(yMin, yMax, 5)) {
        const py = sy(ty);
        this.page.drawLine({ start: { x: plotX, y: py }, end: { x: plotX + plotW, y: py }, thickness: 0.35, color: C_GRID });
        const lbl = fmtNum(ty);
        const lw = this.fontRegular.widthOfTextAtSize(lbl, 6.8);
        this.page.drawText(lbl, { x: plotX - lw - 4, y: py - 2.3, size: 6.8, font: this.fontRegular, color: C_MUTED });
      }
      this.page.drawLine({ start: { x: plotX, y: plotY }, end: { x: plotX + plotW, y: plotY }, thickness: 1, color: C_INK });
      this.page.drawLine({ start: { x: plotX, y: plotY }, end: { x: plotX, y: plotY + plotH }, thickness: 1, color: C_INK });

      if (spec.kind === "histogram" && spec.bars?.length) {
        for (const b of spec.bars) {
          this.page.drawRectangle({
            x: sx(b.from),
            y: plotY,
            width: Math.max(1.5, sx(b.to) - sx(b.from)),
            height: Math.max(0.5, sy(b.height) - plotY),
            color: C_EVERGREEN,
            opacity: 0.75,
            borderColor: C_EVERGREEN_DARK,
            borderWidth: 0.7,
          });
        }
      } else if (spec.points?.length) {
        if (spec.joinPoints && spec.points.length > 1) {
          for (let i = 1; i < spec.points.length; i += 1) {
            this.page.drawLine({
              start: { x: sx(spec.points[i - 1][0]), y: sy(spec.points[i - 1][1]) },
              end: { x: sx(spec.points[i][0]), y: sy(spec.points[i][1]) },
              thickness: 1.6,
              color: C_EVERGREEN,
            });
          }
        }
        for (const p of spec.points) {
          this.page.drawCircle({ x: sx(p[0]), y: sy(p[1]), size: 2.8, color: C_GOLD, borderColor: C_EVERGREEN_DARK, borderWidth: 0.9 });
        }
      }
      this.y = bottomY - 8;
      return;
    }

    if (spec.kind === "venn2" && spec.venn) {
      const v = spec.venn;
      const boxH = 118 + (title ? 16 : 0);
      this.ensure(boxH + 6);
      const topY = this.y;
      const bottomY = topY - boxH;
      const cardW = Math.min(maxW, 340);
      const cardX = x + (maxW - cardW) / 2;
      this.page.drawRectangle({ x: cardX, y: bottomY, width: cardW, height: boxH, color: C_WHITE, borderColor: C_RULE, borderWidth: 0.7 });
      if (title) {
        this.page.drawText(this.truncate(title, cardW - 16, this.fontBold, 8.8), {
          x: cardX + 8,
          y: topY - 13,
          size: 8.8,
          font: this.fontBold,
          color: C_EVERGREEN_DARK,
        });
      }
      const cy = bottomY + 54;
      const cx1 = cardX + cardW * 0.41;
      const cx2 = cardX + cardW * 0.59;
      const r = 38;
      this.page.drawCircle({ x: cx1, y: cy, size: r, color: C_EVERGREEN_SOFT, opacity: 0.55, borderColor: C_EVERGREEN, borderWidth: 1.2 });
      this.page.drawCircle({ x: cx2, y: cy, size: r, color: C_GOLD_SOFT, opacity: 0.55, borderColor: C_GOLD, borderWidth: 1.2 });
      this.page.drawText(sanitizeForPdfFont(v.leftLabel || "A"), { x: cx1 - r + 4, y: cy + r + 4, size: 8, font: this.fontBold, color: C_EVERGREEN_DARK });
      this.page.drawText(sanitizeForPdfFont(v.rightLabel || "B"), { x: cx2 + r - 18, y: cy + r + 4, size: 8, font: this.fontBold, color: C_INK });
      if (v.leftOnly) this.page.drawText(sanitizeForPdfFont(v.leftOnly), { x: cx1 - 22, y: cy - 3, size: 8.5, font: this.fontBold, color: C_INK });
      if (v.both) this.page.drawText(sanitizeForPdfFont(v.both), { x: (cx1 + cx2) / 2 - 8, y: cy - 3, size: 8.5, font: this.fontBold, color: C_INK });
      if (v.rightOnly) this.page.drawText(sanitizeForPdfFont(v.rightOnly), { x: cx2 + 12, y: cy - 3, size: 8.5, font: this.fontBold, color: C_INK });
      if (v.outside) this.page.drawText(`Outside: ${sanitizeForPdfFont(v.outside)}`, { x: cardX + 10, y: bottomY + 8, size: 7.5, font: this.fontRegular, color: C_MUTED });
      this.y = bottomY - 8;
      return;
    }

    // Structured readable summary fallback for tape / double_number_line / shape_pattern
    const summaryParts: string[] = [];
    if (title) summaryParts.push(title);
    if (spec.kind === "tape" && spec.tapeRows?.length) {
      for (const row of spec.tapeRows) {
        summaryParts.push(
          `${row.label}: ${row.segments.map((s) => `${s.label} (${s.span})`).join(" | ")}`,
        );
      }
    } else if (spec.kind === "double_number_line" && spec.lines?.length) {
      for (const line of spec.lines) {
        summaryParts.push(
          `${line.label}${line.unit ? ` (${line.unit})` : ""}: ${line.ticks.map((t) => t.label).join(", ")}`,
        );
      }
    } else if (spec.kind === "shape_pattern" && spec.patterns?.length) {
      summaryParts.push(
        spec.patterns.map((p) => `${p.label} (${p.dots ?? p.squares})`).join("  ->  "),
      );
    }
    const text = `[Diagram (${spec.kind.replace(/_/g, " ")}): ${formatProseWithMath(summaryParts.join(" — "))}]`;
    this.drawWrapped(text, { x, maxWidth: maxW, font: this.fontItalic, size: 8.4, color: C_MUTED, gapAfter: 5 });
  }

  /* ─── Native Vector GeometrySpec Renderer ──────────────────────────── */

  drawGeometrySpec(spec: GeometrySpec, x: number, maxW: number): void {
    const cardW = Math.min(maxW, 410);
    const cardX = x + (maxW - cardW) / 2;
    const title = spec.title ? formatProseWithMath(spec.title) : "";
    const titleH = title ? 16 : 0;
    const cardH = 165 + titleH;
    this.ensure(cardH + 6);
    const topY = this.y;
    const bottomY = topY - cardH;
    this.page.drawRectangle({ x: cardX, y: bottomY, width: cardW, height: cardH, color: C_WHITE, borderColor: C_RULE, borderWidth: 0.7 });
    if (title) {
      this.page.drawText(this.truncate(title, cardW - 18, this.fontBold, 8.8), {
        x: cardX + 9,
        y: topY - 13,
        size: 8.8,
        font: this.fontBold,
        color: C_EVERGREEN_DARK,
      });
    }

    const pad = 16;
    const plotX = cardX + pad;
    const plotY = bottomY + pad;
    const plotW = cardW - pad * 2;
    const plotH = cardH - pad * 2 - titleH;
    const { xMin, xMax, yMin, yMax, showAxes } = spec.domain;
    const scale = Math.min(plotW / Math.max(1, xMax - xMin), plotH / Math.max(1, yMax - yMin));
    const offsetX = plotX + (plotW - (xMax - xMin) * scale) / 2;
    const offsetY = plotY + (plotH - (yMax - yMin) * scale) / 2;
    const sx = (vx: number) => offsetX + (vx - xMin) * scale;
    const sy = (vy: number) => offsetY + (vy - yMin) * scale;

    if (showAxes) {
      if (yMin <= 0 && yMax >= 0) {
        this.page.drawLine({ start: { x: sx(xMin), y: sy(0) }, end: { x: sx(xMax), y: sy(0) }, thickness: 0.7, color: C_RULE });
      }
      if (xMin <= 0 && xMax >= 0) {
        this.page.drawLine({ start: { x: sx(0), y: sy(yMin) }, end: { x: sx(0), y: sy(yMax) }, thickness: 0.7, color: C_RULE });
      }
    }

    const ptById = new Map(spec.points.map((p) => [p.id, p]));

    for (const poly of spec.polygons) {
      const verts = poly.points.map((id) => ptById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      if (verts.length < 2) continue;
      const strokeColor = parseHexColor(poly.color, C_EVERGREEN);
      for (let i = 0; i < verts.length; i += 1) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        this.page.drawLine({ start: { x: sx(a.x), y: sy(a.y) }, end: { x: sx(b.x), y: sy(b.y) }, thickness: 1.3, color: strokeColor });
      }
    }

    for (const circ of spec.circles) {
      const center = ptById.get(circ.center);
      const edge = ptById.get(circ.through);
      if (!center || !edge) continue;
      const radiusUnits = Math.hypot(edge.x - center.x, edge.y - center.y);
      const rPx = Math.min(Math.min(plotW, plotH) / 2, Math.max(2, radiusUnits * scale));
      this.page.drawCircle({
        x: sx(center.x),
        y: sy(center.y),
        size: rPx,
        borderColor: parseHexColor(circ.color, C_BLUE),
        borderWidth: 1.2,
      });
    }

    for (const ln of spec.lines) {
      const a = ptById.get(ln.a);
      const b = ln.b ? ptById.get(ln.b) : null;
      if (!a || !b) continue;
      this.page.drawLine({
        start: { x: sx(a.x), y: sy(a.y) },
        end: { x: sx(b.x), y: sy(b.y) },
        thickness: 1.3,
        color: parseHexColor(ln.color, C_INK),
        dashArray: ln.style === "dashed" ? [4, 3] : undefined,
      });
    }

    for (const pt of spec.points) {
      const px = sx(pt.x);
      const py = sy(pt.y);
      this.page.drawCircle({ x: px, y: py, size: 2.8, color: parseHexColor(pt.color, C_EVERGREEN_DARK) });
      if (pt.label && pt.showLabel !== false) {
        this.page.drawText(sanitizeForPdfFont(pt.label), { x: px + 4, y: py + 3, size: 7.5, font: this.fontBold, color: C_INK });
      }
    }

    for (const lbl of spec.annotations ?? []) {
      this.page.drawText(this.truncate(formatProseWithMath(lbl.text), 110, this.fontRegular, 7.5), {
        x: sx(lbl.x),
        y: sy(lbl.y),
        size: 7.5,
        font: this.fontRegular,
        color: parseHexColor(lbl.color, C_INK),
      });
    }

    this.y = bottomY - 8;
  }

  /* ─── Candidate Structured Workspaces (Stem-Leaf, Venn, Prob Tree) ── */

  drawStemLeafWork(spec: StemLeafSpec, x: number, maxW: number): void {
    const isBack = spec.layout === "back_to_back";
    const headers = isBack
      ? [spec.leftLeafLabel || "Left", spec.stemLabel || "Stem", spec.rightLeafLabel || "Right"]
      : [spec.stemLabel || "Stem", spec.leafLabel || "Leaves"];
    const body = spec.rows.map((r) =>
      isBack
        ? [r.leftLeaves ?? "", r.stem, r.rightLeaves ?? r.leaves]
        : [r.stem, r.leaves],
    );
    this.drawGridTable(headers, body, x, Math.min(maxW, 330), spec.title || "Candidate Stem-and-Leaf Diagram");
    if (spec.key) {
      this.drawWrapped(`Key: ${formatProseWithMath(spec.key)}`, {
        x,
        maxWidth: maxW,
        font: this.fontItalic,
        size: 8.2,
        color: C_MUTED,
        gapAfter: 4,
      });
    }
  }

  drawVennWork(spec: VennSpec, x: number, maxW: number): void {
    const labelMap: Record<string, string> = {
      A: `${spec.labels[0] || "A"} only`,
      B: `${spec.labels[1] || "B"} only`,
      C: `${spec.labels[2] || "C"} only`,
      AnB: `${spec.labels[0] || "A"} n ${spec.labels[1] || "B"}`,
      AnC: `${spec.labels[0] || "A"} n ${spec.labels[2] || "C"}`,
      BnC: `${spec.labels[1] || "B"} n ${spec.labels[2] || "C"}`,
      AnBnC: `${spec.labels[0] || "A"} n ${spec.labels[1] || "B"} n ${spec.labels[2] || "C"}`,
      neither: `Outside (${spec.universalLabel || "U"})`,
    };
    const rows: string[][] = [];
    for (const [key, val] of Object.entries(spec.regions)) {
      const placedItems = (spec.items ?? []).filter((it) => it.region === key).map((it) => it.label);
      const combined = [val?.trim(), placedItems.length ? placedItems.join(", ") : ""].filter(Boolean).join(" ; ");
      rows.push([labelMap[key] ?? key, combined || "—"]);
    }
    this.drawGridTable(
      ["Venn Diagram Region", "Candidate Entry"],
      rows,
      x,
      Math.min(maxW, 360),
      spec.title || "Candidate Venn Diagram",
    );
  }

  drawProbabilityTreeWork(spec: ProbabilityTreeSpec, x: number, maxW: number): void {
    const childrenByParent = new Map<string, ProbabilityTreeSpec["nodes"]>();
    for (const node of spec.nodes) {
      if (node.parentId === null) continue;
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    }
    const root = spec.nodes.find((n) => n.parentId === null);
    const rows: string[][] = [];
    const walk = (nodeId: string, path: string[]) => {
      const kids = childrenByParent.get(nodeId) ?? [];
      if (!kids.length) return;
      for (const kid of kids) {
        const step = `${kid.label || "Event"}${kid.probability ? ` (${kid.probability})` : ""}`;
        const nextPath = [...path, step];
        const grandKids = childrenByParent.get(kid.id) ?? [];
        if (!grandKids.length) {
          rows.push([nextPath.join("  ->  "), kid.outcome || "—"]);
        } else {
          walk(kid.id, nextPath);
        }
      }
    };
    if (root) walk(root.id, []);
    if (!rows.length) {
      for (const node of spec.nodes) {
        if (node.parentId === null) continue;
        rows.push([`${node.label || "Branch"} (${node.probability || "—"})`, node.outcome || "—"]);
      }
    }
    this.drawGridTable(
      ["Branch Path (Probabilities)", "Outcome"],
      rows,
      x,
      maxW,
      spec.title || "Candidate Probability Tree",
    );
  }

  /* ─── Question & Candidate Answer Rendering ────────────────────────── */

  async drawQuestion(q: CandidatePaperQuestion): Promise<void> {
    // Keep question header + opening prompt lines together
    this.ensure(76);

    // Question Header Bar
    const barH = 20;
    const barTop = this.y;
    const barBottom = barTop - barH;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: barBottom,
      width: CONTENT_W,
      height: barH,
      color: C_CARD_BG,
      borderColor: C_RULE,
      borderWidth: 0.6,
    });

    // The printed paper numbers its questions, so lead with that number: a
    // candidate looks for "Question 19", not for its position on the sheet.
    // Older revisions that printed no number fall back to the sheet position.
    const qHeading =
      q.printedLabel && q.printedLabel !== String(q.number)
        ? `Question ${q.printedLabel}  (sheet item ${q.number})`
        : `Question ${q.number}`;

    // Marking verdict for this question. CORRECT is green, WRONG is red, and a
    // part-mark answer is labelled PARTIAL CREDIT so a reader can see at a
    // glance how the mark was built. Shown when the result is released, and on
    // a staff preview of a validated result.
    const marksVisible = this.header.resultsPublished || this.header.markingPreview;
    const verdict = marksVisible ? questionVerdict(q.awardedMarks, q.marks) : null;
    const verdictColor = verdict ? verdict.color : C_MUTED;

    this.page.drawText(sanitizeForPdfFont(qHeading), {
      x: MARGIN_X + 8,
      y: barBottom + 6.2,
      size: 9.5,
      font: this.fontBold,
      color: C_EVERGREEN_DARK,
    });

    // A coloured spine marks the whole question block green / red / amber.
    if (verdict) {
      this.page.drawRectangle({
        x: MARGIN_X,
        y: barBottom,
        width: 3.2,
        height: barH,
        color: verdictColor,
      });
    }

    // Right-aligned marks / criterion / published awarded mark
    const rightBits: string[] = [];
    if (q.criterionLabel) rightBits.push(q.criterionLabel);
    rightBits.push(`${fmtNum(q.marks)} ${q.marks === 1 ? "mark" : "marks"}`);
    if (marksVisible && q.awardedMarks !== null) {
      rightBits.push(`Awarded: ${fmtNum(q.awardedMarks)} / ${fmtNum(q.marks)}`);
    }
    if (verdict) rightBits.push(verdict.label);
    const rightStr = sanitizeForPdfFont(rightBits.join("   ·   "));
    const rw = this.fontBold.widthOfTextAtSize(rightStr, 8.2);
    this.page.drawText(rightStr, {
      x: MARGIN_X + CONTENT_W - 8 - rw,
      y: barBottom + 6.5,
      size: 8.2,
      font: this.fontBold,
      color: verdictColor,
    });

    this.y = barBottom - 8;

    // Question Prompt (full rich content: prose, math, tables, graphs, stats, diagrams, images)
    if (q.promptDoc) {
      await this.drawRichDoc(q.promptDoc, 4, 9.3);
    } else if (q.prompt) {
      this.drawWrapped(formatProseWithMath(q.prompt), {
        x: MARGIN_X + 4,
        maxWidth: CONTENT_W - 4,
        size: 9.3,
        gapAfter: 4,
      });
    }

    // Reconstructed Options (MCQ / Multi-Select / True-False / Ordering)
    // Shows candidate's exact presented order & marks ONLY candidate's own choice (NEVER answer keys!)
    if (q.options.length > 0 && q.type !== "ordering") {
      this.y -= 2;
      for (const opt of q.options) {
        const optText = opt.contentDoc
          ? formatProseWithMath(this.extractRichDocInline(opt.contentDoc) || opt.label)
          : formatProseWithMath(opt.label);
        const marker = opt.selectedByCandidate ? "[X]" : "[ ]";
        const prefix = `${marker}  ${opt.letter}. `;
        const lines = this.wrap(optText, CONTENT_W - 56, opt.selectedByCandidate ? this.fontBold : this.fontRegular, 9.0);
        const safeLines = lines.length ? lines : [""];
        const blockH = safeLines.length * 12.8 + 4;
        this.ensure(blockH + 2);
        if (opt.selectedByCandidate) {
          this.page.drawRectangle({
            x: MARGIN_X + 6,
            y: this.y - blockH + 2,
            width: CONTENT_W - 12,
            height: blockH,
            color: C_EVERGREEN_SOFT,
            borderColor: C_EVERGREEN,
            borderWidth: 0.5,
          });
        }
        this.page.drawText(prefix, {
          x: MARGIN_X + 12,
          y: this.y - 10.5,
          size: 8.8,
          font: this.fontBold,
          color: opt.selectedByCandidate ? C_EVERGREEN_DARK : C_MUTED,
        });
        safeLines.forEach((line, idx) => {
          this.page.drawText(line, {
            x: MARGIN_X + 48,
            y: this.y - 10.5 - idx * 12.8,
            size: 9.0,
            font: opt.selectedByCandidate ? this.fontBold : this.fontRegular,
            color: opt.selectedByCandidate ? C_EVERGREEN_DARK : C_INK,
          });
        });
        this.y -= blockH + 2;
      }
      this.y -= 3;
    } else if (q.options.length > 0 && q.type === "ordering") {
      this.drawWrapped("Items presented to candidate:", {
        x: MARGIN_X + 6,
        maxWidth: CONTENT_W - 12,
        font: this.fontBold,
        size: 8.2,
        color: C_MUTED,
        gapAfter: 2,
      });
      for (const opt of q.options) {
        this.drawWrapped(`•  ${formatProseWithMath(opt.label)}`, {
          x: MARGIN_X + 12,
          maxWidth: CONTENT_W - 18,
          size: 8.8,
          lineHeight: 12.5,
        });
      }
      this.y -= 3;
    }

    // Matching question presented items (no answer pairs!)
    if (q.matchingChoices) {
      if (q.matchingChoices.rightItems.length > 0) {
        this.drawWrapped(
          `Available choices: ${q.matchingChoices.rightItems.map((r) => formatProseWithMath(r)).join("   |   ")}`,
          {
            x: MARGIN_X + 6,
            maxWidth: CONTENT_W - 12,
            font: this.fontItalic,
            size: 8.3,
            color: C_MUTED,
            gapAfter: 4,
          },
        );
      }
      if (!q.answer.answered && q.matchingChoices.leftItems.length > 0) {
        const items = q.matchingChoices.rows?.length
          ? q.matchingChoices.rows.map((r) => `${r.label}. ${formatProseWithMath(r.left)}`)
          : q.matchingChoices.leftItems.map((l, i) => `${i + 1}. ${formatProseWithMath(l)}`);
        for (const item of items) {
          this.drawWrapped(item, {
            x: MARGIN_X + 10,
            maxWidth: CONTENT_W - 16,
            size: 8.8,
            lineHeight: 12.6,
          });
        }
        this.y -= 3;
      }
    }

    // Candidate's Submitted Answer Panel
    await this.drawCandidateAnswerSection(q);

    // Published Teacher Feedback (ONLY when officially published & non-internal)
    if (this.header.resultsPublished && q.teacherFeedback) {
      const fbLines = this.wrap(formatProseWithMath(q.teacherFeedback), CONTENT_W - 24, this.fontRegular, 8.6);
      const fbH = fbLines.length * 12.2 + 20;
      this.ensure(fbH + 4);
      const topY = this.y;
      this.page.drawRectangle({
        x: MARGIN_X + 4,
        y: topY - fbH,
        width: CONTENT_W - 8,
        height: fbH,
        color: C_GOLD_SOFT,
        borderColor: C_GOLD,
        borderWidth: 0.6,
      });
      this.page.drawText("TEACHER FEEDBACK", {
        x: MARGIN_X + 12,
        y: topY - 12,
        size: 7.5,
        font: this.fontBold,
        color: C_EVERGREEN_DARK,
      });
      let ty = topY - 24;
      for (const line of fbLines) {
        this.page.drawText(line, { x: MARGIN_X + 12, y: ty, size: 8.6, font: this.fontRegular, color: C_INK });
        ty -= 12.2;
      }
      this.y = topY - fbH - 6;
    }

    // Subtle divider before next question
    this.y -= 6;
    this.ensure(6);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: MARGIN_X + CONTENT_W, y: this.y },
      thickness: 0.45,
      color: C_RULE,
    });
    this.y -= 10;
  }

  private extractRichDocInline(doc: RichDoc): string {
    return (doc.content ?? []).map((n) => this.inlineTextFromNode(n)).join(" ").trim();
  }

  private async drawCandidateAnswerSection(q: CandidatePaperQuestion): Promise<void> {
    const ans = q.answer;
    const panelX = MARGIN_X + 4;
    const panelW = CONTENT_W - 8;

    this.ensure(38);
    // Label header strip for candidate's answer
    const headerH = 15;
    this.page.drawRectangle({
      x: panelX,
      y: this.y - headerH,
      width: panelW,
      height: headerH,
      color: ans.answered ? C_EVERGREEN_SOFT : C_CREAM,
      borderColor: ans.answered ? C_EVERGREEN : C_RULE,
      borderWidth: 0.5,
    });
    this.page.drawRectangle({
      x: panelX,
      y: this.y - headerH,
      width: 3,
      height: headerH,
      color: ans.answered ? C_EVERGREEN : C_SUBTLE,
    });
    this.page.drawText(
      ans.parts.length > 0 ? "CANDIDATE'S SUBMITTED RESPONSES" : "CANDIDATE'S SUBMITTED ANSWER",
      {
        x: panelX + 9,
        y: this.y - 10.5,
        size: 7.4,
        font: this.fontBold,
        color: ans.answered ? C_EVERGREEN_DARK : C_MUTED,
      },
    );
    this.y -= headerH + 6;

    const innerX = panelX + 8;
    const innerW = panelW - 14;

    // Multi-part questions (`assess_parts`): always display each public sub-part
    // prompt + the candidate's response (or "No answer submitted.")
    if (ans.parts.length > 0) {
      // Per-part marking, aligned with the public part list. Part evidence is
      // matched by label because that is stable across paper revisions.
      const partPlans = q.markPlan?.parts ?? [];
      const planByLabel = new Map(partPlans.map((p) => [p.label, p]));

      for (const part of ans.parts) {
        const plan = planByLabel.get(part.label) ?? null;
        const partVerdict = plan ? verdictForStatus(plan.status) : null;

        const partHeadingBits: string[] = [];
        const marker = partMarker(part.label, part.prompt);
        if (marker) partHeadingBits.push(marker);
        if (part.prompt) partHeadingBits.push(formatProseWithMath(part.prompt));
        if (!partHeadingBits.length) partHeadingBits.push(part.label);
        if (part.points > 0) partHeadingBits.push(`[${fmtNum(part.points)} ${part.points === 1 ? "mark" : "marks"}]`);
        if (plan && partVerdict) {
          partHeadingBits.push(`${plan.earned ?? 0}/${plan.max}  ${partVerdict.label}`);
        } else if (plan && plan.earned === null) {
          // The question's stored mark is authoritative, but the school did not
          // record which part earned it. Say so instead of inventing a split.
          partHeadingBits.push(`of ${fmtNum(plan.max)}  ALLOCATED FROM QUESTION TOTAL`);
        }
        this.drawWrapped(partHeadingBits.join("  "), {
          x: innerX,
          maxWidth: innerW,
          font: this.fontBold,
          size: 8.6,
          lineHeight: 12.2,
          color: partVerdict ? partVerdict.color : C_INK,
          gapAfter: 2,
        });
        if (part.candidateResponse) {
          const formattedResp = formatProseWithMath(part.candidateResponse);
          const withUnit = part.unit ? `${formattedResp} ${formatProseWithMath(part.unit)}` : formattedResp;
          const responseTone = partVerdict
            ? partVerdict.color
            : C_EVERGREEN_DARK;
          this.drawWrapped(`Response: ${withUnit}`, {
            x: innerX + 10,
            maxWidth: innerW - 10,
            font: partVerdict && plan?.status === "correct" ? this.fontBold : this.fontRegular,
            size: 9.0,
            lineHeight: 12.8,
            color: responseTone,
            gapAfter: plan?.expected && plan.status !== "correct" ? 2 : part.working ? 3 : 5,
          });
          // A wrong or part-marked answer prints the expected answer, so the
          // candidate can see what the mark was given for.
          if (plan?.expected && plan.status !== "correct") {
            this.drawWrapped(`Expected answer: ${formatProseWithMath(plan.expected)}`, {
              x: innerX + 10,
              maxWidth: innerW - 10,
              font: this.fontBold,
              size: 8.6,
              lineHeight: 12.2,
              color: C_EVERGREEN,
              gapAfter: part.working ? 3 : 5,
            });
          }
        } else {
          this.drawWrapped(part.working ? "No typed answer (working shown below)." : "No answer submitted.", {
            x: innerX + 10,
            maxWidth: innerW - 10,
            font: this.fontItalic,
            size: 8.6,
            lineHeight: 12.2,
            color: C_SUBTLE,
            gapAfter: part.working ? 3 : 5,
          });
        }

        if (part.working) {
          this.drawWrapped(`Working shown for ${part.label}:`, {
            x: innerX + 10,
            maxWidth: innerW - 10,
            font: this.fontBold,
            size: 8.1,
            lineHeight: 11.5,
            color: C_MUTED,
            gapAfter: 2,
          });
          if (part.working.richDoc) {
            await this.drawRichDoc(part.working.richDoc, innerX + 14 - MARGIN_X, 8.8);
          } else if (part.working.text) {
            this.drawWrapped(formatProseWithMath(part.working.text), {
              x: innerX + 14,
              maxWidth: innerW - 14,
              font: this.fontRegular,
              size: 8.8,
              lineHeight: 12.5,
              color: C_INK,
              gapAfter: 4,
            });
          }
          await this.drawCandidateStructuredWork(part.working.structuredWork, innerX + 12, innerW - 12);
          this.y -= 2;
        }
      }

      // The parts are marked from the answer key. If the school recorded a
      // higher question mark than the key accounts for, say where the rest of
      // the credit sits rather than silently dropping it.
      const questionPlan = q.markPlan;
      const marksVisibleForParts = this.header.resultsPublished || this.header.markingPreview;
      if (marksVisibleForParts && questionPlan && questionPlan.earned !== null && partPlans.length) {
        const accounted = partPlans.reduce((sum, part) => sum + (part.earned ?? 0), 0);
        const residual = Math.round((questionPlan.earned - accounted) * 100) / 100;
        if (residual > 0.005) {
          this.drawWrapped(
            `${fmtNum(residual)} of the ${fmtNum(questionPlan.max)} marks on this question were awarded for the answer as a whole and are included in the question mark above.`,
            {
              x: innerX,
              maxWidth: innerW,
              font: this.fontItalic,
              size: 8.0,
              lineHeight: 11.2,
              color: C_MUTED,
              gapAfter: 4,
            },
          );
        }
      }

      if (ans.workingText) {
        this.drawWrapped("Working / Explanation:", {
          x: innerX,
          maxWidth: innerW,
          font: this.fontBold,
          size: 8.3,
          color: C_MUTED,
          gapAfter: 2,
        });
        this.drawWrapped(formatProseWithMath(ans.workingText), {
          x: innerX + 8,
          maxWidth: innerW - 8,
          font: this.fontRegular,
          size: 8.8,
          lineHeight: 12.6,
          color: C_INK,
          gapAfter: 5,
        });
      }

      await this.drawCandidateStructuredWork(ans.structuredWork, innerX, innerW);
      return;
    }

    // Unanswered non-part question
    if (!ans.answered) {
      this.drawWrapped("No answer submitted.", {
        x: innerX,
        maxWidth: innerW,
        font: this.fontItalic,
        size: 9.0,
        color: C_SUBTLE,
        gapAfter: 4,
      });
      return;
    }

    // Selected option(s) — green when the choice is right, red when it is not.
    if (ans.selectedOptions.length > 0) {
      const plan = q.markPlan;
      for (const sel of ans.selectedOptions) {
        const isRight = plan ? plan.correctLetters.includes(sel.letter) : null;
        const tone = isRight === null ? C_EVERGREEN_DARK : isRight ? C_EVERGREEN : C_CORAL;
        this.drawWrapped(`Selected: ${sel.letter}. ${formatProseWithMath(sel.label)}`, {
          x: innerX,
          maxWidth: innerW,
          font: this.fontBold,
          size: 9.1,
          color: tone,
          gapAfter: 3,
        });
      }
      // Name the correct choice whenever the candidate's answer is not full marks.
      if (plan?.expectedAnswer && q.awardedMarks !== null && q.awardedMarks < q.marks - 1e-9) {
        this.drawWrapped(`Expected answer: ${formatProseWithMath(plan.expectedAnswer)}`, {
          x: innerX,
          maxWidth: innerW,
          font: this.fontBold,
          size: 9.0,
          color: C_EVERGREEN,
          gapAfter: 4,
        });
      }
    }

    // Rich doc answer (when candidate used rich text/math editor)
    if (ans.richDocResponse) {
      await this.drawRichDoc(ans.richDocResponse, innerX - MARGIN_X, 9.0);
    } else if (ans.textResponse) {
      this.drawWrapped(formatProseWithMath(ans.textResponse), {
        x: innerX,
        maxWidth: innerW,
        font: this.fontRegular,
        size: 9.1,
        lineHeight: 13.0,
        color: C_INK,
        gapAfter: 4,
      });
    }

    // Matching pairs — each pair is marked on its own so a partly correct
    // matching exercise shows exactly which pairs were wrong.
    if (ans.matchingPairs.length > 0) {
      const planRows = q.markPlan?.matchingRows ?? [];
      const planByLeft = new Map(planRows.map((r) => [r.left.trim().toLowerCase(), r]));
      for (const pair of ans.matchingPairs) {
        const plan = planByLeft.get(pair.left.trim().toLowerCase()) ?? null;
        const pairVerdict = plan ? verdictForStatus(plan.status) : null;
        const given = pair.candidateRight ? formatProseWithMath(pair.candidateRight) : "No answer submitted.";
        this.drawWrapped(
          `${formatProseWithMath(pair.left)}  ->  ${given}${pairVerdict ? `   ${pairVerdict.label}` : ""}`,
          {
            x: innerX,
            maxWidth: innerW,
            size: 8.8,
            lineHeight: 12.4,
            color: pairVerdict ? pairVerdict.color : C_INK,
            gapAfter: plan && plan.status !== "correct" ? 1 : 3,
          },
        );
        if (plan && plan.status !== "correct") {
          this.drawWrapped(`Expected answer: ${formatProseWithMath(plan.expectedRight)}`, {
            x: innerX + 10,
            maxWidth: innerW - 10,
            font: this.fontBold,
            size: 8.5,
            color: C_EVERGREEN,
            gapAfter: 4,
          });
        }
      }
    }

    // Ordering sequence
    if (ans.orderedItems.length > 0) {
      ans.orderedItems.forEach((item, idx) => {
        this.drawWrapped(`${idx + 1}.  ${formatProseWithMath(item)}`, {
          x: innerX,
          maxWidth: innerW,
          size: 9.0,
          lineHeight: 12.8,
          color: C_INK,
        });
      });
      this.y -= 3;
    }

    // Working / explanation
    if (ans.workingText) {
      this.drawWrapped("Working / Explanation:", {
        x: innerX,
        maxWidth: innerW,
        font: this.fontBold,
        size: 8.3,
        color: C_MUTED,
        gapAfter: 2,
      });
      this.drawWrapped(formatProseWithMath(ans.workingText), {
        x: innerX + 8,
        maxWidth: innerW - 8,
        font: this.fontRegular,
        size: 8.8,
        lineHeight: 12.6,
        color: C_INK,
        gapAfter: 4,
      });
    }

    // Candidate-constructed structured workspaces (graphs, geometry, stats, tables, etc.)
    await this.drawCandidateStructuredWork(ans.structuredWork, innerX, innerW);

    // Fallback notes for any unrecognized response fields
    for (const note of ans.fallbackNotes) {
      this.drawWrapped(formatProseWithMath(note), {
        x: innerX,
        maxWidth: innerW,
        font: this.fontItalic,
        size: 8.5,
        color: C_MUTED,
        gapAfter: 3,
      });
    }
  }

  private async drawCandidateStructuredWork(
    work: CandidatePaperQuestion["answer"]["structuredWork"],
    x: number,
    maxW: number,
  ): Promise<void> {
    if (work.graph) {
      this.drawWrapped("Candidate's Graph Construction:", {
        x,
        maxWidth: maxW,
        font: this.fontBold,
        size: 8.2,
        color: C_EVERGREEN_DARK,
        gapAfter: 3,
      });
      this.drawGraphSpec(work.graph, x, maxW);
    }
    if (work.geometry) {
      this.drawWrapped("Candidate's Geometry Construction:", {
        x,
        maxWidth: maxW,
        font: this.fontBold,
        size: 8.2,
        color: C_EVERGREEN_DARK,
        gapAfter: 3,
      });
      this.drawGeometrySpec(work.geometry, x, maxW);
    }
    if (work.statistics) {
      this.drawWrapped("Candidate's Statistical Chart:", {
        x,
        maxWidth: maxW,
        font: this.fontBold,
        size: 8.2,
        color: C_EVERGREEN_DARK,
        gapAfter: 3,
      });
      this.drawStatsSpec(work.statistics, x, maxW);
    }
    if (work.dataTable) {
      this.drawDataTableSpec(work.dataTable, x, maxW);
    }
    if (work.stemLeaf) {
      this.drawStemLeafWork(work.stemLeaf, x, maxW);
    }
    if (work.venn) {
      this.drawVennWork(work.venn, x, maxW);
    }
    if (work.probabilityTree) {
      this.drawProbabilityTreeWork(work.probabilityTree, x, maxW);
    }
    void C_PURPLE;
  }

  /* ─── Page Footers (Page X of Y) ───────────────────────────────────── */

  stampFooters(): void {
    const total = this.pages.length;
    const leftLabel = this.truncate(
      `${sanitizeForPdfFont(this.header.examTitle)}  ·  Candidate Submission Evidence`,
      385,
      this.fontRegular,
      7.4,
    );
    for (let i = 0; i < total; i += 1) {
      const page = this.pages[i];
      page.drawLine({
        start: { x: MARGIN_X, y: MARGIN_BOTTOM - 10 },
        end: { x: A4_W - MARGIN_X, y: MARGIN_BOTTOM - 10 },
        thickness: 0.5,
        color: C_RULE,
      });
      page.drawText(leftLabel, {
        x: MARGIN_X,
        y: MARGIN_BOTTOM - 22,
        size: 7.4,
        font: this.fontRegular,
        color: C_SUBTLE,
      });
      const pageText = `Page ${i + 1} of ${total}`;
      const pw = this.fontBold.widthOfTextAtSize(pageText, 7.6);
      page.drawText(pageText, {
        x: A4_W - MARGIN_X - pw,
        y: MARGIN_BOTTOM - 22,
        size: 7.6,
        font: this.fontBold,
        color: C_MUTED,
      });
    }
  }
}

/**
 * Render an individual candidate's submitted examination paper into a real A4
 * vector PDF buffer ready for download or ManageBac upload.
 */
export async function renderCandidateExamPaperPdf(data: CandidatePaperData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanitizeForPdfFont(`${data.header.examTitle} — ${data.header.candidateFullName}`));
  pdf.setAuthor(sanitizeForPdfFont(`${data.header.schoolName} via EVALORA`));
  pdf.setSubject(
    sanitizeForPdfFont(
      [data.header.subject, data.header.examVersion, "Candidate Examination Evidence"]
        .filter(Boolean)
        .join(" — "),
    ),
  );
  pdf.setCreator("EVALORA Assessment Platform");
  pdf.setProducer("EVALORA PDF Engine");

  // Real embedded faces, so mathematical notation prints as notation instead of
  // being transliterated to ASCII for a WinAnsi-only font.
  const { regular, bold, italic, mono } = await embedPaperFonts(pdf);

  const layout = new PaperLayout(pdf, { regular, bold, italic, mono }, data.header);
  await layout.drawFirstPageHeader();
  layout.drawCriterionResults();

  if (data.questions.length === 0) {
    layout.drawWrapped("No questions were recorded on this examination paper.", {
      font: layout.fontItalic,
      size: 9.5,
      color: C_MUTED,
      gapAfter: 10,
    });
  } else {
    for (const section of data.sections) {
      if (section.title) {
        layout.drawSectionBanner(section.title, section.instructions, section.marks);
      }
      for (const question of section.questions) {
        await layout.drawQuestion(question);
      }
    }
  }

  layout.stampFooters();
  return pdf.save();
}
