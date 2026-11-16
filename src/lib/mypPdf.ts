import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MypAnalytics, MypResult } from "./myp";

/**
 * Professional, printable MYP reports (individual and collective).
 *
 * Both renderers read a `MypResult` produced by the single grading engine, so a
 * PDF always matches the on-screen result byte for byte in its numbers. The
 * layout is deliberately conservative: A4 portrait, a repeating brand header,
 * tables that wrap instead of truncating, and a footer that carries the student
 * or scope plus "page n of m" — a multi-page report can never lose a name, a
 * mark, a criterion or a feedback line.
 */

const MARGIN = 42;
/** A4 in points. Individual reports are portrait; wide collective tables are landscape. */
const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

const COLOURS = {
  primary: hexToRgb("#0a5c36"),
  deep: hexToRgb("#06351f"),
  accent: hexToRgb("#c9a227"),
  cream: hexToRgb("#faf7f0"),
  ink: hexToRgb("#16241c"),
  soft: hexToRgb("#55665c"),
  line: hexToRgb("#d5ded8"),
  band: hexToRgb("#f3f7f4"),
  white: rgb(1, 1, 1),
  danger: hexToRgb("#a4262c"),
};

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

/**
 * Standard PDF fonts use WinAnsi: a few typographic characters from the
 * database (smart quotes, en dashes, maths symbols) would otherwise throw
 * mid-report. They are mapped to readable equivalents, never dropped silently.
 */
const REPLACEMENTS: Record<string, string> = {
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u2026": "...",
  "\u2022": "-",
  "\u2192": "->",
  "\u2190": "<-",
  "\u2265": ">=",
  "\u2264": "<=",
  "\u2260": "!=",
  "\u221A": "sqrt",
  "\u03C0": "pi",
  "\u03A3": "Sigma",
  "\u2212": "-",
  "\u00A0": " ",
  "\u2009": " ",
  "\u200B": "",
  "\u00B7": "-",
  "\u20AC": "EUR",
  "\u2191": "^",
  "\u2193": "v",
};

