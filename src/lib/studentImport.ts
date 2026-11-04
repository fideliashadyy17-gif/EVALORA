/**
 * Student-import data model: column mapping, normalization and
 * validation shared by the browser wizard (preview) and the server
 * import API (authoritative re-validation). Nothing here invents
 * missing student data — invalid rows are reported, never guessed.
 */

export const STUDENT_IMPORT_FIELDS = [
  { key: "full_name", label: "Full name *" },
  { key: "student_ref", label: "Student ID / reference" },
  { key: "email", label: "Email" },
  { key: "gender", label: "Gender" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "phone", label: "Phone" },
  { key: "guardian_name", label: "Guardian / parent name" },
  { key: "guardian_contact", label: "Guardian contact" },
  { key: "class_name", label: "Class" },
  { key: "academic_year", label: "Academic year" },
  { key: "ignore", label: "— Ignore column —" },
] as const;

export type StudentImportField = (typeof STUDENT_IMPORT_FIELDS)[number]["key"];

const HEADER_SYNONYMS: Record<string, StudentImportField> = {
  fullname: "full_name", name: "full_name", studentname: "full_name", pupilname: "full_name",
  nom: "full_name", nomcomplet: "full_name", eleve: "full_name", nomdeleve: "full_name", nometprenoms: "full_name", noms: "full_name", student: "full_name", pupil: "full_name",
  studentid: "student_ref", studentref: "student_ref", reference: "student_ref", ref: "student_ref",
  admissionnumber: "student_ref", admissionno: "student_ref", matricule: "student_ref", id: "student_ref",
  email: "email", emailaddress: "email", mail: "email", courriel: "email",
  gender: "gender", sex: "gender", sexe: "gender",
  dateofbirth: "date_of_birth", dob: "date_of_birth", birthdate: "date_of_birth", datenaissance: "date_of_birth", datedenaissance: "date_of_birth", naissance: "date_of_birth",
  phone: "phone", phonenumber: "phone", telephone: "phone", mobile: "phone", tel: "phone",
  guardianname: "guardian_name", parentname: "guardian_name", guardian: "guardian_name", parent: "guardian_name",
  guardiancontact: "guardian_contact", guardianphone: "guardian_contact", parentphone: "guardian_contact",
  parentcontact: "guardian_contact", contact: "guardian_contact",
  class: "class_name", classname: "class_name", classe: "class_name", grade: "class_name",
  level: "class_name", form: "class_name", section: "class_name",
  academicyear: "academic_year", year: "academic_year", session: "academic_year", annee: "academic_year", anneescolaire: "academic_year",
};

export function normalizeHeader(header: string): string {
  return header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function guessFieldForHeader(header: string): StudentImportField {
  return HEADER_SYNONYMS[normalizeHeader(header)] ?? "ignore";
}

/** Does this row look like a header row (≥2 recognizable headings)? */
export function looksLikeHeader(row: string[]): boolean {
  const known = row.filter((c) => guessFieldForHeader(c) !== "ignore").length;
  return known >= 2;
}

export interface StudentImportRecord {
  row: number;
  include: boolean;
  full_name: string;
  student_ref: string;
  email: string;
  gender: string;
  date_of_birth: string;
  phone: string;
  guardian_name: string;
  guardian_contact: string;
  class_name: string;
  class_id: string;
  academic_year: string;
  source: string[];
}

export function rowsToRecords(rows: string[][], mapping: StudentImportField[], hasHeader: boolean): StudentImportRecord[] {
  const start = hasHeader ? 1 : 0;
  return rows.slice(start).map((cells, i) => {
    const rec: StudentImportRecord = {
      row: start + i + 1, include: true, full_name: "", student_ref: "", email: "", gender: "",
      date_of_birth: "", phone: "", guardian_name: "", guardian_contact: "", class_name: "",
      class_id: "", academic_year: "", source: cells,
    };
    mapping.forEach((field, idx) => {
      if (field === "ignore") return;
      const value = (cells[idx] ?? "").trim();
      if (value && !rec[field]) rec[field] = value;
    });
    return rec;
  }).filter((r) => r.source.some((c) => c.trim() !== ""));
}

export function normalizeGender(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (["m", "male", "boy", "masculin", "garcon", "garçon", "homme"].includes(v)) return "male";
  if (["f", "female", "girl", "feminin", "féminin", "fille", "femme"].includes(v)) return "female";
  if (["other", "autre", "non-binary", "nonbinary"].includes(v)) return "other";
  return raw.trim().slice(0, 20);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Normalize common date spellings to YYYY-MM-DD. Ambiguous D/M vs M/D:
 *  day-first is assumed unless the second part cannot be a month. */
export function normalizeDateOfBirth(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12 && b <= 12) return validDate(y, b, a); // D/M
    if (b > 12 && a <= 12) return validDate(y, a, b); // M/D
    return validDate(y, b, a); // assume D/M (international)
  }
  m = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && MONTHS[m[2]] || (m && MONTHS[m[2].slice(0, 3)])) {
    return validDate(+m[3], MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 3)], +m[1]);
  }
  m = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && (MONTHS[m[1]] ?? MONTHS[m[1].slice(0, 3)])) {
    return validDate(+m[3], MONTHS[m[1]] ?? MONTHS[m[1].slice(0, 3)], +m[2]);
  }
  return null;
}

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export interface ImportClassRef {
  id: string;
  name: string;
  code?: string | null;
  academic_year_id: string | null;
  status?: string;
}

