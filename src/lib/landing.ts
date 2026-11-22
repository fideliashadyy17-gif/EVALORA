/**
 * EVALORA — public landing page content model.
 *
 * Every claim below was traced to running code in this repository (routes,
 * server actions, library modules, migrations) and cross-checked against the
 * production Supabase schema (`nqxqisjtbfsratgztmch`) before it was allowed
 * into the marketing page. The `status` field is the honest state of each
 * capability, and `onLanding` records whether it is safe to advertise.
 *
 * RULES THIS FILE ENFORCES
 *  - `status: "live"`   → implemented end-to-end and reachable in the product.
 *  - `status: "conditional"` → real, but gated (plan entitlement, optional
 *    per-examination setting, or a platform feature flag).
 *  - `status: "not-shipped"` → exists only as a stub, a schema, or an inert
 *    provider boundary. NEVER advertised on the public page.
 *
 * Deliberately NOT advertised (verified incomplete or inert):
 *  - AI question generation / AI Studio (template generation is not an LLM flow)
 *  - AI-assisted marking (provider boundary only; no model credential)
 *  - Proctoring session recording / egress (no storage target configured)
 *  - Native OS lockdown for macOS / Linux / iPadOS / Chromebook (Windows only)
 *  - Paper exam scanning, OCR marking, printable scanning pipeline
 *  - Google/Microsoft SSO (inert until configured), Classroom, Microsoft 365,
 *    Canvas, SIS integrations, public API/webhooks
 *  - Native mobile apps
 */

export type FeatureStatus = "live" | "conditional" | "not-shipped";

export interface FeatureRecord {
  /** The name the product itself uses in navigation. */
  name: string;
  /** One sentence: what it actually does. */
  purpose: string;
  /** Verified roles that can use it. */
  users: string[];
  status: FeatureStatus;
  /** Where the implementation was verified. */
  evidence: string;
  /** Whether this appears on the public landing page. */
  onLanding: boolean;
}