function winAnsi(input: string): string {
  let out = "";
  for (const char of input ?? "") {
    const code = char.codePointAt(0) ?? 32;
    if (code === 10 || code === 9) {
      out += " ";
      continue;
    }
    if (code >= 0x20 && code <= 0x7e) {
      out += char;
      continue;
    }
    if (REPLACEMENTS[char] !== undefined) {
      out += REPLACEMENTS[char];
      continue;
    }
    // Latin-1 supplement (accented French names and marks) is WinAnsi-safe.
    if (code >= 0xa1 && code <= 0xff) {
      out += char;
      continue;
    }
    // Everything else is transliterated rather than replaced by "?": a name
    // such as "Ọlá" must still read correctly on a printed report.
    const stripped = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (stripped && /^[\x20-\x7e]+$/.test(stripped)) {
      out += stripped;
      continue;
    }
    out += "?";
  }
  return out.replace(/\s+/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const source = winAnsi(text);
  if (!source) return [""];
  // A point of slack: PDF text engines differ from the font's nominal advance by
  // a fraction of a point per run, and a line measured exactly to the margin can
  // render a hair past it. Keeping a point in hand guarantees the margin holds.
  const limit = Math.max(8, maxWidth - 4);
  const lines: string[] = [];
  for (const paragraph of source.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= limit) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) > limit) {
        // Break an unbroken token (a URL or a long formula) instead of letting
        // it run off the page.
        let rest = word;
        while (rest && font.widthOfTextAtSize(rest, size) > limit) {
          let cut = rest.length;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > limit) cut -= 1;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      } else {
        line = word;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

interface TableColumn {
  label: string;
  /** A width hint; treated as a proportion of the printable width. */
  width?: number;
  align?: "left" | "right" | "center";
}

type Orientation = "portrait" | "landscape";

class Report {
  pdf!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  page!: PDFPage;
  pages: PDFPage[] = [];
  y = 0;
  headerTitle: string;
  headerSubtitle: string;
  footerLabel: string;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;

  constructor(args: { title: string; subtitle: string; footer: string; orientation?: Orientation }) {
    this.headerTitle = args.title;
    this.headerSubtitle = args.subtitle;
    this.footerLabel = args.footer;
    const size = args.orientation === "landscape" ? A4_LANDSCAPE : A4_PORTRAIT;
    this.pageWidth = size.width;
    this.pageHeight = size.height;
    this.contentWidth = this.pageWidth - MARGIN * 2;
  }

  static async create(args: { title: string; subtitle: string; footer: string; orientation?: Orientation }): Promise<Report> {
    const report = new Report(args);
    report.pdf = await PDFDocument.create();
    report.pdf.setTitle(winAnsi(args.title));
    report.pdf.setAuthor("EVALORA");
    report.pdf.setCreator("EVALORA results service");
    report.pdf.setProducer("EVALORA");
    report.font = await report.pdf.embedFont(StandardFonts.Helvetica);
    report.bold = await report.pdf.embedFont(StandardFonts.HelveticaBold);
    report.italic = await report.pdf.embedFont(StandardFonts.HelveticaOblique);
    report.newPage();
    return report;
  }

  newPage(): void {
    this.page = this.pdf.addPage([this.pageWidth, this.pageHeight]);
    this.pages.push(this.page);
    // Header
    this.page.drawRectangle({ x: 0, y: this.pageHeight - 74, width: this.pageWidth, height: 74, color: COLOURS.primary });
    this.page.drawRectangle({ x: 0, y: this.pageHeight - 78, width: this.pageWidth, height: 4, color: COLOURS.accent });
    this.page.drawText("EVALORA", {
      x: MARGIN,
      y: this.pageHeight - 36,
      size: 17,
      font: this.bold,
      color: COLOURS.white,
    });
    this.page.drawText(winAnsi(this.headerTitle), {
      x: MARGIN,
      y: this.pageHeight - 54,
      size: 9,
      font: this.font,
      color: hexToRgb("#d9e7de"),
    });
    const subtitleWidth = this.font.widthOfTextAtSize(winAnsi(this.headerSubtitle), 8);
    this.page.drawText(winAnsi(this.headerSubtitle), {
      x: this.pageWidth - MARGIN - Math.min(subtitleWidth, 220),
      y: this.pageHeight - 50,
      size: 8,
      font: this.font,
      color: hexToRgb("#d9e7de"),
    });
    this.y = this.pageHeight - 106;
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN + 34) this.newPage();
  }

  space(height: number): void {
    this.y -= height;
  }

  heading(text: string, size = 12): void {
    this.ensure(size + 16);
    this.page.drawText(winAnsi(text), {
      x: MARGIN,
      y: this.y,
      size,
      font: this.bold,
      color: COLOURS.deep,
    });
    this.y -= size + 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 2 },
      end: { x: this.pageWidth - MARGIN, y: this.y + 2 },
      thickness: 0.7,
      color: COLOURS.line,
    });
    this.y -= 8;
  }

  paragraph(
    text: string,
    options: { size?: number; color?: ReturnType<typeof rgb>; bold?: boolean; italic?: boolean; width?: number; indent?: number } = {},
  ): void {
    const size = options.size ?? 9.5;
    const width = (options.width ?? this.contentWidth) - (options.indent ?? 0);
    const lines = wrapText(text, options.bold ? this.bold : this.italic ? this.italic : this.font, size, width);
    const lineHeight = size * 1.34;
    for (const line of lines) {
      this.ensure(lineHeight);
      if (line) {
        this.page.drawText(line, {
          x: MARGIN + (options.indent ?? 0),
          y: this.y,
          size,
          font: options.bold ? this.bold : options.italic ? this.italic : this.font,
          color: options.color ?? COLOURS.ink,
        });
      }
      this.y -= lineHeight;
    }
  }

  bullets(items: string[], options: { size?: number; color?: ReturnType<typeof rgb> } = {}): void {
    const size = options.size ?? 9;
    for (const item of items) {
      const lines = wrapText(item, this.font, size, this.contentWidth - 14);
      lines.forEach((line, index) => {
        this.ensure(size * 1.35);
        if (index === 0) {
          this.page.drawCircle({ x: MARGIN + 3, y: this.y + 3, size: 1.6, color: COLOURS.primary });
        }
        this.page.drawText(line, {
          x: MARGIN + 10,
          y: this.y,
          size,
          font: this.font,
          color: options.color ?? COLOURS.ink,
        });
        this.y -= size * 1.35;
      });
    }
    this.y -= 2;
  }

  keyValueGrid(rows: [string, string][]): void {
    const colWidth = this.contentWidth / 2;
    const size = 8.5;
    for (let index = 0; index < rows.length; index += 2) {
      const pair = rows.slice(index, index + 2);
      const heights = pair.map(([label, value]) =>
        Math.max(
          1,
          wrapText(`${label}: ${value}`, this.font, size, colWidth - 14).length,
        ),
      );
      const rowHeight = Math.max(...heights) * size * 1.32 + 4;
      this.ensure(rowHeight);
      pair.forEach(([label, value], columnIndex) => {
        const x = MARGIN + columnIndex * colWidth;
        this.page.drawText(winAnsi(`${label}:`), {
          x,
          y: this.y,
          size: size - 0.5,
          font: this.bold,
          color: COLOURS.soft,
        });
        const lines = wrapText(value, this.font, size, colWidth - 14);
        lines.forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: x + 2,
            y: this.y - (size + 1) * (lineIndex + 1),
            size,
            font: this.font,
            color: COLOURS.ink,
          });
        });
      });
      this.y -= rowHeight;
    }
  }

  summaryStrip(items: { label: string; value: string; tone?: "primary" | "accent" | "soft" }[]): void {
    const gap = 6;
    const width = (this.contentWidth - gap * (items.length - 1)) / items.length;
    const height = 46;
    this.ensure(height + 8);
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      this.page.drawRectangle({
        x,
        y: this.y - height,
        width,
        height,
        color: item.tone === "primary" ? COLOURS.primary : COLOURS.band,
        borderColor: COLOURS.line,
        borderWidth: 0.6,
      });
      this.page.drawText(winAnsi(item.label.toUpperCase()), {
        x: x + 8,
        y: this.y - 14,
        size: 6.8,
        font: this.bold,
        color: item.tone === "primary" ? hexToRgb("#d9e7de") : COLOURS.soft,
      });
      const valueSize = 13;
      this.page.drawText(winAnsi(item.value), {
        x: x + 8,
        y: this.y - 33,
        size: valueSize,
        font: this.bold,
        color: item.tone === "primary" ? COLOURS.white : COLOURS.deep,
      });
    });
    this.y -= height + 12;
  }

  /**
   * Draw a table that always fits the printable width.
   *
   * Widths are proportions when `width` is omitted: the library measures every
   * header and cell, guarantees each column at least fits its longest word,
   * then distributes the remaining space. Header labels wrap instead of
   * overflowing, so a heading can never run off the page or into the next
   * column, and the header is repeated after every page break.
   */
  table(
    columns: TableColumn[],
    rows: string[][],
    options: { headerFill?: boolean; fontSize?: number; repeatHeader?: boolean } = {},
  ): void {
    const size = options.fontSize ?? 8.2;
    const lineHeight = size * 1.32;
    const padding = 4;
    const widths = this.resolveColumnWidths(columns, rows, size, padding);

    const headerCells = columns.map((column, index) =>
      wrapText(column.label, this.bold, size - 0.2, widths[index] - padding * 2),
    );
    const headerLines = Math.max(1, ...headerCells.map((cell) => cell.length));
    const headerHeight = headerLines * lineHeight + padding * 2;

    const drawHeader = () => {
      this.ensure(headerHeight + 2);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - headerHeight,
        width: this.contentWidth,
        height: headerHeight,
        color: COLOURS.primary,
      });
      let x = MARGIN;
      headerCells.forEach((cell, index) => {
        cell.forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: x + padding,
            y: this.y - padding - size + 0.2 - lineIndex * lineHeight,
            size: size - 0.2,
            font: this.bold,
            color: COLOURS.white,
          });
        });
        x += widths[index];
      });
      this.y -= headerHeight;
    };

    drawHeader();

    if (!rows.length) {
      this.ensure(lineHeight + padding * 2);
      this.page.drawText("No results in this scope.", {
        x: MARGIN + padding,
        y: this.y - padding - size,
        size,
        font: this.italic,
        color: COLOURS.soft,
      });
      this.y -= lineHeight + padding * 2;
      return;
    }

    rows.forEach((row, rowIndex) => {
      const cells = widths.map((width, columnIndex) =>
        wrapText(row[columnIndex] ?? "", this.font, size, width - padding * 2),
      );
      const lines = Math.max(1, ...cells.map((cell) => cell.length));
      const rowHeight = lines * lineHeight + padding * 2;
      if (this.y - rowHeight < MARGIN + 34) {
        this.newPage();
        if (options.repeatHeader !== false) drawHeader();
      }
      if (rowIndex % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - rowHeight,
          width: this.contentWidth,
          height: rowHeight,
          color: COLOURS.band,
        });
      }
      let x = MARGIN;
      cells.forEach((cell, columnIndex) => {
        cell.forEach((line, lineIndex) => {
          if (!line) return;
          const textWidth = this.font.widthOfTextAtSize(line, size);
          const alignedX =
            columns[columnIndex].align === "right"
              ? x + widths[columnIndex] - padding - textWidth
              : columns[columnIndex].align === "center"
                ? x + (widths[columnIndex] - textWidth) / 2
                : x + padding;
          this.page.drawText(line, {
            x: alignedX,
            y: this.y - padding - size - lineIndex * lineHeight,
            size,
            font: this.font,
            color: COLOURS.ink,
          });
        });
        x += widths[columnIndex];
      });
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - rowHeight },
        end: { x: this.pageWidth - MARGIN, y: this.y - rowHeight },
        thickness: 0.4,
        color: COLOURS.line,
      });
      this.y -= rowHeight;
    });
    this.y -= 8;
  }

  /**
   * Turn the caller's column hints into widths that sum to the printable width.
   * A hint is treated as a proportion (not a hard pixel width), so nothing can
   * be pushed past the right margin when the page orientation changes.
   */
  private resolveColumnWidths(columns: TableColumn[], rows: string[][], size: number, padding: number): number[] {
    const count = columns.length;
    const natural = columns.map((column, index) => {
      const headerWidth = Math.max(
        0,
        ...column.label.split(/\s+/).map((word) => this.bold.widthOfTextAtSize(word, size - 0.2)),
      );
      const cellWidth = Math.max(
        0,
        ...rows.slice(0, 200).map((row) => {
          const longestWord = (row[index] ?? "").split(/\s+/).reduce((max, word) =>
            Math.max(max, this.font.widthOfTextAtSize(word, size)), 0);
          return longestWord;
        }),
      );
      const hint = column.width ? (column.width / Math.max(1, columns.reduce((sum, c) => sum + (c.width ?? 0), 0))) * this.contentWidth : null;
      return Math.max(headerWidth, cellWidth, hint ?? 0, 34) + padding * 2;
    });

    const total = natural.reduce((sum, width) => sum + width, 0);
    if (total <= this.contentWidth) {
      // Spread the unused space in proportion to how much each column needs.
      return natural.map((width) => (width / total) * this.contentWidth);
    }

    // Shrink proportionally but never below the widest single word.
    const minimums = columns.map((column, index) => {
      const headerWord = Math.max(
        ...column.label.split(/\s+/).map((word) => this.bold.widthOfTextAtSize(word, size - 0.2)),
        0,
      );
      const cellWord = Math.max(
        0,
        ...rows.slice(0, 200).map((row) =>
          (row[index] ?? "").split(/\s+/).reduce((max, word) =>
            Math.max(max, this.font.widthOfTextAtSize(word, size)), 0),
        ),
      );
      return Math.min(Math.max(headerWord, cellWord), this.contentWidth / Math.max(1, count)) + padding * 2;
    });
    const minTotal = minimums.reduce((sum, width) => sum + width, 0);
    if (minTotal >= this.contentWidth) {
      // Extremely long words everywhere: fall back to equal columns and let the
      // wrapper break the words character by character inside the page.
      return Array.from({ length: count }, () => this.contentWidth / count);
    }
    const slack = this.contentWidth - minTotal;
    const extra = natural.map((width, index) => Math.max(0, width - minimums[index]));
    const extraTotal = extra.reduce((sum, width) => sum + width, 0) || 1;
    return minimums.map((width, index) => width + (extra[index] / extraTotal) * slack);
  }

  async finish(): Promise<Uint8Array> {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: 34 },
        end: { x: this.pageWidth - MARGIN, y: 34 },
        thickness: 0.5,
        color: COLOURS.line,
      });
      page.drawText(winAnsi(this.footerLabel), {
        x: MARGIN,
        y: 22,
        size: 7.2,
        font: this.font,
        color: COLOURS.soft,
      });
      const pageLabel = `Page ${index + 1} of ${total}`;
      const width = this.font.widthOfTextAtSize(pageLabel, 7.2);
      page.drawText(pageLabel, {
        x: this.pageWidth - MARGIN - width,
        y: 22,
        size: 7.2,
        font: this.font,
        color: COLOURS.soft,
      });
      const generated = `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC - EVALORA`;
      page.drawText(generated, {
        x: MARGIN,
        y: 12,
        size: 6.4,
        font: this.font,
        color: COLOURS.soft,
      });
    });
    return this.pdf.save();
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** One student's complete MYP report. */
export async function renderMypIndividualPdf(result: MypResult): Promise<Uint8Array> {
  const report = await Report.create({
    title: "MYP criterion result report",
    subtitle: result.organizationName,
    footer: `${result.studentName} - ${result.examTitle}`,
  });

  report.paragraph(result.organizationName, { size: 14, bold: true, color: COLOURS.deep });
  report.paragraph(result.examTitle, { size: 10.5, color: COLOURS.soft });
  report.space(8);

  report.heading("Student information", 11);
  report.keyValueGrid([
    ["Student", result.studentName],
    ["Student reference", result.studentRef ?? "Not recorded"],
    ["MYP year", result.mypYearLabel ?? "Not mapped to an MYP year"],
    ["Class", result.className ?? "Not recorded"],
  ]);
  report.space(6);

  report.heading("Examination information", 11);
  report.keyValueGrid([
    ["Subject", result.subjectLabel],
    ["Examination", result.examTitle],
    ["Examination date", formatDate(result.examDate)],
    ["Attempt status", result.attemptStatus.replace(/_/g, " ")],
    ["Result status", result.publicationLabel],
    ["Reporting period", result.reportingPeriod ?? "Not set"],
  ]);
  report.space(4);

  report.heading("Overall examination performance", 11);
  report.summaryStrip([
    { label: "Marks obtained", value: `${result.marksAwarded} / ${result.marksMax}`, tone: "primary" },
    { label: "Percentage", value: result.percent === null ? "Pending" : `${result.percent}%` },
    {
      label: "Overall MYP grade",
      value: result.overallGrade === null ? result.gradeStatusLabel : `${result.overallGrade} / 7`,
    },
    { label: "Criterion levels", value: result.totalLevels === null ? "-" : `${result.totalLevels} / ${result.totalLevelsMax}` },
  ]);

  report.heading("Detailed criterion breakdown", 11);
  if (!result.hasCriteria) {
    report.paragraph(
      "This paper is not criterion-mapped, so no MYP criterion levels or overall MYP grade can be derived. The examination marks above remain valid.",
      { italic: true, color: COLOURS.soft },
    );
  } else {
    report.table(
      [
        { label: "Criterion", width: 210 },
        { label: "Marks obtained", width: 62, align: "right" },
        { label: "Maximum marks", width: 66, align: "right" },
        { label: "Percentage", width: 58, align: "right" },
        { label: "Achievement level (0-8)", width: 64, align: "center" },
        { label: "Status", width: 84, align: "center" },
      ],
      result.criteria.map((criterion) => [
        criterion.heading,
        criterion.questionCount === 0 ? "-" : String(criterion.marksAwarded),
        criterion.questionCount === 0 ? "-" : String(criterion.marksMax),
        criterion.percent === null ? "-" : `${criterion.percent}%`,
        criterion.level === null ? "-" : String(criterion.level),
        criterion.statusLabel,
      ]),
    );
  }

  report.heading("Overall MYP grade", 11);
  const gradeLine = result.overallGrade === null
    ? `${result.gradeStatusLabel}. ${result.gradeNote}`
    : `Overall grade ${result.overallGrade} / 7 (${result.gradeStatusLabel}). Total criterion levels: ${result.totalLevels} of ${result.totalLevelsMax}. ${result.gradeNote}`;
  report.paragraph(gradeLine, { size: 9.5 });
  report.paragraph(`Grade boundaries: ${result.gradeSource}`, { size: 8, color: COLOURS.soft });
  report.paragraph(`Criterion levels: ${result.levelSource}`, { size: 8, color: COLOURS.soft });

  if (result.zeroFilledQuestions > 0) {
    report.paragraph(
      `${result.zeroFilledQuestions} question${result.zeroFilledQuestions === 1 ? " was" : "s were"} left unanswered when this attempt ended. Those questions are part of the assessment, so they score zero; the criteria they belong to remain fully assessed.`,
      { size: 8.4, color: COLOURS.ink },
    );
  }

  if (result.pendingCriteria.length || result.unassessedCriteria.length || result.errorCriteria.length) {
    report.space(4);
    report.heading("Incomplete evidence", 10);
    if (result.pendingCriteria.length) {
      report.paragraph(
        `Still to be marked: ${result.pendingCriteria.map((code) => `Criterion ${code}`).join(", ")}. These criteria are pending, NOT zero.`,
        { size: 9 },
      );
    }
    if (result.unassessedCriteria.length) {
      report.paragraph(
        `Not assessed on this paper: ${result.unassessedCriteria.map((code) => `Criterion ${code}`).join(", ")}. No level is awarded for them and they are not counted as zero.`,
        { size: 9 },
      );
    }
    if (result.errorCriteria.length) {
      report.paragraph(
        `Marking data error: ${result.errorCriteria.map((code) => `Criterion ${code}`).join(", ")}. A mark in this criterion is not a valid number; it needs correction and is excluded from the overall grade rather than scored as zero.`,
        { size: 9, color: COLOURS.danger },
      );
    }
  }

  for (const criterion of result.criteria) {
    report.ensure(90);
    report.heading(criterion.heading, 10.5);
    if (criterion.description) {
      report.paragraph(criterion.description, { size: 8.6, color: COLOURS.soft, italic: true });
    }
    report.paragraph(
      `${criterion.questionCount === 0 ? "Marks - (not assessed)" : `Marks ${criterion.marksAwarded} / ${criterion.marksMax}`}${criterion.percent === null ? "" : ` (${criterion.percent}%)`} - Achievement level: ${
        criterion.level === null ? criterion.statusLabel : `${criterion.level} / 8`
      } - ${criterion.statusLabel}`,
      { size: 9, bold: true },
    );
    if (criterion.assessedAtZero) {
      report.paragraph(
        "This criterion was fully marked and earned no marks: the achievement level is 0, which is different from a criterion that was not assessed.",
        { size: 8.4, color: COLOURS.ink },
      );
    }
    if (criterion.zeroFilledCount > 0) {
      report.paragraph(
        `${criterion.zeroFilledCount} question${criterion.zeroFilledCount === 1 ? "" : "s"} in this criterion were unanswered at the end of the attempt and scored zero.`,
        { size: 8.4, color: COLOURS.soft },
      );
    }
    if (criterion.feedback) report.paragraph(`Teacher feedback: ${criterion.feedback}`, { size: 8.8 });
    if (criterion.strengths.length) {
      report.paragraph("Demonstrated strengths", { size: 8.8, bold: true });
      report.bullets(criterion.strengths, { size: 8.4 });
    }
    if (criterion.improvements.length) {
      report.paragraph("Areas for improvement", { size: 8.8, bold: true });
      report.bullets(criterion.improvements, { size: 8.4 });
    }
    if (criterion.status === "pending_marking" || criterion.status === "partially_marked") {
      report.paragraph(
        `${criterion.pendingCount} question${criterion.pendingCount === 1 ? "" : "s"} in this criterion still await marking. No level is inferred in the meantime.`,
        { size: 8.4, color: COLOURS.soft, italic: true },
      );
    }
    report.space(4);
  }

  report.heading("Teacher feedback and improvement recommendations", 10.5);
  if (!result.strengths.length && !result.improvements.length && !result.teacherFeedback.length) {
    report.paragraph("No criterion feedback has been recorded for this paper yet.", { italic: true, color: COLOURS.soft });
  } else {
    if (result.teacherFeedback.length) {
      report.paragraph("Teacher feedback", { size: 9, bold: true });
      report.bullets(result.teacherFeedback, { size: 8.6 });
    }
    if (result.strengths.length) {
      report.paragraph("Demonstrated strengths", { size: 9, bold: true });
      report.bullets(result.strengths, { size: 8.6 });
    }
    if (result.improvements.length) {
      report.paragraph("Areas for improvement", { size: 9, bold: true });
      report.bullets(result.improvements, { size: 8.6 });
    }
  }

  report.heading("Assessment status and reporting information", 10.5);
  report.paragraph(
    "Criterion status key: Assessed (green) - fully marked, including a genuine 0. Partially marked / Pending marking (amber) - some or all questions still await a mark, so no level is inferred and the criterion is not zero. Not assessed (grey) - the criterion has no questions on this paper; no level is awarded. Marking data error (red) - a mark is invalid and needs correction.",
    { size: 8.2, color: COLOURS.ink },
  );
  report.paragraph(
    `Publication status: ${result.publicationLabel}. ${result.published ? "This is the released result of record." : "This report is for authorised staff only and the result has not been released to the student."}`,
    { size: 8.4, color: COLOURS.soft },
  );
  report.paragraph(
    "Criterion levels are derived from the marks earned on this paper. They are the evidence a teacher moderates; they are not an IB eAssessment result and EVALORA is not affiliated with the IB.",
    { size: 8, color: COLOURS.soft, italic: true },
  );
  report.paragraph(
    "Strengths and improvement points are derived automatically from the marks recorded against each criterion; they are not a substitute for the teacher's professional judgement.",
    { size: 7.8, color: COLOURS.soft, italic: true },
  );

  return report.finish();
}