export function resolveClass(rec: Pick<StudentImportRecord, "class_id" | "class_name">, classes: ImportClassRef[]): ImportClassRef | null {
  if (rec.class_id) return classes.find((c) => c.id === rec.class_id) ?? null;
  const wanted = rec.class_name.trim().toLowerCase();
  if (!wanted) return null;
  return classes.find((c) => c.name.trim().toLowerCase() === wanted || (c.code ?? "").trim().toLowerCase() === wanted) ?? null;
}

export interface RecordValidation {
  errors: string[];
  warnings: string[];
  duplicate?: "existing" | "in_file";
}

export interface ExistingIdentities {
  refs: Set<string>;
  emails: Set<string>;
  nameDob: Set<string>;
}

export const identityKey = (name: string, dobIso: string | null) => `${name.trim().toLowerCase()}|${dobIso ?? ""}`;

export function validateImportRecord(
  rec: StudentImportRecord,
  classes: ImportClassRef[],
  existing: ExistingIdentities,
  seenInFile: ExistingIdentities,
  requireClass: boolean,
): RecordValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rec.full_name.trim()) errors.push("Missing full name.");
  const email = rec.email.trim().toLowerCase();
  if (email && !isValidEmail(email)) errors.push(`Invalid email “${rec.email}”.`);
  const dobIso = rec.date_of_birth ? normalizeDateOfBirth(rec.date_of_birth) : null;
  if (rec.date_of_birth && !dobIso) errors.push(`Unrecognized date of birth “${rec.date_of_birth}” (use YYYY-MM-DD).`);
  const cls = resolveClass(rec, classes);
  if ((rec.class_id || rec.class_name.trim()) && !cls) errors.push(`Unknown class “${rec.class_name || rec.class_id}” for this school.`);
  if (requireClass && !cls) errors.push("No class selected — choose a class or a default class for the import.");
  if (rec.phone && rec.phone.replace(/\D/g, "").length < 6) warnings.push("Phone number looks too short.");
  if (!email && !rec.student_ref.trim()) warnings.push("No email or student reference — duplicate detection is limited.");

  let duplicate: RecordValidation["duplicate"];
  const ref = rec.student_ref.trim().toLowerCase();
  const key = identityKey(rec.full_name, dobIso);
  if ((ref && seenInFile.refs.has(ref)) || (email && seenInFile.emails.has(email)) || (rec.full_name && seenInFile.nameDob.has(key) && (ref || email || dobIso))) {
    duplicate = "in_file";
    warnings.push("Duplicate of an earlier row in this file.");
  } else if ((ref && existing.refs.has(ref)) || (email && existing.emails.has(email))) {
    duplicate = "existing";
    warnings.push("A student with this reference/email already exists in this school.");
  }
  if (ref) seenInFile.refs.add(ref);
  if (email) seenInFile.emails.add(email);
  if (rec.full_name) seenInFile.nameDob.add(key);
  return { errors, warnings, duplicate };
}

/** SHA-256 hex digest of a file (browser + modern Node). */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
