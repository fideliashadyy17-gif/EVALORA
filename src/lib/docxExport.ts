/**
 * Word (.docx) report builder.
 *
 * A .docx file is a ZIP package of XML parts. This module produces those parts
 * for a simple report — a title, headings, paragraphs, bullet lists and tables —
 * as real WordprocessingML, so the result opens as a normal, editable document
 * in Microsoft Word, LibreOffice, Google Docs and WPS (no "HTML saved as .doc"
 * trick, no embedded HTML chunk that only desktop Word understands).
 *
 * It is deliberately pure: no imports, no DOM, no ZIP code. The caller packs
 * the parts into a ZIP (see ExportWordButton), which keeps this file testable
 * in plain Node and safe to use from server or client code.
 *
 * Every value is written as text: names, references and titles typed by users
 * are XML-escaped here, in one place, so no caller can inject markup.
 */

export type DocxCell = string | number | null | undefined;

export interface DocxTable {
  head: string[];
  rows: DocxCell[][];
}

export interface DocxSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: DocxTable;
  /** Shown instead of the table when it has no rows. */
  emptyNote?: string;
}

export interface DocxReport {
  title: string;
  subtitle?: string;
  sections: DocxSection[];
}

export interface DocxPart {
  /** Path inside the package, e.g. `word/document.xml`. */
  path: string;
  xml: string;
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** A4 landscape with 1.27 cm margins, in twentieths of a point. */
const PAGE = { width: 16838, height: 11906, margin: 720 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

/** Drop characters XML 1.0 cannot carry (control codes, unpaired surrogates). */
function xmlSafe(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i] + value[i + 1];
        i++;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    if (code === 0xfffe || code === 0xffff) continue;
    out += value[i];
  }
  return out;
}

function escapeXml(value: string): string {
  return xmlSafe(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellText(value: DocxCell): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value);
}

function run(text: string, options: { bold?: boolean } = {}): string {
  const lines = text.split(/\r\n|\r|\n/);
  const body = lines
    .map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join("");
  return `<w:r>${options.bold ? "<w:rPr><w:b/><w:bCs/></w:rPr>" : ""}${body}</w:r>`;
}

function paragraph(text: string, options: { style?: string; bold?: boolean } = {}): string {
  const props = options.style ? `<w:pPr><w:pStyle w:val="${options.style}"/></w:pPr>` : "";
  return `<w:p>${props}${text ? run(text, { bold: options.bold }) : ""}</w:p>`;
}

function tableCell(text: string, width: number, header: boolean): string {
  const shade = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E3EDE6"/>' : "";
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}</w:tcPr>` +
    `<w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr>${text ? run(text, { bold: header }) : ""}</w:p></w:tc>`
  );
}

function table(spec: DocxTable): string {
  const columns = Math.max(1, spec.head.length, ...spec.rows.map((row) => row.length));
  const width = Math.floor(CONTENT_WIDTH / columns);
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="7C8F82"/>`;
  const cells = (row: DocxCell[], header: boolean) =>
    Array.from({ length: columns }, (_, index) => tableCell(cellText(row[index]), width, header)).join("");

  return (
    "<w:tbl>" +
    "<w:tblPr>" +
    `<w:tblW w:w="${width * columns}" w:type="dxa"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    '<w:tblLayout w:type="autofit"/>' +
    '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>' +
    "</w:tblPr>" +
    `<w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(columns)}</w:tblGrid>` +
    `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${cells(spec.head, true)}</w:tr>` +
    spec.rows.map((row) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells(row, false)}</w:tr>`).join("") +
    "</w:tbl>" +
    // Word needs a paragraph between two tables and after the last one.
    "<w:p/>"
  );
}

function documentXml(report: DocxReport): string {
  const body: string[] = [paragraph(report.title, { style: "Title" })];
  if (report.subtitle) body.push(paragraph(report.subtitle, { style: "Subtitle" }));

  for (const section of report.sections) {
    if (section.heading) body.push(paragraph(section.heading, { style: "Heading1" }));
    for (const text of section.paragraphs ?? []) body.push(paragraph(text));
    for (const text of section.bullets ?? []) body.push(paragraph(`•  ${text}`, { style: "ListItem" }));
    if (section.table) {
      if (section.table.rows.length === 0 && section.emptyNote) body.push(paragraph(section.emptyNote));
      else body.push(table(section.table));
    }
  }

  return (
    XML_HEADER +
    `<w:document xmlns:w="${W_NS}"><w:body>` +
    body.join("") +
    `<w:sectPr><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}" w:orient="landscape"/>` +
    `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>` +
    "</w:body></w:document>"
  );
}

function stylesXml(): string {
  const font = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>';
  const style = (id: string, name: string, pPr: string, rPr: string) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;
  return (
    XML_HEADER +
    `<w:styles xmlns:w="${W_NS}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:spacing w:after="100"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    style("Title", "Title", '<w:spacing w:after="60"/>', '<w:b/><w:bCs/><w:color w:val="0F3D2E"/><w:sz w:val="40"/><w:szCs w:val="40"/>') +
    style("Subtitle", "Subtitle", '<w:spacing w:after="200"/>', '<w:color w:val="4B5B52"/><w:sz w:val="22"/><w:szCs w:val="22"/>') +
    style("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:bCs/><w:color w:val="0F3D2E"/><w:sz w:val="28"/><w:szCs w:val="28"/>') +
    style("ListItem", "List Item", '<w:spacing w:after="40"/><w:ind w:left="360"/>', "") +
    style("TableText", "Table Text", '<w:spacing w:after="0"/>', '<w:sz w:val="16"/><w:szCs w:val="16"/>') +
    "</w:styles>"
  );
}

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  "</Types>";

const PACKAGE_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOCUMENT_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

/** MIME type of the finished package. */
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The XML parts of the report, in the order they should be packed. */
export function buildDocxParts(report: DocxReport): DocxPart[] {
  return [
    { path: "[Content_Types].xml", xml: CONTENT_TYPES },
    { path: "_rels/.rels", xml: PACKAGE_RELS },
    { path: "word/document.xml", xml: documentXml(report) },
    { path: "word/_rels/document.xml.rels", xml: DOCUMENT_RELS },
    { path: "word/styles.xml", xml: stylesXml() },
  ];
}
