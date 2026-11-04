# EVALORA

**Interactive quizzes, assessments, examinations & live video proctoring — one SaaS platform.**

EVALORA is a multi-tenant SaaS for schools, universities, training centers, examination organizations and independent educators. It combines:

- A **quiz creation studio** with a reusable question bank (10 question types, KaTeX mathematics, media, reviewed CSV imports)
- A **live interactive quiz engine** (join codes + QR, synchronized/self-paced, server-authoritative timing & scoring, leaderboards, projector screen)
- A formal **examination engine** (candidate admission codes, randomization, autosave, server deadlines, auto + manual marking, controlled result publication)
- **Live video proctoring** with LiveKit (secure server-generated tokens, supervisor grid, incident review)
- A **Freemium + Premium** commercial system with configurable plans, trials and **manual payment verification**
- A complete **Super Admin console**

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend / DB | Supabase (PostgreSQL 17, Auth, Storage, Realtime), Row Level Security |
| Hosting | Vercel |
| Video | LiveKit Cloud (`livekit-server-sdk`, `@livekit/components-react`) |
| Math | KaTeX (`$…$` inline, `$$…$$` display) |

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

Apply the database schema from `supabase/migrations/` to your Supabase project
(via the Supabase SQL editor or CLI). The account whose email matches
`platform_settings.super_admin.email` becomes Super Admin on registration.

## Key concepts

- **Tenant isolation** — every table is organization-scoped with RLS; roles are
  enforced on the server (`src/lib/auth.ts`), never only in the UI.
- **Server-authoritative fairness** — timers, scoring and deadlines are computed
  on the server (`src/lib/scoring.ts`, `src/lib/exam.ts`). Participant/candidate
  devices receive questions with all answer keys stripped.
- **Guest flows** — live-quiz participants and exam candidates use unguessable
  access tokens validated by server routes (`src/app/api/...`) running with the
  service role; RLS stays closed to anonymous users.
- **Entitlements** — plan limits live in the `plans` table and are checked
  server-side before creating quizzes, questions, exams, members and
  proctored exams (`src/lib/entitlements.ts`).
- **Manual payments** — users submit a transaction reference + optional proof;
  a Super Admin approves; only then does the subscription activate.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, data model, security
- [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) — free-tier limits, cost model, scaling path
- [`docs/TESTING.md`](docs/TESTING.md) — test strategy and load-test plan
- [`docs/PHASE_REPORT.md`](docs/PHASE_REPORT.md) — what was built, phase by phase, and what remains

## Brand

All branding is centralized in `src/lib/brand.ts`; logo assets (original EVALORA mark) live in `public/brand/`.