function distributionBar(report: Report, analytics: MypAnalytics): void {
  const max = Math.max(1, ...analytics.gradeDistribution.map((bucket) => bucket.count));
  const barWidth = report.contentWidth / 7 - 8;
  const height = 46;
  report.ensure(height + 30);
  report.page.drawRectangle({
    x: MARGIN,
    y: report.y - height - 14,
    width: report.contentWidth,
    height: height + 26,
    color: COLOURS.band,
    borderColor: COLOURS.line,
    borderWidth: 0.5,
  });
  analytics.gradeDistribution.forEach((bucket, index) => {
    const x = MARGIN + 8 + index * (barWidth + 8);
    const barHeight = Math.round((bucket.count / max) * (height - 8)) + (bucket.count ? 3 : 0);
    report.page.drawRectangle({
      x,
      y: report.y - 14 - barHeight,
      width: barWidth,
      height: barHeight,
      color: bucket.count ? COLOURS.primary : COLOURS.line,
    });
    const label = `${bucket.grade}`;
    report.page.drawText(label, {
      x: x + barWidth / 2 - report.bold.widthOfTextAtSize(label, 8) / 2,
      y: report.y - 10,
      size: 8,
      font: report.bold,
      color: COLOURS.deep,
    });
    const count = String(bucket.count);
    report.page.drawText(count, {
      x: x + barWidth / 2 - report.font.widthOfTextAtSize(count, 7) / 2,
      y: report.y - 22 - barHeight,
      size: 7,
      font: report.font,
      color: COLOURS.soft,
    });
  });
  const caption = "Overall MYP grade distribution (1-7)";
  report.page.drawText(caption, {
    x: MARGIN + 8,
    y: report.y - height - 8,
    size: 6.8,
    font: report.bold,
    color: COLOURS.soft,
  });
  report.y -= height + 34;
}