export const FEATURE_INVENTORY: FeatureRecord[] = [
  {
    name: "Question Bank",
    purpose:
      "Author and organise questions with mathematics, media, categories, difficulty, points and explanations; reuse them across quizzes and examinations.",
    users: ["Super Admin", "Owner", "Admin", "Teacher"],
    status: "live",
    evidence: "src/app/dashboard/questions, src/app/admin/questions, questions table (2,492 rows in production)",
    onLanding: true,
  },
  {
    name: "Question Studio (11 types)",
    purpose:
      "Single choice, multiple select, true/false, short answer, numerical, ordering, matching, poll, constructed response, multi-part papers and presentation slides.",
    users: ["Super Admin", "Owner", "Admin", "Teacher"],
    status: "live",
    evidence: "src/lib/brand.ts QUESTION_TYPES, src/lib/scoring.ts, question types present in production",
    onLanding: true,
  },
  {
    name: "Visual mathematics editor",
    purpose:
      "MathLive visual input with a 20-category mathematical keyboard, KaTeX rendering and LaTeX validation for teachers and candidates.",
    users: ["Teacher", "Candidate", "Student"],
    status: "live",
    evidence: "src/components/editor/MathField.tsx, mathKeyboard.ts, src/lib/mathRender.ts",
    onLanding: true,
  },
  {
    name: "Structured response workspaces",
    purpose:
      "Candidates compose answers with writing, mathematics, tables, data tables, science/units, graphs, geometry, statistics, Venn, probability trees and stem-and-leaf.",
    users: ["Candidate", "Student"],
    status: "conditional",
    evidence: "src/lib/responseTools.ts (11 tools), graphSpec/geometrySpec/statsSpec/vennSpec, gated by premium_exam_experience",
    onLanding: true,
  },
  {
    name: "Reviewed question imports",
    purpose:
      "CSV question imports land in a pending-review state with a row-by-row error report; nothing publishes itself.",
    users: ["Owner", "Admin", "Teacher"],
    status: "live",
    evidence: "dashboard/questions import actions, import_batches table",
    onLanding: true,
  },
  {
    name: "Live interactive quizzes",
    purpose:
      "Synchronised or self-paced sessions with join codes, QR entry, host control, live leaderboards and a projector view.",
    users: ["Owner", "Admin", "Teacher", "Organizer", "Participant"],
    status: "live",
    evidence: "src/app/play/[code], src/app/dashboard/sessions/[id]/host, /api/live/*, live seeds in production",
    onLanding: true,
  },
  {
    name: "Projector / public live screen",
    purpose:
      "A token-protected read-only screen showing only what the organiser approves: question, countdown, progress and rankings.",
    users: ["Organizer", "Audience"],
    status: "live",
    evidence: "src/app/live/[liveId]/screen, src/lib/liveDisplayToken.ts",
    onLanding: true,
  },
  {
    name: "Live competitions",
    purpose:
      "Championship-style competitions with event phases, question pools, class-scoped rankings, qualification review and a live operations room.",
    users: ["Super Admin", "Owner", "Admin", "Organizer"],
    status: "conditional",
    evidence: "src/app/admin/competitions/*, src/lib/qualification.ts, 29 competitions in production",
    onLanding: true,
  },
  {
    name: "Examination engine",
    purpose:
      "Formal exams assembled from the bank with candidate registers, personal access codes, per-candidate randomised order, autosave, server deadlines and controlled result publication.",
    users: ["Super Admin", "Owner", "Admin", "Teacher", "Candidate"],
    status: "live",
    evidence: "src/app/dashboard/exams, src/app/take-exam/[attemptId], src/lib/examDeadline.ts, examSaveQueue.ts",
    onLanding: true,
  },
  {
    name: "Candidate admission & share links",
    purpose:
      "Personal candidate codes, invitation links, expiring exam links and access-code management with retake requests.",
    users: ["Admin", "Candidate", "Super Admin"],
    status: "live",
    evidence: "src/lib/exam-access.ts, examLink.ts, src/app/admin/examinations/{codes,links,invitations,retakes}",
    onLanding: true,
  },
  {
    name: "Live exam monitoring",
    purpose:
      "A supervisor console showing per-candidate progress, connection state, pending saves, pauses and private messages during a live paper.",
    users: ["Supervisor", "Proctor", "Admin", "Teacher"],
    status: "live",
    evidence: "src/app/dashboard/exams/[id]/monitor, src/lib/examMonitoring.ts, exam_presence view",
    onLanding: true,
  },
  {
    name: "Video proctoring (LiveKit)",
    purpose:
      "Real LiveKit rooms with server-minted tokens; candidates publish camera and optional screen while supervisors monitor a paginated grid and log incidents for human review.",
    users: ["Supervisor", "Proctor", "Candidate"],
    status: "conditional",
    evidence: "src/lib/proctoring.ts, /api/livekit/token, src/app/dashboard/proctoring, proctoring_incident_reviews",
    onLanding: true,
  },
  {
    name: "Proctoring evidence ledger",
    purpose:
      "Every observation and reviewer decision is kept with who decided, what and when; retention policies are configurable.",
    users: ["Supervisor", "Admin", "Super Admin"],
    status: "live",
    evidence: "proctoring_incident_reviews, proctoring_retention_policies, src/app/admin/proctoring/retention",
    onLanding: true,
  },
  {
    name: "Optional Secure Exam Browser (Lockdown)",
    purpose:
      "A per-examination policy that requires the EVALORA Secure Exam Browser on Windows 10/11: single display, clipboard isolation and a signed challenge admission. Off by default; standard browsers stay available when disabled.",
    users: ["Admin", "Candidate"],
    status: "conditional",
    evidence: "src/lib/lockdown.ts, desktop/ (Electron 1.1.0), /api/exam/lockdown/*, src/app/download/secure-browser",
    onLanding: true,
  },
  {
    name: "Structured auto-marking",
    purpose:
      "Objective items mark themselves on the server, including numeric answer normalisation and multi-part breakdowns; written answers route to correctors.",
    users: ["Admin", "Teacher", "Corrector", "Candidate"],
    status: "live",
    evidence: "src/lib/scoring.ts, assessParts.ts, grading.ts, submission/state handlers",
    onLanding: true,
  },
  {
    name: "Manual marking, rubrics & moderation",
    purpose:
      "A corrector queue with point limits, rubrics and criteria, grading assignments, moderation and an immutable grade-change log.",
    users: ["Corrector", "Teacher", "Admin"],
    status: "live",
    evidence: "src/app/dashboard/rubrics, admin/examinations/marking, grading_rubrics, grade_change_log",
    onLanding: true,
  },
  {
    name: "Results publication & scripts",
    purpose:
      "Publish results deliberately: pass/fail against the pass mark, per-question breakdown, worked solutions, candidate result links and a printable script view.",
    users: ["Admin", "Teacher", "Candidate", "Student"],
    status: "live",
    evidence: "src/lib/examResults.ts, examScript.ts, /exam-result/[token], admin/examinations/{results,reports}",
    onLanding: true,
  },
  {
    name: "Reports & analytics",
    purpose:
      "Session and exam reports, class performance, question-level statistics and CSV/Excel/PDF exports.",
    users: ["Owner", "Admin", "Teacher", "Supervisor"],
    status: "conditional",
    evidence: "src/app/dashboard/reports, src/lib/mypExcel.ts, mypPdf.ts, advanced_reports entitlement",
    onLanding: true,
  },
  {
    name: "MYP criterion results (1–7)",
    purpose:
      "Map question marks tagged A–D onto criterion achievement levels and an overall 1–7 grade, with per-subject boundaries and exports.",
    users: ["Admin", "Teacher", "Corrector"],
    status: "conditional",
    evidence: "src/lib/myp.ts (47k), myp_results tables, /dashboard/myp-results",
    onLanding: true,
  },
  {
    name: "Class & academic structure",
    purpose:
      "Classes, subjects, curricula, academic years, departments and education levels, with student enrolment per class.",
    users: ["Owner", "Admin", "Teacher"],
    status: "live",
    evidence: "src/app/dashboard/academics, classes/subjects/class_subjects/enrollments tables",
    onLanding: true,
  },
  {
    name: "Student records & bulk import",
    purpose:
      "Individual and bulk registration from CSV, XLSX, PDF, DOCX or TXT, with extraction review, access-code management and export.",
    users: ["Owner", "Admin", "Super Admin"],
    status: "live",
    evidence: "src/components/StudentImportWizard.tsx, src/lib/extractServer.ts, /api/students/import/*",
    onLanding: true,
  },
  {
    name: "Staff, roles & permissions",
    purpose:
      "Ten organisation roles (owner, administrator, teacher, organiser, supervisor, corrector, participant, candidate, parent, student), invitations and server-enforced permissions.",
    users: ["Owner", "Admin", "Super Admin"],
    status: "live",
    evidence: "src/lib/auth.ts, navAccess.ts, capability-rules.ts, organization_members",
    onLanding: true,
  },
  {
    name: "School portal",
    purpose:
      "Each organisation gets a branded public portal (subdomain or path) with its own sign-in and identity.",
    users: ["Owner", "Admin", "Student"],
    status: "live",
    evidence: "src/app/portal/[slug], src/lib/tenant.ts, organizations.portal_enabled",
    onLanding: true,
  },
  {
    name: "Subscriptions & manual payments",
    purpose:
      "Free, Premium and Institution plans with live limits, 14-day trials and a manual payment flow that activates only after Super Admin approval.",
    users: ["Owner", "Admin", "Super Admin"],
    status: "live",
    evidence: "plans table (3 active rows), payment_requests, src/app/dashboard/billing, admin/payments",
    onLanding: true,
  },
  {
    name: "Entitlements & platform feature flags",
    purpose:
      "Plan limits are resolved server-side; platform-wide switches can pause new live rooms, examinations or proctoring without stopping papers already running.",
    users: ["Super Admin"],
    status: "live",
    evidence: "src/lib/entitlements.ts, capability-rules.ts, admin/modules",
    onLanding: true,
  },
  {
    name: "Super Admin console",
    purpose:
      "Platform statistics, organisations, users and roles, plans, payments, revenue, support tickets, audit logs, notifications, feature flags and system health.",
    users: ["Super Admin"],
    status: "live",
    evidence: "src/app/admin (18.5k lines), AdminShell navigation, audit_logs",
    onLanding: true,
  },
  {
    name: "Notifications, support & audit",
    purpose:
      "In-app notification bell, support ticket desk and an append-only audit trail of privileged actions.",
    users: ["All signed-in roles", "Super Admin"],
    status: "live",
    evidence: "src/lib/notifications.ts, notifications table, support_tickets, audit_logs",
    onLanding: true,
  },
  {
    name: "Multi-tenant isolation",
    purpose:
      "Every table is organisation-scoped with row-level security; server actions re-check the verified role, never the UI.",
    users: ["Platform-wide"],
    status: "live",
    evidence: "supabase/migrations (RLS on all tables), src/lib/tenant.ts, auth.ts",
    onLanding: true,
  },
  {
    name: "Candidate workspace & results",
    purpose:
      "Students and candidates sign in to a dedicated workspace with their papers and published results; parents are routed to the same learner area.",
    users: ["Student", "Candidate", "Parent"],
    status: "live",
    evidence: "src/app/student, roleRouting.ts, /student/results/[attemptId]",
    onLanding: true,
  },
  // ── Verified but intentionally NOT on the landing page ────────────────
  {
    name: "AI question generation",
    purpose: "Template-based question generation exists; it is not a hosted LLM workflow.",
    users: ["Teacher"],
    status: "not-shipped",
    evidence: "docs/MASTER_REQUIREMENTS_MATRIX.md — NOT IMPLEMENTED",
    onLanding: false,
  },
  {
    name: "AI-assisted marking",
    purpose: "Provider boundary and proposals table exist; no model credential is configured.",
    users: ["Corrector"],
    status: "not-shipped",
    evidence: "src/lib/ai-marking.ts (describeAiMarking), ai_marking_proposals",
    onLanding: false,
  },
  {
    name: "Proctoring recording",
    purpose: "LiveKit egress needs an S3 target and a retention decision; recordings are not produced.",
    users: ["Supervisor"],
    status: "not-shipped",
    evidence: "docs/PHASE_REPORT.md — recording pending config",
    onLanding: false,
  },
  {
    name: "Native lockdown outside Windows",
    purpose: "Desktop app targets Windows 10/11; macOS, Linux and Chromebooks would need separate work.",
    users: ["Candidate"],
    status: "not-shipped",
    evidence: "desktop/README.md, src/lib/lockdown.ts",
    onLanding: false,
  },
  {
    name: "Paper scanning & OCR marking",
    purpose: "Printable papers exist; scanning and OCR marking do not.",
    users: ["Admin"],
    status: "not-shipped",
    evidence: "docs/MASTER_REQUIREMENTS_MATRIX.md §8 — scanning/OCR not implemented",
    onLanding: false,
  },
  {
    name: "SSO & SIS integrations",
    purpose: "Google SSO is inert until configured; Classroom, Microsoft 365, Canvas and SIS sync do not exist.",
    users: ["Admin"],
    status: "not-shipped",
    evidence: "src/lib/sso.ts, docs/MASTER_REQUIREMENTS_MATRIX.md §11.3",
    onLanding: false,
  },
];

