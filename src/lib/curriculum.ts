/**
 * Curriculum & class-ladder reference data.
 *
 * EVALORA stays school-agnostic: organizations keep their own classes,
 * academic years and curriculum programmes in the database. This module
 * provides the canonical level bands, the default curriculum pairing per
 * band, and the Oak International School class ladder used when seeding
 * that organization.
 *
 * Source references are real, publicly available curriculum documents.
 * They guide topic selection; generated questions are original and are
 * NOT copies of IB, College Board, Kangaroo or ministry material.
 */

export type LevelBand = "early_years_primary" | "myp_secondary" | "advanced_secondary" | "other";

export const LEVEL_BANDS: { key: LevelBand; label: string }[] = [
  { key: "early_years_primary", label: "Early Years & Primary" },
  { key: "myp_secondary", label: "Secondary — IB MYP" },
  { key: "advanced_secondary", label: "Advanced Secondary — AP" },
  { key: "other", label: "Other" },
];

export type CurriculumKey = "english" | "beninese" | "myp" | "ap";

export interface CurriculumSource {
  reference: string;
  url: string;
  note: string;
}

/** Verified public curriculum references used to guide generation. */
export const CURRICULUM_SOURCES: Record<CurriculumKey, CurriculumSource> = {
  english: {
    reference: "International primary mathematics scope & sequence (English-medium); problem style informed by Association Kangourou Sans Frontières age bands",
    url: "https://www.aksf.org/publications.xhtml",
    note: "English Programme topics follow widely used international primary outcomes (number, operations, geometry, measurement, patterns). Competition style (visual, non-routine, no-calculator) follows Kangaroo age-band conventions.",
  },
  beninese: {
    reference: "Ministère des Enseignements Maternel et Primaire (Bénin) — DPPD 2022–2024 (sector context, not a mathematics syllabus)",
    url: "https://budgetbenin.bj/wp-content/uploads/2021/06/DPPD-INITIAL-MEMP-2022-2024.pdf",
    note: "The linked budget document is sector context, not an official mathematics syllabus. Generated Beninese-programme items follow the francophone Bénin syllabus conventions (CI→CM2, then collège/lycée) and MUST be confirmed against the school's official programme by Oak teachers before high-stakes use.",
  },
  myp: {
    reference: "International Baccalaureate — Middle Years Programme Mathematics Subject Brief (from 2020, first assessment 2022)",
    url: "https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-mathematics-en.pdf",
    note: "MYP items are designed around the four MYP mathematics objectives (Knowing & Understanding, Investigating Patterns, Communicating, Applying in Real-Life Contexts) and the framework branches: number, algebra, geometry & trigonometry, statistics & probability. EVALORA is not affiliated with the IB; alignment is indicative, not an official IB endorsement.",
  },
  ap: {
    reference: "College Board — AP Calculus AB & BC Course and Exam Description (Fall 2020); AP Statistics Course and Exam Description",
    url: "https://apcentral.collegeboard.org/media/pdf/ap-calculus-ab-and-bc-course-and-exam-description.pdf",
    note: "AP items follow the published AP course frameworks (limits, derivatives, integrals, data analysis). The grade→AP-course mapping is a school configuration choice flagged for administrator review; it is not an official College Board equivalence.",
  },
};

/** Default dual-curriculum pairing for each level band. */
export function defaultCurriculaForBand(band: LevelBand | string | null | undefined): CurriculumKey[] {
  switch (band) {
    case "early_years_primary":
      return ["english", "beninese"];
    case "myp_secondary":
      return ["myp", "beninese"];
    case "advanced_secondary":
      return ["ap", "beninese"];
    default:
      return ["english", "beninese"];
  }
}

export interface ClassLadderEntry {
  /** Display name, e.g. "Grade 6 / CM2 — MYP 1" */
  name: string;
  /** Short stable code, unique per organization + academic year */
  code: string;
  band: LevelBand;
  gradeOrder: number;
  /** curriculum key → course label shown on questions */
  courses: Partial<Record<CurriculumKey, string>>;
  /** AP mappings are a school decision: always flagged for review */
  apNeedsReview?: boolean;
}

/**
 * Oak International School ladder, KG → Grade 13.
 * Beninese course labels use the corresponding francophone levels;
 * they are configuration, not an official equivalence table.
 */
export const OAK_CLASS_LADDER: ClassLadderEntry[] = [
  { name: "KG", code: "KG", band: "early_years_primary", gradeOrder: 0, courses: { english: "KG English Programme", beninese: "Maternelle — Programme Béninois" } },
  { name: "CI", code: "CI", band: "early_years_primary", gradeOrder: 1, courses: { english: "CI English Programme", beninese: "CI — Programme Béninois" } },
  { name: "CP", code: "CP", band: "early_years_primary", gradeOrder: 2, courses: { english: "CP English Programme", beninese: "CP — Programme Béninois" } },
  { name: "CE1", code: "CE1", band: "early_years_primary", gradeOrder: 3, courses: { english: "CE1 English Programme", beninese: "CE1 — Programme Béninois" } },
  { name: "CE2", code: "CE2", band: "early_years_primary", gradeOrder: 4, courses: { english: "CE2 English Programme", beninese: "CE2 — Programme Béninois" } },
  { name: "CM1", code: "CM1", band: "early_years_primary", gradeOrder: 5, courses: { english: "CM1 English Programme", beninese: "CM1 — Programme Béninois" } },
  { name: "Grade 6 / CM2 — MYP 1", code: "G6-MYP1", band: "myp_secondary", gradeOrder: 6, courses: { myp: "MYP 1 Mathematics", beninese: "CM2 / 6ᵉ — Programme Béninois" } },
  { name: "Grade 7 — MYP 2", code: "G7-MYP2", band: "myp_secondary", gradeOrder: 7, courses: { myp: "MYP 2 Mathematics", beninese: "5ᵉ — Programme Béninois" } },
  { name: "Grade 8 — MYP 3", code: "G8-MYP3", band: "myp_secondary", gradeOrder: 8, courses: { myp: "MYP 3 Mathematics", beninese: "4ᵉ — Programme Béninois" } },
  { name: "Grade 9 — MYP 4", code: "G9-MYP4", band: "myp_secondary", gradeOrder: 9, courses: { myp: "MYP 4 Mathematics", beninese: "3ᵉ — Programme Béninois" } },
  { name: "Grade 10 — MYP 5", code: "G10-MYP5", band: "myp_secondary", gradeOrder: 10, courses: { myp: "MYP 5 Mathematics", beninese: "2ⁿᵈᵉ — Programme Béninois" } },
  { name: "Grade 11", code: "G11", band: "advanced_secondary", gradeOrder: 11, courses: { ap: "AP Statistics", beninese: "1ʳᵉ — Programme Béninois" }, apNeedsReview: true },
  { name: "Grade 12", code: "G12", band: "advanced_secondary", gradeOrder: 12, courses: { ap: "AP Calculus AB", beninese: "Terminale — Programme Béninois" }, apNeedsReview: true },
  { name: "Grade 13", code: "G13", band: "advanced_secondary", gradeOrder: 13, courses: { ap: "AP Calculus BC", beninese: "Terminale+ — Programme Béninois" }, apNeedsReview: true },
];

export const GENERATION_COUNTS = [20, 25, 30, 35, 40] as const;

export type CompetitionStage = "standard" | "elimination" | "semi_final" | "grand_final";

export const STAGE_MAX_QUESTIONS: Record<string, number> = {
  elimination: 20,
  semi_final: 25,
  grand_final: 30,
};