/** Collective report for a class, examination, subject, year or organization. */
export async function renderMypCollectivePdf(args: {
  title: string;
  scope: string;
  results: MypResult[];
  analytics: MypAnalytics;
  generatedBy?: string | null;
}): Promise<Uint8Array> {
  const { results, analytics } = args;
  const report = await Report.create({
    title: "MYP collective results report",
    subtitle: args.scope,
    footer: `${args.title} - ${results.length} result${results.length === 1 ? "" : "s"}`,
    // Wide criterion tables stay readable in landscape; nothing is squeezed
    // into a portrait column that would cut a name or a heading off.
    orientation: "landscape",
  });

  report.paragraph(args.title, { size: 15, bold: true, color: COLOURS.deep });
  report.paragraph(args.scope, { size: 9.5, color: COLOURS.soft });
  report.space(6);

  report.summaryStrip([
    { label: "Results", value: String(analytics.results) },
    { label: "Average", value: analytics.averagePercent === null ? "-" : `${analytics.averagePercent}%` },
    {
      label: "Average MYP grade",
      value: analytics.averageOverallGrade === null ? "-" : `${analytics.averageOverallGrade} / 7`,
      tone: "primary",
    },
    { label: "Complete", value: `${analytics.complete} / ${analytics.results}` },
  ]);

  report.paragraph(
    `Highest result ${analytics.highestPercent === null ? "-" : `${analytics.highestPercent}%`} - lowest result ${
      analytics.lowestPercent === null ? "-" : `${analytics.lowestPercent}%`
    } - released ${analytics.published} of ${analytics.results} - pending marking ${analytics.pendingMarking} copy${analytics.pendingMarking === 1 ? "" : "ies"}.`,
    { size: 8.8, color: COLOURS.soft },
  );
  report.space(4);

  report.heading("Grade distribution");
  distributionBar(report, analytics);

  report.heading("Criterion performance");
  report.table(
    [
      { label: "Criterion", width: 250 },
      { label: "Assessed", width: 62, align: "right" },
      { label: "Avg %", width: 62, align: "right" },
      { label: "Avg level", width: 66, align: "right" },
      { label: "Pending", width: 50, align: "right" },
      { label: "Not assessed", align: "right" },
    ],
    analytics.criteria.map((criterion) => [
      criterion.title ? `Criterion ${criterion.code} - ${criterion.title}` : `Criterion ${criterion.code}`,
      String(criterion.assessed),
      criterion.averagePercent === null ? "-" : `${criterion.averagePercent}%`,
      criterion.averageLevel === null ? "-" : `${criterion.averageLevel}`,
      String(criterion.pending),
      String(criterion.notAssessed),
    ]),
  );

  const yearRows = analytics.years.filter((year) => year.count > 0);
  if (yearRows.length) {
    report.heading("MYP year summary", 10);
    report.table(
      [
        { label: "MYP year", width: 140 },
        { label: "Results", width: 90, align: "right" },
        { label: "Average %", width: 90, align: "right" },
        { label: "" },
      ],
      yearRows.map((year) => [
        `MYP ${year.year}`,
        String(year.count),
        year.averagePercent === null ? "-" : `${year.averagePercent}%`,
        "",
      ]),
    );
  }

  report.heading("Results by student");
  report.table(
    [
      { label: "Student", width: 118 },
      { label: "MYP", width: 34, align: "center" },
      { label: "Class", width: 82 },
      { label: "Subject", width: 92 },
      { label: "Marks", width: 52, align: "right" },
      { label: "%", width: 40, align: "right" },
      { label: "Levels", width: 44, align: "right" },
      { label: "Grade", width: 40, align: "center" },
      { label: "Status", align: "center" },
    ],
    results.map((result) => [
      result.studentName,
      result.mypYearLabel ? String(result.mypYear) : "-",
      result.className ?? "-",
      result.subjectLabel,
      `${result.marksAwarded}/${result.marksMax}`,
      result.percent === null ? "-" : `${result.percent}%`,
      result.totalLevels === null ? "-" : `${result.totalLevels}/${result.totalLevelsMax}`,
      result.overallGrade === null ? result.gradeStatusLabel.slice(0, 3) : `${result.overallGrade}`,
      result.published ? "Released" : "Not released",
    ]),
  );

  report.paragraph(
    "A grade marked Incomplete means at least one required criterion is not yet marked; it is not a zero and it is not an estimate. Provisional grades aggregate only the criteria that are fully marked, under the organization's configured assessment rules.",
    { size: 8, color: COLOURS.soft, italic: true },
  );
  report.paragraph(
    "Unanswered questions at the end of a submitted attempt score zero, so a student who did not finish the paper still receives a mark, an achievement level and a status for every criterion the paper assesses. A genuine 0 is an assessed result; a criterion that is still being marked is amber and is never shown as 0.",
    { size: 8, color: COLOURS.soft, italic: true },
  );
  report.paragraph(
    "Criterion status key: Assessed (green) - fully marked, including a genuine 0. Partially marked / Pending marking (amber) - marking outstanding, no level inferred. Not assessed (grey) - no questions on this paper. Marking data error (red) - invalid mark needing correction.",
    { size: 8, color: COLOURS.soft },
  );
  report.paragraph(`Grade boundaries in use: ${results[0]?.gradeSource ?? "IB MYP published boundaries"}.`, {
    size: 8,
    color: COLOURS.soft,
  });

  report.heading("Individual criterion records");
  for (const result of results) {
    report.ensure(120);
    report.paragraph(result.studentName, { size: 10.5, bold: true, color: COLOURS.deep, width: report.contentWidth });
    report.paragraph(
      `${result.mypYearLabel ?? "MYP year not mapped"} - ${result.className ?? "No class"} - ${result.subjectLabel} - ${result.examTitle} - ${formatDate(result.examDate)}`,
      { size: 8.2, color: COLOURS.soft },
    );
    report.paragraph(
      `${result.marksAwarded} / ${result.marksMax}${result.percent === null ? "" : ` (${result.percent}%)`} - Overall MYP grade: ${
        result.overallGrade === null ? result.gradeStatusLabel : `${result.overallGrade} / 7 (${result.gradeStatusLabel})`
      } - ${result.publicationLabel}`,
      { size: 8.6, bold: true },
    );
    report.table(
      [
        { label: "Criterion", width: 260 },
        { label: "Marks obtained", width: 64, align: "right" },
        { label: "Maximum marks", width: 66, align: "right" },
        { label: "Percentage", width: 58, align: "right" },
        { label: "Achievement level (0-8)", width: 72, align: "center" },
        { label: "Status", width: 96, align: "center" },
      ],
      result.criteria.map((criterion) => [
        criterion.heading,
        criterion.questionCount === 0 ? "-" : String(criterion.marksAwarded),
        criterion.questionCount === 0 ? "-" : String(criterion.marksMax),
        criterion.percent === null ? "-" : `${criterion.percent}%`,
        criterion.level === null ? "-" : String(criterion.level),
        criterion.statusLabel,
      ]),
      { fontSize: 7.8 },
    );
    report.space(6);
  }

  return report.finish();
}