/* ── Landing page copy blocks ──────────────────────────────────────────── */

export const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Author",
    line: "Question bank & studio",
    body:
      "Write questions with visual mathematics, media, tables and multi-part structure. Import a reviewed CSV when you already have a bank.",
  },
  {
    step: "02",
    title: "Assemble",
    line: "Quizzes, exams & competitions",
    body:
      "Build a live quiz, a formal examination or a multi-phase competition from the same verified questions — with your own timing, marks and rules.",
  },
  {
    step: "03",
    title: "Admit",
    line: "Codes, links & registers",
    body:
      "Share a six-character join code or QR for a live round; issue personal access codes and expiring links for a formal paper.",
  },
  {
    step: "04",
    title: "Supervise",
    line: "Server clock & live rooms",
    body:
      "The server owns the countdown, saves every answer and shows supervisors real progress — never what is on a candidate's screen.",
  },
  {
    step: "05",
    title: "Mark",
    line: "Auto-marking & correctors",
    body:
      "Objective items mark themselves; written answers route to correctors with rubrics, point limits and a grade-change ledger.",
  },
  {
    step: "06",
    title: "Publish",
    line: "Results, scripts & reports",
    body:
      "Publish when you decide. Candidates see marks, feedback and worked solutions; you export the evidence you need.",
  },
];

