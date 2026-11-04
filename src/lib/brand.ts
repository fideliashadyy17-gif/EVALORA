/**
 * EVALORA — centralized brand configuration.
 * Change brand values HERE only; every surface reads from this file.
 */
export const BRAND = {
  name: "EVALORA",
  tagline: "Interactive quizzes, examinations & online proctoring",
  description:
    "EVALORA is the integrated platform for interactive quizzes, academic assessments, examinations and live video proctoring — built for schools, universities, training centers and examination organizations.",
  supportEmail: "support@evalora.app",
  logo: {
    icon: "/brand/evalora-icon.svg",
    horizontalLight: "/brand/evalora-logo-light.svg",
    horizontalDark: "/brand/evalora-logo-dark.svg",
    stacked: "/brand/evalora-logo.svg",
    favicon: "/brand/favicon.svg",
  },
  colors: {
    primary: "#0a5c36",
    primaryDeep: "#06351f",
    accent: "#c9a227",
    cream: "#faf7f0",
    ink: "#16241c",
  },
} as const;

export const ORG_ROLES = [
  { value: "owner", label: "Organization Owner" },
  { value: "admin", label: "Administrator" },
  { value: "teacher", label: "Teacher / Quiz Creator" },
  { value: "organizer", label: "Quiz Organizer" },
  { value: "supervisor", label: "Supervisor / Proctor" },
  { value: "corrector", label: "Corrector / Examiner" },
  { value: "participant", label: "Participant" },
  { value: "candidate", label: "Examination Candidate" },
  { value: "parent", label: "Parent / Guardian" },
] as const;

export type OrgRole = (typeof ORG_ROLES)[number]["value"];

export const QUESTION_TYPES = [
  { value: "single_choice", label: "Multiple choice (single answer)", auto: true },
  { value: "multiple_select", label: "Multiple select", auto: true },
  { value: "true_false", label: "True / False", auto: true },
  { value: "short_answer", label: "Short answer", auto: true },
  { value: "numeric", label: "Numerical answer", auto: true },
  { value: "ordering", label: "Ordering", auto: true },
  { value: "matching", label: "Matching", auto: true },
  { value: "poll", label: "Poll (no correct answer)", auto: false },
  { value: "open_ended", label: "Open-ended (manually marked)", auto: false },
  { value: "slide", label: "Presentation slide", auto: false },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]["value"];
