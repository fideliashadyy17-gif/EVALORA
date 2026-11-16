import { deflateRawSync } from "node:zlib";

/**
 * A small, dependency-free .xlsx writer.
 *
 * The platform's spreadsheet reader (@e965/xlsx) writes workbooks but silently
 * drops frozen panes, which institutional result sheets need so the header row
 * stays visible while a class of 40 scrolls. Rather than depend on a paid
 * writer, this module emits the OOXML package directly and is verified by the
 * test suite (read back with @e965/xlsx, and the sheet XML is checked for the
 * frozen pane, numeric cells and number formats).
 *
 * Guarantees that matter for school analysis:
 *  · numbers are written as <v> numeric cells — never as text;
 *  · percentages use the 0.0"%" format and stay sortable numbers;
 *  · dates use a real date serial with a yyyy-mm-dd format;
 *  · the header row carries an autofilter and is frozen;
 *  · column widths are set from the caller's plan;
 *  · worksheet names are sanitised and unique.
 */

export type XlsxCellStyle =
  | "text"
  | "number"
  | "integer"
  | "percent"
  | "date"
  | "bold"
  | "center"
  | "wrap"
  | "title"
  | "subtitle";

export interface XlsxColumn {
  header: string;
  /** Excel column width in characters. */
  width?: number;
  style?: XlsxCellStyle;
}

export type XlsxCellValue = string | number | Date | null | undefined;

export interface XlsxSheet {
  name: string;
  title?: string;
  subtitle?: string;
  columns: XlsxColumn[];
  rows: XlsxCellValue[][];
  /** Freeze the header row (default true). */
  freezeHeader?: boolean;
  /** Add an autofilter over the header row (default true). */
  autofilter?: boolean;
}

/* ── XML helpers ─────────────────────────────────────────────────────── */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Control characters are not legal in XML 1.0 and would corrupt the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/** Excel serial date (1900 system). */
export function excelDateSerial(date: Date): number {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return utc / 86400000 + 25569;
}

const STYLE_INDEX: Record<XlsxCellStyle, number> = {
  text: 2,
  number: 3,
  integer: 4,
  percent: 5,
  date: 6,
  bold: 7,
  center: 10,
  wrap: 11,
  title: 8,
  subtitle: 9,
};

const COLUMN_STYLE_DEFAULT: XlsxCellStyle = "text";

function cellXml(ref: string, value: XlsxCellValue, styleIndex: number): string {
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}" s="${styleIndex}"/>`;
  }
  if (value instanceof Date) {
    return `<c r="${ref}" s="${styleIndex}"><v>${excelDateSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<c r="${ref}" s="${styleIndex}"/>`;
    return `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/* ── Package parts ───────────────────────────────────────────────────── */

const CONTENT_TYPES = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="0.00"/>
<numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>
<numFmt numFmtId="166" formatCode="yyyy-mm-dd"/>
</numFmts>
<fonts count="5">
<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF0A5C36"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF55665C"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF06351F"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0A5C36"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F7F4"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD5DED8"/></left><right style="thin"><color rgb="FFD5DED8"/></right><top style="thin"><color rgb="FFD5DED8"/></top><bottom style="thin"><color rgb="FFD5DED8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = (name || "Sheet").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter++})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function sheetXml(sheet: XlsxSheet): string {
  const columns = sheet.columns;
  const titleRows = sheet.title ? 1 : 0;
  const subtitleRows = sheet.subtitle ? 1 : 0;
  const headerRow = titleRows + subtitleRows + 1;
  const lastColumn = columnName(Math.max(0, columns.length - 1));
  const rowsXml: string[] = [];

  if (sheet.title) {
    rowsXml.push(
      `<row r="1">${cellXml("A1", sheet.title, STYLE_INDEX.title)}${columns
        .slice(1)
        .map((_, index) => `<c r="${columnName(index + 1)}1" s="${STYLE_INDEX.title}"/>`)
        .join("")}</row>`,
    );
  }
  if (sheet.subtitle) {
    const row = titleRows + 1;
    rowsXml.push(
      `<row r="${row}">${cellXml(`A${row}`, sheet.subtitle, STYLE_INDEX.subtitle)}${columns
        .slice(1)
        .map((_, index) => `<c r="${columnName(index + 1)}${row}" s="${STYLE_INDEX.subtitle}"/>`)
        .join("")}</row>`,
    );
  }

  rowsXml.push(
    `<row r="${headerRow}">${columns
      .map((column, index) => cellXml(`${columnName(index)}${headerRow}`, column.header, 1))
      .join("")}</row>`,
  );

  sheet.rows.forEach((row, rowIndex) => {
    const rowNumber = headerRow + rowIndex + 1;
    const cells = columns.map((column, columnIndex) => {
      const value = row[columnIndex];
      const style = STYLE_INDEX[column.style ?? COLUMN_STYLE_DEFAULT];
      return cellXml(`${columnName(columnIndex)}${rowNumber}`, value, style);
    });
    rowsXml.push(`<row r="${rowNumber}">${cells.join("")}</row>`);
  });

  const lastRow = headerRow + sheet.rows.length;
  const cols = columns
    .map((column, index) => {
      const width = Math.min(Math.max(column.width ?? Math.max(12, column.header.length + 2), 8), 60);
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const merges: string[] = [];
  if (columns.length > 1) {
    if (sheet.title) merges.push("A1:" + `${lastColumn}1`);
    if (sheet.subtitle) merges.push(`A${titleRows + 1}:${lastColumn}${titleRows + 1}`);
  }
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  const pane = sheet.freezeHeader === false
    ? ""
    : `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>`;
  const autofilter =
    sheet.autofilter === false || columns.length === 0
      ? ""
      : `<autoFilter ref="A${headerRow}:${lastColumn}${Math.max(headerRow, lastRow)}"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastColumn}${Math.max(headerRow, lastRow)}"/>
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rowsXml.join("")}</sheetData>
${autofilter}
${mergeXml}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

const WORKBOOK = (sheetNames: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheetNames.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n")}
</sheets>
<calcPr calcId="171027" fullCalcOnLoad="1"/>
</workbook>`;

/* ── ZIP writer (deflate, no external dependency) ────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

export function zipFiles(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const useDeflate = compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

/** Build an .xlsx workbook from plain sheets. */
export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  if (!sheets.length) throw new Error("A workbook needs at least one worksheet.");
  const used = new Set<string>();
  const names = sheets.map((sheet) => sanitizeSheetName(sheet.name, used));
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES(sheets.length), "utf8") },
    { name: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(WORKBOOK(names), "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(WORKBOOK_RELS(sheets.length), "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(STYLES, "utf8") },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(sheetXml(sheet), "utf8"),
    })),
  ];
  return zipFiles(entries);
}
