"use client";

import { Button, Field, Input, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { toCsv } from "@/lib/utils";
import {
  STUDENT_IMPORT_FIELDS, guessFieldForHeader, looksLikeHeader, resolveClass, rowsToRecords,
  sha256Hex, validateImportRecord,
  type ExistingIdentities, type ImportClassRef, type StudentImportField, type StudentImportRecord,
} from "@/lib/studentImport";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

export interface WizardYear { id: string; name: string; is_current: boolean }
export interface WizardExisting { refs: string[]; emails: string[]; nameDob: string[] }

interface ExtractResponse {
  ok?: boolean; rows?: string[][]; method?: string; warnings?: string[];
  needsOcr?: boolean; pages?: number; error?: string;
}
interface RowReport { row: number; name: string; status: string; errors: string[]; warnings: string[] }
interface ImportResponse {
  ok?: boolean; error?: string; duplicateFile?: boolean; batchId?: string;
  total?: number; imported?: number; updated?: number; skipped?: number; failed?: number; report?: RowReport[];
}

const ACCEPT = ".csv,.xls,.xlsx,.pdf,.doc,.docx,.txt";
const MAX_BYTES = 10 * 1024 * 1024;
const TEMPLATE_HEADER = ["full_name", "student_ref", "email", "gender", "date_of_birth", "phone", "guardian_name", "guardian_contact", "class", "academic_year"];

/**
 * Advanced student import wizard: upload (CSV/XLS/XLSX/PDF/DOC/DOCX) →
 * extraction (+ optional browser OCR for scanned PDFs) → column mapping
 * → editable validated preview → explicit confirmation → server import
 * with a full downloadable report. The server re-validates everything.
 */
export function StudentImportWizard({
  organizationId, classes, years, existing,
}: {
  organizationId: string;
  classes: ImportClassRef[];
  years: WizardYear[];
  existing?: WizardExisting;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [loadedExisting, setLoadedExisting] = useState<WizardExisting | null>(null);
  const [checkingIdentities, setCheckingIdentities] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [extract, setExtract] = useState<ExtractResponse | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<StudentImportField[]>([]);
  const [records, setRecords] = useState<StudentImportRecord[]>([]);
  const [defaultClassId, setDefaultClassId] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update">("skip");
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [dragOver, setDragOver] = useState(false);

  const activeClasses = useMemo(() => classes.filter((c) => !c.status || c.status === "active"), [classes]);
  const existingSets = useMemo<ExistingIdentities>(() => ({
    refs: new Set((existing ?? loadedExisting)?.refs ?? []), emails: new Set((existing ?? loadedExisting)?.emails ?? []), nameDob: new Set((existing ?? loadedExisting)?.nameDob ?? []),
  }), [existing, loadedExisting]);
  const defaultClass = activeClasses.find((c) => c.id === defaultClassId) ?? null;

  const validations = useMemo(() => {
    const seen: ExistingIdentities = { refs: new Set(), emails: new Set(), nameDob: new Set() };
    return records.map((rec) => {
      const v = validateImportRecord(rec, activeClasses, existingSets, seen, false);
      const cls = resolveClass(rec, activeClasses) ?? defaultClass;
      if (!cls && rec.include) v.errors.push("No class — map/select a class or choose a default class below.");
      return { ...v, cls };
    });
  }, [records, activeClasses, existingSets, defaultClass]);

  const summary = useMemo(() => {
    let ready = 0, updates = 0, invalid = 0, duplicates = 0, excluded = 0;
    records.forEach((rec, i) => {
      const v = validations[i];
      if (!rec.include) excluded++;
      else if (v.errors.length) invalid++;
      else if (v.duplicate === "in_file") duplicates++;
      else if (v.duplicate === "existing") { if (duplicateMode === "update") updates++; else duplicates++; }
      else ready++;
    });
    return { total: records.length, ready, updates, invalid, duplicates, excluded };
  }, [records, validations, duplicateMode]);

  function reset(clearFile = true) {
    setLoadedExisting(null);
    if (clearFile) setFile(null);
    setExtract(null); setRows([]); setMapping([]); setRecords([]); setResult(null);
    setConfirmed(false); setError(null); setStep(1);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function runExtraction(chosen: File) {
    setError(null); setResult(null);
    if (chosen.size > MAX_BYTES) { setError(`“${chosen.name}” is ${(chosen.size / 1048576).toFixed(1)} MB — the limit is 10 MB. Split the file or export a smaller range.`); return; }
    setFile(chosen); setExtracting(true); setStep(2);
    try {
      const form = new FormData();
      form.set("file", chosen);
      const res = await fetch("/api/students/import/extract", { method: "POST", body: form });
      const data = (await res.json()) as ExtractResponse;
      if (!res.ok || !data.rows) throw new Error(data.error ?? "Extraction failed.");
      setExtract(data);
      setRows(data.rows);
      const header = data.rows.length > 0 && looksLikeHeader(data.rows[0]);
      setHasHeader(header);
      const cols = Math.max(0, ...data.rows.map((r) => r.length));
      setMapping(Array.from({ length: cols }, (_, i) => (header ? guessFieldForHeader(data.rows![0]?.[i] ?? "") : "ignore")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  /** OCR for scanned PDFs — runs entirely in the user's browser. */
  async function runOcr() {
    if (!file) return;
    setOcrBusy(true); setError(null);
    try {
      // Dynamic, browser-only heavy dependencies.
      const pdfjs = (await import("pdfjs-dist")) as unknown as {
        version: string; GlobalWorkerOptions: { workerSrc: string };
        getDocument(args: { data: ArrayBuffer }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getViewport(o: { scale: number }): unknown; render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> } }> }> };
      };
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const tesseractModule = (await import("tesseract.js")) as unknown as {
        default?: { recognize(image: HTMLCanvasElement, langs: string): Promise<{ data: { text: string } }> };
        recognize?: (image: HTMLCanvasElement, langs: string) => Promise<{ data: { text: string } }>;
      };
      const tesseract = tesseractModule.default ?? tesseractModule;
      if (!tesseract.recognize) throw new Error("OCR engine could not be loaded in this browser.");
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const ocrRows: string[][] = [];
      const pages = Math.min(doc.numPages, 20);
      for (let p = 1; p <= pages; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 2 }) as { width: number; height: number };
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvasContext: context, viewport }).promise;
        const { data } = await tesseract.recognize(canvas, "eng+fra");
        for (const line of data.text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed) ocrRows.push(trimmed.includes("\t") ? trimmed.split(/\t+/) : / {2,}/.test(trimmed) ? trimmed.split(/ {2,}/) : [trimmed]);
        }
      }
      if (ocrRows.length === 0) throw new Error("OCR could not read any text from this scan. Try a clearer scan, or type the register into the CSV template.");
      setExtract((prev) => ({ ...prev, method: "browser OCR (scanned PDF)", needsOcr: false, warnings: ["OCR results are uncertain by nature — verify every name, date and class in the preview before importing."] }));
      setRows(ocrRows);
      const header = looksLikeHeader(ocrRows[0] ?? []);
      setHasHeader(header);
      const cols = Math.max(0, ...ocrRows.map((r) => r.length));
      setMapping(Array.from({ length: cols }, (_, i) => (header ? guessFieldForHeader(ocrRows[0]?.[i] ?? "") : "ignore")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR failed in this browser.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function buildPreview() {
    if (checkingIdentities) return;
    if (!mapping.includes("full_name")) { setError("Map one column to “Full name” before continuing — a name is required for every student."); return; }
    setError(null);
    if (!existing) {
      setCheckingIdentities(true);
      try {
        const response = await fetch("/api/students/import/identities", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || result.organization_id !== organizationId || !result.existing) throw new Error(result.error ?? "Duplicate checks could not be confirmed. Reload the workspace and retry.");
        setLoadedExisting(result.existing);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Duplicate checks could not be loaded.");
        return;
      } finally { setCheckingIdentities(false); }
    }
    setRecords(rowsToRecords(rows, mapping, hasHeader).slice(0, 2000));
    setStep(3);
  }

  const updateRecord = (index: number, patch: Partial<StudentImportRecord>) =>
    setRecords((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function downloadTemplate(kind: "csv" | "xlsx") {
    const sample = [TEMPLATE_HEADER, ["Ada Example", "STU-001", "ada@example.com", "female", "2012-05-14", "+229 90 00 00 00", "Mary Example", "+229 91 00 00 00", activeClasses[0]?.name ?? "Class name", years.find((y) => y.is_current)?.name ?? "2025/2026"]];
    if (kind === "csv") {
      const csv = toCsv(sample);
      downloadBlob(new Blob([csv], { type: "text/csv" }), "evalora-student-import-template.csv");
    } else {
      const XLSX = await import("@e965/xlsx");
      const ws = XLSX.utils.aoa_to_sheet(sample);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Students");
      XLSX.writeFile(wb, "evalora-student-import-template.xlsx");
    }
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadReport() {
    const rowsOut = result?.report ?? records.map((r, i) => ({
      row: r.row, name: r.full_name,
      status: !r.include ? "excluded" : validations[i].errors.length ? "invalid" : validations[i].duplicate ? "duplicate" : "valid",
      errors: validations[i].errors, warnings: validations[i].warnings,
    }));
    const csv = toCsv([
      ["row", "student", "status", "errors", "warnings"],
      ...rowsOut.map((r) => [r.row, r.name, r.status, r.errors.join(" · "), r.warnings.join(" · ")]),
    ]);
    downloadBlob(new Blob([csv], { type: "text/csv" }), "evalora-student-import-report.csv");
  }

  async function runImport() {
    if (!file || !confirmed) return;
    setImporting(true); setError(null);
    try {
      if (!existing && !loadedExisting) throw new Error("Load the duplicate-check preview before importing.");
      const batchId = crypto.randomUUID();
      const hash = await sha256Hex(await file.arrayBuffer());
      // Preserve the original privately in this school's storage area.
      let storagePath: string | null = null;
      try {
        const supabase = createClient();
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        storagePath = `${organizationId}/${batchId}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from("student-imports").upload(storagePath, file, { upsert: false });
        if (uploadError) storagePath = null;
      } catch { storagePath = null; }

      const res = await fetch("/api/students/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId, batch_id: batchId, duplicate_mode: duplicateMode,
          default_class_id: defaultClassId || undefined,
          file: { name: file.name, type: file.name.split(".").pop()?.toLowerCase(), hash, storage_path: storagePath },
          records: records.map((r) => ({ row: r.row, include: r.include, full_name: r.full_name, student_ref: r.student_ref, email: r.email, gender: r.gender, date_of_birth: r.date_of_birth, phone: r.phone, guardian_name: r.guardian_name, guardian_contact: r.guardian_contact, class_name: r.class_name, class_id: r.class_id, academic_year: r.academic_year })),
        }),
      });
      const data = (await res.json()) as ImportResponse;
      setResult(data);
      setStep(5);
      if (!res.ok && !data.duplicateFile) setError(data.error ?? "The import failed.");
      if (data.ok) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed.");
      setStep(5);
    } finally {
      setImporting(false);
    }
  }

  const stepLabel = ["1 · Upload", "2 · Extract & map columns", "3 · Preview & validate", "4 · Confirm", "5 · Results"][step - 1];
  const columns = Math.max(0, ...rows.map((r) => r.length));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" aria-label="Import progress">
        {["Upload", "Map", "Preview", "Confirm", "Results"].map((label, i) => (
          <span key={label} className={`rounded-full px-3 py-1 text-xs font-semibold ${step === i + 1 ? "bg-evergreen-700 text-white" : step > i + 1 ? "bg-evergreen-100 text-evergreen-900" : "bg-cream text-ink-soft"}`}>
            {i + 1}. {label}
          </span>
        ))}
        <span className="ml-auto text-xs text-ink-soft">{stepLabel}</span>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      {step === 1 && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void runExtraction(f); }}
            className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center ${dragOver ? "border-evergreen-600 bg-evergreen-50" : "border-evergreen-900/25 bg-paper"}`}
          >
            <p className="font-display text-lg font-semibold text-evergreen-950">Drop a student register here, or choose a file</p>
            <p className="mx-auto mt-1 max-w-xl text-sm text-ink-soft">
              Supported: <strong>CSV, XLS, XLSX, PDF, DOC, DOCX</strong> (max 10 MB). Spreadsheets and
              Word/PDF tables import most reliably; scanned PDFs can be read with browser OCR and
              must be verified in the preview. Nothing is saved until you confirm.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button type="button" variant="gold" onClick={() => fileInput.current?.click()}>Choose file…</Button>
              <Button type="button" variant="outline" onClick={() => void downloadTemplate("csv")}>CSV template</Button>
              <Button type="button" variant="outline" onClick={() => void downloadTemplate("xlsx")}>Excel template</Button>
            </div>
            <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" aria-label="Student import file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void runExtraction(f); }} />
            {file && <p className="mt-3 text-sm text-evergreen-900">Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB) <button type="button" className="ml-2 underline" onClick={() => reset()}>Remove</button></p>}
          </div>
          <p className="text-xs text-ink-soft">
            Privacy: the file is processed for your school only. After a confirmed import the original is
            stored privately in your school&apos;s import archive for audit; extracted text is never sold or
            shared, and invalid rows are reported back to you — never silently discarded or invented.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {extracting && <p className="text-sm text-ink-soft">Reading “{file?.name}”…</p>}
          {!extracting && extract && (
            <>
              <div className="rounded-xl bg-cream px-4 py-3 text-sm text-ink">
                <p>Extraction method: <strong>{extract.method}</strong> · {rows.length} row(s) found{extract.pages ? ` · ${extract.pages} page(s)` : ""}.</p>
                {(extract.warnings ?? []).map((w) => <p key={w} className="mt-1 text-amber-800">⚠ {w}</p>)}
                {extract.needsOcr && (
                  <div className="mt-3">
                    <Button type="button" variant="gold" disabled={ocrBusy} onClick={() => void runOcr()}>
                      {ocrBusy ? "Running OCR in your browser…" : "Run OCR on this scanned PDF"}
                    </Button>
                    <span className="ml-2 text-xs text-ink-soft">OCR can take a while and is never perfect — you will verify everything next.</span>
                  </div>
                )}
              </div>
              {rows.length > 0 && (
                <>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                    First row is a header row (column titles)
                  </label>
                  <div className="overflow-x-auto rounded-xl border border-evergreen-900/15">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-evergreen-900 text-left text-white">
                          {Array.from({ length: columns }, (_, i) => (
                            <th key={i} className="min-w-40 px-3 py-2">
                              <span className="block text-xs font-normal text-evergreen-100">{hasHeader ? (rows[0]?.[i] || `Column ${i + 1}`) : `Column ${i + 1}`}</span>
                              <Select aria-label={`Map column ${i + 1}`} value={mapping[i] ?? "ignore"} onChange={(e) => setMapping((m) => m.map((v, idx) => (idx === i ? (e.target.value as StudentImportField) : v)))} className="mt-1 text-ink">
                                {STUDENT_IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                              </Select>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 5).map((r, i) => (
                          <tr key={i} className="border-t border-evergreen-900/10">
                            {Array.from({ length: columns }, (_, c) => <td key={c} className="px-3 py-2 text-ink-soft">{r[c] ?? ""}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => reset()}>Start over</Button>
                    <Button type="button" variant="gold" onClick={() => void buildPreview()} disabled={checkingIdentities}>{checkingIdentities ? "Checking duplicates…" : "Continue to preview →"}</Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Default class (rows without a class)" hint="Only active classes of your school.">
              <Select value={defaultClassId} onChange={(e) => setDefaultClassId(e.target.value)}>
                <option value="">None — class column required</option>
                {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Existing students (same reference/email)">
              <Select value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value as "skip" | "update")}>
                <option value="skip">Skip duplicates (keep current record)</option>
                <option value="update">Update existing record from file</option>
              </Select>
            </Field>
            <Field label="Show rows">
              <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All rows</option><option value="invalid">Invalid only</option>
                <option value="duplicate">Duplicates only</option><option value="valid">Valid only</option>
              </Select>
            </Field>
          </div>
          <p className="text-sm text-ink">
            <strong>{summary.total}</strong> record(s): <span className="text-evergreen-800">{summary.ready} ready</span>
            {summary.updates > 0 && <>, <span className="text-evergreen-800">{summary.updates} to update</span></>}
            {summary.invalid > 0 && <>, <span className="text-red-700">{summary.invalid} invalid</span></>}
            {summary.duplicates > 0 && <>, <span className="text-amber-800">{summary.duplicates} duplicates</span></>}
            {summary.excluded > 0 && <>, {summary.excluded} excluded</>}. Fix values directly in the table — nothing is imported yet.
          </p>
          <div className="max-h-[520px] overflow-auto rounded-xl border border-evergreen-900/15">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-evergreen-900 text-left text-white">
                <tr>{["Use", "Row", "Full name", "Reference", "Email", "Gender", "Date of birth", "Class", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {records.map((rec, i) => {
                  const v = validations[i];
                  const status = !rec.include ? "excluded" : v.errors.length ? "invalid" : v.duplicate ? "duplicate" : "valid";
                  if (filter !== "all" && filter !== status) return null;
                  return (
                    <tr key={`${rec.row}-${i}`} className={`border-t border-evergreen-900/10 align-top ${status === "invalid" ? "bg-red-50/70" : status === "duplicate" ? "bg-amber-50/70" : ""}`}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`Include row ${rec.row}`} checked={rec.include} onChange={(e) => updateRecord(i, { include: e.target.checked })} /></td>
                      <td className="px-3 py-2 text-ink-soft">{rec.row}</td>
                      <td className="min-w-44 px-3 py-2"><Input aria-label="Full name" value={rec.full_name} onChange={(e) => updateRecord(i, { full_name: e.target.value })} /></td>
                      <td className="min-w-28 px-3 py-2"><Input aria-label="Student reference" value={rec.student_ref} onChange={(e) => updateRecord(i, { student_ref: e.target.value })} /></td>
                      <td className="min-w-44 px-3 py-2"><Input aria-label="Email" value={rec.email} onChange={(e) => updateRecord(i, { email: e.target.value })} /></td>
                      <td className="min-w-24 px-3 py-2"><Input aria-label="Gender" value={rec.gender} onChange={(e) => updateRecord(i, { gender: e.target.value })} /></td>
                      <td className="min-w-32 px-3 py-2"><Input aria-label="Date of birth" value={rec.date_of_birth} onChange={(e) => updateRecord(i, { date_of_birth: e.target.value })} placeholder="YYYY-MM-DD" /></td>
                      <td className="min-w-40 px-3 py-2">
                        <Select aria-label="Class" value={v.cls?.id ?? ""} onChange={(e) => {
                          const cls = activeClasses.find((c) => c.id === e.target.value);
                          updateRecord(i, { class_id: e.target.value, class_name: cls?.name ?? "" });
                        }}>
                          <option value="">{rec.class_name ? `Unknown: ${rec.class_name}` : "— select —"}</option>
                          {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </td>
                      <td className="min-w-52 px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status === "valid" ? "bg-evergreen-100 text-evergreen-900" : status === "invalid" ? "bg-red-100 text-red-800" : status === "duplicate" ? "bg-amber-100 text-amber-900" : "bg-cream text-ink-soft"}`}>{status}</span>
                        {v.errors.map((e) => <p key={e} className="mt-1 text-xs text-red-700">{e}</p>)}
                        {v.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-800">{w}</p>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>← Back to mapping</Button>
            <Button type="button" variant="gold" onClick={() => setStep(4)} disabled={summary.ready + summary.updates === 0}>Review confirmation →</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-evergreen-900/15 bg-paper p-5 text-sm leading-relaxed text-ink">
            <p className="font-display text-base font-semibold text-evergreen-950">Confirm student import</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>{summary.ready}</strong> new student(s) will be registered and enrolled.</li>
              {summary.updates > 0 && <li><strong>{summary.updates}</strong> existing student(s) will be updated from the file.</li>}
              <li><strong>{summary.duplicates}</strong> duplicate(s) will be skipped{duplicateMode === "skip" ? " (existing records kept)" : " (in-file duplicates)"}.</li>
              <li><strong>{summary.invalid}</strong> invalid row(s) will NOT be imported — they stay in the downloadable report for correction.</li>
              <li><strong>{summary.excluded}</strong> row(s) you excluded will be ignored.</li>
              <li>Students are enrolled from their class column/selection{defaultClass ? `, or the default class “${defaultClass.name}”` : ""}.</li>
              <li>The import is logged; submitting the exact same file again will be blocked as a duplicate. This cannot be undone in one click — students can be archived individually afterwards.</li>
            </ul>
            <label className="mt-4 flex items-start gap-2 font-medium">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I have reviewed the preview and count summary, and I confirm importing into this school.
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>← Back to preview</Button>
            <Button type="button" variant="gold" disabled={!confirmed || importing} onClick={() => void runImport()}>
              {importing ? "Importing…" : `Import ${summary.ready + summary.updates} student(s)`}
            </Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          {result?.ok ? (
            <div className="rounded-xl bg-evergreen-50 px-5 py-4 text-sm text-evergreen-950">
              <p className="font-display text-base font-semibold">Import complete</p>
              <p className="mt-1">{result.imported} new student(s) registered · {result.updated} updated · {result.skipped} skipped · {result.failed} failed (of {result.total}).</p>
            </div>
          ) : result?.duplicateFile ? (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{result.error}</p>
          ) : (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{result?.error ?? error ?? "The import did not complete."}</p>
          )}
          {(result?.report ?? []).some((r) => r.status === "failed" || r.status === "duplicate") && (
            <div className="max-h-72 overflow-auto rounded-xl border border-evergreen-900/15">
              <table className="min-w-full text-sm">
                <thead className="bg-cream text-left"><tr>{["Row", "Student", "Status", "Details"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {(result?.report ?? []).filter((r) => ["failed", "duplicate", "skipped"].includes(r.status)).map((r) => (
                    <tr key={r.row} className="border-t border-evergreen-900/10">
                      <td className="px-3 py-2">{r.row}</td><td className="px-3 py-2">{r.name || "—"}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                      <td className="px-3 py-2 text-ink-soft">{[...r.errors, ...r.warnings].join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={downloadReport}>Download full import report (CSV)</Button>
            <Button type="button" variant="gold" onClick={() => reset()}>Import another file</Button>
          </div>
        </div>
      )}
    </div>
  );
}
