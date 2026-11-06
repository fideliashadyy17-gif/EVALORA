import { parseCsv } from "./csv";

/**
 * Server-side document extraction for the student-import wizard.
 * Converts CSV / XLS / XLSX / PDF (text layer) / DOC / DOCX / TXT into
 * a plain row×cell matrix. PDF/DOC structures are inherently ambiguous:
 * rows are reconstructed from text positions/lines and the wizard makes
 * the user map, inspect and correct everything before import. Scanned
 * PDFs with no text layer return `needsOcr` so the browser can run OCR.
 * Extracted text is returned to the user's own session only and is never
 * stored as student data.
 */

export interface ExtractResult {
  rows: string[][];
  method: string;
  warnings: string[];
  needsOcr: boolean;
  sheets?: string[];
  sheet?: string;
  pages?: number;
}

const MAX_ROWS = 5000;
const MAX_COLS = 32;

function clean(rows: unknown[][]): string[][] {
  return rows
    .map((r) => (Array.isArray(r) ? r : []).slice(0, MAX_COLS).map((c) => String(c ?? "").replace(/\s+/g, " ").trim()))
    .filter((r) => r.some((c) => c !== ""))
    .slice(0, MAX_ROWS);
}

function linesToRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("\t")) return line.split(/\t+/).map((c) => c.trim());
      if (/ {2,}/.test(line)) return line.split(/ {2,}/).map((c) => c.trim());
      if (line.includes(";")) return line.split(/;+/).map((c) => c.trim());
      return [line];
    });
}

function decodeHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractSpreadsheet(buffer: Buffer): Promise<ExtractResult> {
  const XLSX = await import("@e965/xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const warnings: string[] = [];
  let best: string[][] = [];
  let bestSheet = wb.SheetNames[0] ?? "";
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = clean(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][]);
    if (rows.length > best.length) {
      best = rows;
      bestSheet = name;
    }
  }
  if (wb.SheetNames.length > 1) warnings.push(`Workbook has ${wb.SheetNames.length} sheets — extracted “${bestSheet}” (the one with the most rows). Other sheets were not imported.`);
  return { rows: best, method: "spreadsheet", warnings, needsOcr: false, sheets: wb.SheetNames, sheet: bestSheet };
}

/** Detect separators in the first nonempty logical record, ignoring quoted text. */
function csvDelimiter(text: string): { ch: string; label: string } {
  const candidates = [
    { ch: ",", label: "comma", count: 0 }, { ch: ";", label: "semicolon", count: 0 },
    { ch: "\t", label: "tab", count: 0 }, { ch: "|", label: "pipe", count: 0 },
  ];
  let quoted = false;
  let hasContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      hasContent = true;
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (hasContent) break;
    } else if (!quoted) {
      const candidate = candidates.find((item) => item.ch === ch);
      if (candidate) candidate.count++;
      if (!/\s/.test(ch) || candidate) hasContent = true;
    }
  }
  // Stable ordering retains comma as the default when counts tie or are zero.
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0];
}

async function extractCsv(buffer: Buffer): Promise<ExtractResult> {
  const text = buffer.toString("utf8");
  const delimiter = csvDelimiter(text.replace(/^\uFEFF/, ""));
  const rows = clean(parseCsv(text, delimiter.ch));
  return { rows, method: `csv (${delimiter.label}-separated)`, warnings: [], needsOcr: false };
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // pdfjs-dist legacy build runs in Node serverless without a worker file.
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument(args: { data: Uint8Array }): { promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str: string; transform: number[]; width?: number }[] }> }>;
    }> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows: string[][] = [];
  let textLength = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; text: string; width: number }[]>();
    for (const item of content.items) {
      const text = (item.str ?? "").trim();
      if (!text) continue;
      textLength += text.length;
      const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
      const arr = lines.get(y) ?? [];
      arr.push({ x: item.transform?.[4] ?? 0, text, width: item.width ?? text.length * 5 });
      lines.set(y, arr);
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of sorted) {
      items.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let current = "";
      let prevEnd = -Infinity;
      for (const it of items) {
        const gap = it.x - prevEnd;
        if (current && gap > 18) {
          cells.push(current.trim());
          current = it.text;
        } else {
          current = current ? `${current} ${it.text}` : it.text;
        }
        prevEnd = it.x + it.width;
      }
      if (current.trim()) cells.push(current.trim());
      if (cells.length) rows.push(cells);
    }
  }
  const needsOcr = textLength < 20;
  return {
    rows: clean(rows),
    method: "pdf text layer",
    pages: doc.numPages,
    needsOcr,
    warnings: needsOcr
      ? ["This PDF has no usable text layer — it is probably a scanned/image PDF. Use the browser OCR step, then carefully verify every extracted value."]
      : ["PDF columns were reconstructed from text positions. Verify the column mapping and preview carefully — merged or multi-line cells may need correction."],
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const html = await mammoth.convertToHtml({ buffer });
  const tableRows: string[][] = [];
  const trMatches = html.value.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => decodeHtml(m[1]));
    if (cells.some(Boolean)) tableRows.push(cells);
  }
  if (tableRows.length > 0) {
    return { rows: clean(tableRows), method: "word tables", needsOcr: false, warnings: html.messages.slice(0, 3).map((m) => m.message) };
  }
  const text = await mammoth.extractRawText({ buffer });
  return {
    rows: clean(linesToRows(text.value)),
    method: "word text",
    needsOcr: false,
    warnings: ["No table was found in this document; lines of text were extracted. Structured tables import far more reliably than paragraphs."],
  };
}

async function extractDoc(buffer: Buffer): Promise<ExtractResult> {
  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const rows = clean(linesToRows(doc.getBody()));
  return {
    rows,
    method: "legacy word (.doc)",
    needsOcr: false,
    warnings: ["Legacy .doc files do not preserve table structure reliably. Verify every row in the preview; converting to .docx or .xlsx gives better results."],
  };
}

export const IMPORT_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx", ".pdf", ".doc", ".docx", ".txt"];

export async function extractStudentRows(fileName: string, buffer: Buffer): Promise<ExtractResult> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  switch (ext) {
    case ".csv":
    case ".txt":
      return extractCsv(buffer);
    case ".xls":
    case ".xlsx":
      return extractSpreadsheet(buffer);
    case ".pdf":
      return extractPdf(buffer);
    case ".docx":
      return extractDocx(buffer);
    case ".doc":
      return extractDoc(buffer);
    default:
      throw new Error(`Unsupported file format “${ext || fileName}”. Supported: CSV, XLS, XLSX, PDF, DOC, DOCX.`);
  }
}