export const ROLE_WORKSPACES = [
  {
    id: "super-admin",
    label: "Super Administrators",
    short: "Platform owner",
    icon: "Building2",
    summary:
      "The platform's own control plane: every organisation, subscription, payment and feature switch in one console.",
    highlights: [
      "Global dashboard, platform statistics and recent operations",
      "Organisations & schools: create, suspend, grant subscriptions, manage portals",
      "Students and users across tenants: teachers, school administrators, roles & permissions",
      "Payments queue with signed proof review; subscriptions and plan editor with live limits",
      "Modules & feature flags, audit logs, system health, support tickets, revenue",
    ],
    evidence: "Verified in /admin (79 routes)",
  },
  {
    id: "school-admin",
    label: "School Administrators",
    short: "Institution owner",
    icon: "School",
    summary:
      "Run the institution end to end — people, academic structure, assessments and the money that funds it.",
    highlights: [
      "Students, bulk import from CSV/XLSX/PDF/DOCX, access codes and exports",
      "Teachers, staff & members with ten roles and server-enforced permissions",
      "Classes, subjects, curricula, academic years, departments and education levels",
      "Quizzes, examinations, competitions, rubrics, proctoring review and reports",
      "Branded school portal, billing & plan, organisation settings, notifications",
    ],
    evidence: "Verified in /dashboard (34 routes)",
  },
  {
    id: "teacher",
    label: "Teachers & Examiners",
    short: "Assessment author",
    icon: "PenLine",
    summary:
      "Build the paper, host the room, mark the answers and read the evidence afterwards.",
    highlights: [
      "Question bank with 11 types, KaTeX mathematics, media and explanations",
      "Assemble quizzes and examinations; duplicate, schedule and publish",
      "Host live rounds with admission control, pause, reveals and a podium",
      "Live monitor: progress, connection, pending saves and private messages",
      "Corrector queue with rubrics, moderation and grade history",
    ],
    evidence: "Verified in /dashboard + /play + /live",
  },
  {
    id: "candidate",
    label: "Students & Candidates",
    short: "Exam candidate",
    icon: "GraduationCap",
    summary:
      "One calm, distraction-free workspace for live rounds and formal papers — with recovery built in.",
    highlights: [
      "Join a quiz by code or QR with no account; sit a paper with a personal code",
      "Server-authoritative timer, autosave on every answer and resume after a drop",
      "Mathematics, graph, geometry, statistics and science answer workspaces",
      "Flag for review, navigator grid, connection and video-status feedback",
      "Published results with feedback, worked solutions and printable scripts",
    ],
    evidence: "Verified in /join, /take-exam, /student",
  },
];

