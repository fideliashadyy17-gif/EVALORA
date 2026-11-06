# EVALORA — School portals, classes, student imports & DEMO school

Added 2026-11-04 on top of the existing multi-organization platform.
No tenant gets a separate application: one Next.js codebase serves the
main EVALORA site and every school portal.

## Where things live

| Capability | School workspace (tenant) | Super Admin |
|---|---|---|
| Academic years, education levels, departments/streams, subjects | **Academic Management → Academic Structure** (`/dashboard/academics`) | Organization hub → Academics (existing) |
| Classes: create/edit/archive/restore/safe delete, code, teacher, capacity, roster, transfer | **Academic Management → Classes** (`/dashboard/academics/classes`) | **Academic Mgmt — Classes** (`/admin/classes`) |
| Register students, enroll/move, status, portal login | **Academic Management → Students** (`/dashboard/students`) | `/admin/students`, `/admin/students/new`, organization hub |
| Advanced student import | Students page wizard | Students panel / organization hub wizard |
| DEMO school controls + migration ledger | DEMO workspace | **DEMO School & Migration** (`/admin/demo`) |

Education levels, year names and class naming are records owned by each
organization — EVALORA does not hardcode any one country's school system.

## Class-scoped student registration

- The registration class dropdown is loaded server-side from the caller's
  own organization for the selected academic year; writes re-check that
  the class, year, level, department and teacher all belong to that school.
- **+ Create New Class** inside the form saves through a server action,
  selects the new class immediately and keeps the half-completed student
  form intact.
- Global Super Admin registration first loads one chosen school, then only
  that school's active classes; `saveStudent` also validates class→org on
  the server and enrolls under the class's own academic year.

## Advanced student import wizard

Formats: **CSV, XLS, XLSX, PDF, DOC, DOCX** (+ TXT), max 10 MB.

1. **Upload** (drag & drop) with CSV/XLSX template downloads.
2. **Extraction** on the server (`src/lib/extractServer.ts`): spreadsheets
   via SheetJS, CSV dialect detection, PDF text layer via PDF.js with
   column reconstruction from text positions, DOCX tables/text via
   Mammoth, legacy DOC via Word Extractor. A PDF with no text layer is
   offered **browser OCR** (PDF.js rendering + Tesseract `eng+fra`).
3. **Column mapping** with English/French synonym guesses.
4. **Editable preview**: every row is labelled valid / invalid / duplicate /
   excluded with reasons — missing name, bad email/date, unknown class,
   in-file and existing-student duplicates. Unknown classes are never
   silently created or guessed; pick one of the school's classes or a
   default class. Duplicate mode: skip (default) or update existing.
5. **Explicit confirmation** with exact counts.
6. **Server import** (`/api/students/import`) re-resolves the organization
   from the verified session (ordinary users can never target another
   school), re-validates every record, inserts in atomic 200-row chunks
   with compensating rollback if enrollment fails, blocks re-import of
   the same file SHA-256 per school, and writes `import_batches` + an
   audit row. The original file is preserved privately in the
   `student-imports` bucket under `<organization_id>/<batch_id>/…`
   (storage RLS: org-scoped first path segment). A full per-row report
   is downloadable as CSV.

Reliability notes, stated plainly: spreadsheets and structured Word/PDF
*tables* are reliable; PDF columns reconstructed from text positions and
legacy `.doc` text need preview correction; OCR of scanned registers is
assistive only — every extracted name/date/class must be verified in the
preview. The wizard never invents missing values and never stores raw
document text as student fields.

## Tenancy & school subdomains

- `organizations.slug` **is** the school subdomain label (unique in the
  database, DNS-label constrained by migration 0006). Reserved labels
  (`www`, `admin`, `api`, …) are rejected; conflicts produce alternatives
  in onboarding and in Super Admin organization creation.
- `src/middleware.ts` derives the tenant slug from the `Host` header and
  forwards it as `x-evalora-tenant-slug`; `getSessionContext()`
  re-derives it server-side and only *selects* among the user's verified
  memberships. A user who is not a member of the hostname's school gets
  `tenantDenied` and `activeOrg()` returns `null` — another school's
  workspace can never load. Super Admins enter tenant hosts in the same
  audited administrative workspace mode as the existing cookie flow.
- `<slug>.<root>/` rewrites to the public school portal
  `/portal/<slug>` (branding, sign-in, join-code and exam-code entries;
  suspended schools get a closed message; unknown/disabled portals 404).
- All tenant data remains behind the existing helper-based RLS
  (`is_org_member`, `can_manage_org`, `can_create_content`), now also
  covering `import_batches` and the `student-imports` bucket.
- Super Admins manage slug/portal/lifecycle in the organization hub
  (subdomain changes are validated, unique-checked and audit-logged as
  `organization.subdomain_changed`). School admins see their portal
  address in Settings and request changes — renaming a school no longer
  changes its slug silently.

