# Phase 4 delivery record — configured formatting reaches every screen

Date: 2026-11-26. Branch: `arena/fb70276a-evalora` (from `b7f0f85` of `main`,
which is PR #111 merged). Companion documents:
`PLATFORM_CONTROL_CENTER_AUDIT_2026-11-26.md` (delivery order §6, Phase 4),
`PHASE2_CONTROL_CENTER_QUESTION_STUDIO_2026-11-26.md` (the configuration layer
this phase finally connects to the whole product) and `EXECUTION_TRACKER.md`.

This is a delivery record, not a completion claim. Everything below exists on
this branch and is executed by the suites named in **Verification**.

---

## 1. The defect this phase removes

Phase 2 shipped `src/lib/formatting.ts`: pure formatters driven by
`formatting.date_format`, `formatting.time_format`, `formatting.number_format`
and `localization.default_timezone`. It also shipped a Control Center that lets
a Super Admin or a school change them.

What it did **not** ship was a route from those settings to the screens. Every
date in the product was rendered by one of three helpers in `src/lib/utils.ts`:

```ts
export function fmtDate(d)      { … new Date(d).toLocaleDateString("en-GB", …) }
export function fmtDateTime(d)  { … new Date(d).toLocaleString("en-GB", …) }
export function money(c, cur)   { … new Intl.NumberFormat("en-US", …) }
```

214 call sites in 97 files, plus 37 hand-written `toLocale*` / `new Intl.*`
calls in 24 more. An administrator could set the date format to ISO, the clock
to 12-hour, the separators to French and the timezone to Africa/Lagos, save it,
see the preview change in the Control Center — and not one table, receipt,
report or notification in the product would move. That is the exact defect the
Control Center exists to remove, left in the largest surface of the product.

## 2. What was delivered

### 2.1 One resolver, one rule

`src/lib/formattingRequest.ts` (server-only) is the only place that decides
*which* profile a render uses:

```ts
const fmt = await requestFormatter(org?.id ?? null);
fmt.date(value) · fmt.time(value) · fmt.dateTime(value)
fmt.number(value) · fmt.percent(value) · fmt.money(cents, currency)
```

Both exports are wrapped in React's `cache()`, so a page tree that formats in
several components resolves the configuration **once per request** — and because
`cache()` is request-scoped, no value can carry over between two concurrent
requests for two different tenants. There is no module-level mutable profile
anywhere: on a Fluid-compute lambda that would be a cross-tenant leak.

The scoping rule, applied consistently:

| Surface | Scope | Why |
|---|---|---|
| Organization workspace (`/dashboard/**`, `/supervision`) | `activeOrg(ctx)?.id` | The school's own profile, taken from the session — never from a URL segment. |
| Super Admin console (`/admin/**`) | `null` (platform-wide) | Its tables mix tenants; one school's separators must never be applied to another school's rows. |
| Public marketing pages (`/`, `/pricing`) | `null` | No tenant in scope. |
| Candidate surfaces that load an examination (`/exam/result/[token]`, `api/exam/access`, `ExaminationAccessCard`) | the examination's `organization_id` | The institution that owns the paper decides how its candidates read its dates — and the page has already authorized that row. |
| Candidate **live** examination (`/take-exam/**`, `LocalTime`, the save indicator) | none — device time | See §2.5. |

A malformed scope can never widen: `normalizeFormatScope()` accepts only a UUID
and returns `null` for anything else, so `"../other-org"` or an injected string
resolves to the platform-wide profile rather than to somebody's override. That
mirrors the configuration store's own tenant rule and is asserted by the suite.

The viewer's **interface language** decides month and weekday names
(`getRequestLocale()`), while the configured `localization.default_timezone`
decides the wall clock. So a French-speaking administrator reads
"26 nov. 2026" whatever the platform default language is, and a school in
Lagos reads Lagos time whatever the server's zone is.

### 2.2 Client components read the same profile

`src/components/formatting/FormattingProvider.tsx` + `useFormatting()` mirror the
existing `BrandProvider` pattern: the server resolves a plain `FormatConfig`,
hands it to a client provider, and client components bind the *same* pure
`formatterFrom()` the server used. Server-rendered markup and hydration cannot
disagree.

The provider is mounted twice, deliberately:

- the root layout mounts the **platform-wide** profile (anonymous visitors, the
  Super Admin console, marketing pages);
- `src/app/dashboard/layout.tsx` nests the **organization's** profile, so a
  school's client components follow the school.

Five client surfaces now read it: the Control Center history table, the
notification bell, the exam monitor, the score-adjustment ledger and the plan &
modules editor.

### 2.3 The hardcoded helpers were removed, not deprecated

`fmtDate`, `fmtDateTime` and `money` are **gone** from `src/lib/utils.ts`. A
deprecated wrapper that quietly ignores configuration is how a new screen ends up
deaf to it; deleting the names makes that impossible to write — it will not
compile. `src/lib/utils.ts` keeps `cn`, `slugify`, `mmss`, `genCode`, `shuffle`
and `toCsv`, and now says where formatting went.

103 files bind a resolved formatter. In the 84 server files that already called
the helpers, the conversion re-binds the *same names* from the resolved profile:

```ts
const org = activeOrg(ctx)!;
// Configured date, time and number profile (Platform Control Center →
// Presentation), resolved once per request from the session's own organization.
const { date: fmtDate, dateTime: fmtDateTime, money } = await requestFormatter(org?.id ?? null);
```

so the 200+ call sites themselves did not move. That was a deliberate choice:
a mechanical rename across 97 files is exactly where a live examination screen
gets silently broken, and this way every diff line is either an import, a
resolver, or a genuine inline-formatter conversion.

### 2.4 Hand-written `Intl` calls are now an allowlist with reasons

37 inline formatters in 24 files became 19 in 9, and each remaining one is
listed in `scripts/test-formatting-rollout.mjs` **with a reason**. Adding a tenth
file, or converting one of the nine and forgetting to delist it, fails the suite.
The nine:

| File | Reason |
|---|---|
| `src/lib/formatting.ts` | the configured formatters themselves |
| `src/lib/i18n/index.ts` | interface-language runtime for the shell; it has no data-rendering call site |
| `src/lib/config/validate.ts` | timezone capability probe, not presentation |
| `src/lib/notifications.ts` | import-free pure helper (a harness compiles it alone); the caller passes its configured formatter |
| `src/lib/mypPdf.ts` | print artifact with a fixed layout, pinned to UTC so a PDF never reflows |
| `src/components/LocalTime.tsx` | device time by design |
| `src/app/take-exam/[attemptId]/ExamMessenger.tsx` | live examination, device time |
| `src/app/take-exam/[attemptId]/RetakePanel.tsx` | live examination, device time; the server decides validity |
| `src/components/response/StructuredResponseEditor.tsx` | candidate save indicator inside a live examination |

Converted among the inline calls: competition scores and averages, qualification
and invitation timestamps, the demo-workspace import log, system-health counters,
the student import batch list, examination hints, the candidate result page's
submission stamp, the access-card opening/closing window, and two API error
messages that quote a time to a human (`api/exam/access`, `api/students/import`).

### 2.5 A candidate's clock was deliberately left alone

`localization.default_timezone` says so in its own description: *"Individual
users still see their own device time inside a live examination so a candidate is
never misled about remaining time."* The rollout honours that literally — no file
under `src/app/take-exam/` and not `LocalTime.tsx` may import the resolver or the
provider, and the suite asserts it. The countdown, the pause clock, the messenger
timestamps and the "saved at" indicator stay on the device.

### 2.6 Two honest behaviour changes, and one default that moved to avoid a third

Routing real screens through the configuration changes what an **unconfigured**
platform renders, because the settings now apply:

1. **Timezone.** `localization.default_timezone` defaults to `Africa/Porto-Novo`
   and was inert. Every configured screen now renders that wall clock instead of
   the lambda's UTC — an examination that opens at 09:00 in Cotonou now reads
   09:00 rather than 08:00. This is the setting working, and it is the reason the
   setting exists; the live-examination clock is exempt (§2.5).
2. **`fmtDateTime` gains the year.** The old helper printed `26 Nov, 14:30`;
   the configured formatter prints `26 Nov 2026, 14:30`. Tables get slightly
   wider and stop being ambiguous across years.
3. **Avoided:** amounts would have changed from `$1,234` to `US$1,234`, because
   `formatting.number_format` shipped as `en_gb` while `money()` had always used
   `en-US`. Plain numbers and percentages are byte-identical between the two
   locales, so the shipped default is now `en_us` and the option list says what
   each choice does to an amount (`1,234.56 — $1,234 (default)`,
   `1,234.56 — US$1,234 (British)`, `1 234,56 — 1 234 $US (French)`). No stored
   value changed; the live database holds no `formatting.*` row, so the schema
   default is what resolves.

Also hardened while wiring it up:

- `formatMoney` no longer throws on data. A stored currency code that `Intl`
  refuses (`FCFA`, blank, `null`) degrades to a configured plain number plus the
  raw code, so one legacy payment row cannot take down a payments table.
- **A bare calendar date never shifts a day.** `2010-05-04` names a day, not an
  instant. Rendering it through a zone behind UTC — which is exactly what a
  configured timezone now does — used to be able to print the day before, so a
  birthday or a due date would have been wrong for any school that configured a
  western zone. Date-only values are pinned to the zone they were parsed in
  (`zoneFor()`), real instants still move with the configured zone, and
  `formatDateTime` renders both halves in ONE zone so the date and the time can
  never disagree about which day it is.

### 2.7 One more inert setting closed

`formatting.default_academic_year` was declared in Phase 2 with two
`consumedBy` entries — `src/lib/formatting.ts` and the paper-builder's new-page —
and **neither read it**. That is the defect this whole programme exists to
remove, sitting inside the namespace this phase owns, so it is fixed here rather
than recorded as somebody else's problem.

The platform already has a real academic-year model (the `academic_years` table,
per organization, with `is_current`), so the setting was not wired into anything
that would compete with it. It is now the **label offered when a new one is
created and none is typed**:

- `src/app/dashboard/exams/new/page.tsx` — the new examination form's
  `academic_year` field is pre-filled with the configured value;
- `src/app/dashboard/academics/page.tsx` — the "New academic year" record form
  offers it as the name (an existing year being edited keeps its own name).

Existing records are never relabelled, and the schema entry's description and
`consumedBy` now say exactly that. The rollout suite asserts both consumers, so
the setting cannot go inert again silently.

## 3. Verification

| Gate | Result |
|---|---|
| `npm test` | **187 suites, 0 failed, 8 browser/cron suites skipped, 10,453 checks** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errors, 21 pre-existing warnings |
| `npm run build` (production, Turbopack) | exit 0 — "Compiled successfully in 61s" |
| `node scripts/check-contrast.mjs` | all pairs pass WCAG 2.2 AA — no palette was touched |

New suite: `scripts/test-formatting-rollout.mjs` (35 checks), half static and
half behavioural. The static half is the ratchet: the hardcoded helpers are gone,
nothing imports a formatter from `@/lib/utils`, every file that formats binds a
resolved profile, only server files resolve and only client files consume the
provider, the inline-formatter allowlist matches the tree exactly, both providers
are mounted, and the candidate live surface is still device time. The behavioural
half loads the **real** `src/lib/formatting.ts` and `src/lib/formattingRequest.ts`
with only the configuration service and the locale resolver faked, and asserts:
the shipped profile reproduces the old `money()` and `fmtDate()` output exactly;
every date format matches the label the Control Center shows; both clocks render;
an unknown configured value falls back instead of rendering garbage; the
configured timezone moves the wall clock; an organization override reaches the
formatter; the viewer's language decides month names; a malformed scope resolves
to platform-wide and the service is never handed the raw input; an unreachable
configuration store degrades to the shipped profile instead of throwing; a
JSON-round-tripped profile formats identically (so server and hydrated client
cannot diverge); and a currency code `Intl` refuses cannot crash a table.

Two existing suites were updated because their assertions described the old
world, not because they broke:

- `scripts/test-notification-popover.mjs` — the bell now passes its configured
  formatter to `formatRelativeTime`, and three checks were added for that.
- `scripts/test-centralized-rbac-enforcement.mjs` — stubs `@/lib/formattingRequest`
  the same passthrough way it already stubbed `@/lib/utils`, because that suite is
  about RBAC, not formatting.

Five suites that compile a single source file on its own
(`test-secure-access-codes`, `test-spreadsheet-import-and-csv-safety`,
`test-competition-next-round`, `test-exam-link-access-concurrency`,
`test-exam-link-load-1000`) drove one design decision: `src/lib/utils.ts` and
`src/lib/notifications.ts` stay **import-free**, so those harnesses keep working
and both modules remain unit-testable without a bundler.

## 4. Deliberately not done

- **No stored value changed.** This phase is presentation only: no migration, no
  data rewrite, no change to how a deadline is *computed* (the server still owns
  every window).
- `src/lib/i18n/index.ts` keeps its own `formatDate`/`formatDateTime`. They are
  bound to the interface language and are exposed on the i18n context, but **no
  component calls them** — there is no second, competing renderer in use. If one
  is ever added it must take the configured profile.
- `src/lib/mypPdf.ts` and the candidate paper PDF keep their fixed print layout.
  A printed script is an artifact with geometry, not a screen; reflowing it from
  a configuration value is a separate decision.
- `formatting.default_academic_year` was not touched; it keeps its existing
  consumer.
- The 8 `access_permissions` keys added in Phase 2 are still granted to no role,
  and Phases 5–7 of the audit's delivery order remain open.

## 5. Deployment state

| Step | Status |
|---|---|
| Branch pushed | pending |
| Pull request opened | pending |
| Migration | **none required** — this phase changes no schema and no data |
| Production build | pending |

Note for the release: merging to `main` **deploys production automatically** (the
merge of PR #111 produced `dpl_H5DK1rmPq8vA6CWzRGWevUXJAbt8` from the GitHub
integration without an explicit API call), so the timezone change in §2.6 goes
live the moment this is merged. The rollback path is a Vercel rollback — there is
nothing to undo in the database.