export const CAPABILITY_GROUPS = [
  {
    key: "authoring",
    title: "Authoring & question bank",
    blurb: "The studio behind every paper.",
    items: [
      { name: "11 question types", detail: "Choice, multi-select, true/false, short answer, numeric, ordering, matching, poll, constructed response, multi-part, slide" },
      { name: "Visual mathematics", detail: "MathLive input, 20-category keyboard, KaTeX rendering and LaTeX validation" },
      { name: "Rich question content", detail: "Images, audio, video, tables, colours, alignment and explanations" },
      { name: "Categories & difficulty", detail: "Subjects, topics, tags, difficulty and points for every question" },
      { name: "Multi-part papers", detail: "Structured parts with their own marks, validated at assembly time" },
      { name: "Reviewed CSV imports", detail: "Row-by-row error report; nothing publishes itself" },
    ],
  },
  {
    key: "delivery",
    title: "Live delivery",
    blurb: "Rooms that run themselves, fairly.",
    items: [
      { name: "Join codes & QR", detail: "Six-character codes, QR entry — participants need no account" },
      { name: "Synchronised or self-paced", detail: "Host-released rounds or individual pace, both server-timed" },
      { name: "Host control screen", detail: "Admit, release, pause, reveal answers, rankings and final podium" },
      { name: "Projector screen", detail: "Token-protected read-only display for classrooms and halls" },
      { name: "Live leaderboards", detail: "Ranking computed on the server, animated on the big screen" },
      { name: "Session recovery", detail: "A dropped connection resumes from the last saved server state" },
    ],
  },
  {
    key: "examinations",
    title: "Examinations",
    blurb: "High-stakes papers, controlled end to end.",
    items: [
      { name: "Candidate registers", detail: "Individual or bulk registration with personal access codes" },
      { name: "Per-candidate randomisation", detail: "Question and option order derived server-side per candidate" },
      { name: "Server deadlines", detail: "Exact start/end windows, auto-submission — browser clocks are irrelevant" },
      { name: "Durable autosave", detail: "Queued saves, optimistic UI, explicit pending state and recovery" },
      { name: "Lockdown policy", detail: "Optional EVALORA Secure Exam Browser on Windows 10/11, per examination" },
      { name: "Retakes & access", detail: "Request and approve retakes; expiring links and code management" },
    ],
  },
  {
    key: "integrity",
    title: "Integrity & proctoring",
    blurb: "Evidence for humans, not automatic verdicts.",
    items: [
      { name: "Live video rooms", detail: "LiveKit tokens minted server-side; camera and optional screen share" },
      { name: "Supervisor grid", detail: "Paginated live view with per-candidate connection state" },
      { name: "Incident workflow", detail: "Open, investigating, confirmed or dismissed — never automated proof" },
      { name: "Live monitoring", detail: "Progress, current question, pending saves and private messages" },
      { name: "Connection events", detail: "Every join, drop and reconnect recorded with a timestamp" },
      { name: "Retention policies", detail: "Configurable retention with a reviewable run history" },
    ],
  },
  {
    key: "marking",
    title: "Marking & results",
    blurb: "From raw answer to a defensible mark.",
    items: [
      { name: "Structured auto-marking", detail: "Objective scoring, numeric normalisation and multi-part breakdowns" },
      { name: "Corrector queue", detail: "Written answers with paper-specific point limits" },
      { name: "Rubrics & moderation", detail: "Criteria with marks, grading assignments and moderation records" },
      { name: "Immutable grade ledger", detail: "Every change appended, attributed and never rewritten" },
      { name: "Controlled publication", detail: "Publish deliberately with pass marks and per-question breakdown" },
      { name: "Candidate result links", detail: "Tokenised result pages, worked solutions and printable scripts" },
    ],
  },
  {
    key: "institution",
    title: "Institution & operations",
    blurb: "Everything around the exam room.",
    items: [
      { name: "Students & classes", detail: "Records, enrolment, classes, subjects, curricula and academic years" },
      { name: "Staff & permissions", detail: "Ten roles, invitations, accounts and server-checked capabilities" },
      { name: "School portal", detail: "Branded public portal per organisation, on a subdomain or path" },
      { name: "Reports & exports", detail: "Session and exam reports, CSV, Excel and PDF" },
      { name: "MYP criterion results", detail: "A–D criteria mapped to achievement levels and a 1–7 grade" },
      { name: "Plans & entitlements", detail: "Live limits, trials, manual payment verification and feature flags" },
    ],
  },
] as const;