### Production domain status (2026-11-04)

Verified through the Vercel connector: the `evalora` project currently
serves only `*.vercel.app` names and **no custom root domain is attached**,
so live `<school>.<root>` subdomains cannot resolve yet. The application
side is complete and verified (tenant resolution, `/portal/<slug>`,
`*.localhost` in development). To go live the owner must:

1. Attach the real root domain (e.g. `evalora.com`) to the Vercel project
   and add the wildcard domain `*.evalora.com` to the same project.
2. Publish the DNS records Vercel requests (apex + wildcard) and wait for
   the wildcard certificate to issue.
3. Set Vercel env `NEXT_PUBLIC_ROOT_DOMAIN=evalora.com` (all targets),
   set `NEXT_PUBLIC_APP_URL=https://evalora.com`, and redeploy.
4. In Supabase Auth, set the Site URL to the apex and add
   `https://*.evalora.com/**` (and the apex) to the redirect allow-list
   so password-reset/invite links work from school subdomains.
5. Verify: apex loads the main site, `demo.evalora.com` loads only the
   DEMO portal, an unknown subdomain 404s, and signing in as a member of
   one school on another school's subdomain is denied.

Until step 1–5 are done, school portals are available at
`<app-url>/portal/<slug>` — do not claim working subdomains before then.

## EVALORA DEMO ACADEMY

- Real tenant, slug **`demo`**, `is_demo = true`, portal enabled, labelled
  DEMO on the public portal, dashboard sidebar and a workspace banner.
- Protected by a database trigger: it cannot be deleted and its slug /
  demo flag cannot change (verified live — both operations blocked);
  the admin UI hides deletion for it. Only one `is_demo` organization
  can exist (partial unique index).
- Contents (verified live): 9 fictional accounts (owner/admin, 2 teachers,
  6 linked students), 3 academic years, 2 levels, 3 departments,
  4 subjects, 5 classes (4 active + 1 archived), 18 fictional roster
  students with enrollments, 12 published questions (legacy LaTeX plus a
  structured rich-content example), 2 quizzes, 1 published live
  competition with a ready lobby session and a labelled *sample* ended
  session (48 sample answers), 1 open examination with 6 candidates and
  a labelled *sample* marked attempt, and a complimentary (non-revenue)
  premium subscription.
- DEMO accounts have unknowable random passwords. From
  **/admin/demo**, the Super Admin can generate a one-time password for
  any DEMO account (shown once, audit-logged), enter the DEMO workspace,
  or **Reset DEMO activity** — which deletes only DEMO sessions/answers
  and exam attempts, rebuilds the labelled sample results and a fresh
  lobby, and can never touch a real tenant.
- DEMO is excluded from platform headline statistics and commerce
  breakdowns (`/admin/statistics`, organization/student counters). It
  has no payments.

## Source-question migration status (2026-11-04)

Destination ledger tables (`migration_runs`, `migration_mappings`,
Super-Admin-only RLS) are installed; audits are recorded in `/admin/demo`:

- `oak-competition-platform` (`cdieylfpjfyklsbdffut`, ACTIVE): public
  schema contains only `certificates`, `profiles`, `site_admins`
  (0 / 0 / 1 rows) — **no question or competition tables exist there**,
  so there is nothing to migrate from it.
- `oak-competition-platform-premium` (`kqpwjaeqmsjrypurfwak`):
  **INACTIVE (paused)** — SQL inaccessible, connector restore denied
  (403), health check shows no active services.

**Owner action required:** unpause `oak-competition-platform-premium`
in the Supabase dashboard (or provide the correct source project ref).
Once reachable, migration will: audit its schema read-only; map
questions/options/answers/solutions/marks/difficulty/subject/level/
competition into the DEMO tenant (or a chosen org); preserve LaTeX as
structured `prompt_doc`/`content_doc`; re-host images into EVALORA
storage; record every source→destination ID and content hash in
`migration_mappings` (idempotent, duplicates skipped by mapping/hash);
and report migrated / duplicate / failed / needs-review counts. Until
then, no source questions have been migrated — the DEMO bank contains
only the 12 clearly-labelled DEMO-written sample questions.

## Verification

- `node scripts/test-school-systems.mjs` — 31 checks: tenant slugs/hosts,
  header synonyms (EN/FR), date/gender normalization, duplicate &
  unknown-class validation, CSV/XLSX/PDF-text/DOCX-table extraction.
- Existing suites still pass: admin utils (11), rich content (142),
  contrast (WCAG AA). `npx tsc --noEmit`, ESLint (0 errors) and
  `npm run build` are green.
- Live-database checks: DEMO counts above; delete/slug-change guards
  blocked; as an authenticated DEMO student (simulated JWT) RLS exposes
  exactly the DEMO org's 18 students / 5 classes / 1 organization and
  nothing else; as a DEMO teacher, import-batch + student + enrollment
  inserts succeed under RLS (rolled back after the check).