export const PROOF_PILLARS = [
  {
    icon: "Clock3",
    title: "The server owns the clock",
    body:
      "Deadlines are computed and enforced server-side. A modified browser clock, a paused tab or a replayed request gains nothing.",
    tag: "Server-authoritative timing",
  },
  {
    icon: "ShieldCheck",
    title: "Tenant isolation by default",
    body:
      "Row-level security on every table and a re-checked role on every server action. Hiding a menu item is never the boundary.",
    tag: "RLS + verified roles",
  },
  {
    icon: "RefreshCw",
    title: "Recovery is a feature",
    body:
      "Answers are queued, confirmed and recoverable. A candidate who loses connection continues from the last saved state.",
    tag: "Durable autosave",
  },
  {
    icon: "Fingerprint",
    title: "Integrity, human-reviewed",
    body:
      "Proctoring surfaces evidence. A named supervisor confirms or dismisses it, and the decision is recorded with a timestamp.",
    tag: "Human-in-the-loop",
  },
];

export const DEPLOYMENT_FACTS = [
  { k: "Question types", v: "11" },
  { k: "Organisation roles", v: "10" },
  { k: "Role workspaces", v: "4" },
  { k: "Product routes", v: "154" },
];

export const FOOTNOTES = [
  "Video proctoring uses LiveKit rooms minted server-side. Session recording is not enabled in this deployment.",
  "The optional EVALORA Secure Exam Browser is available for Windows 10 and 11, and is enabled per examination. Standard browsers remain available whenever Lockdown is off.",
  "Plan limits take effect immediately. Paid plans start with a 14-day trial; activation follows manual payment verification.",
];
