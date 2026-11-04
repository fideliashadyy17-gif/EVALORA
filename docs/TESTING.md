# EVALORA — Testing Strategy & Load-Test Plan

## What is verified today

- **Build**: `npm run build` passes (TypeScript strict, all routes compile).
- **Scoring unit tests** (run during development): single-choice,
  multiple-select partial credit & penalties, short-answer normalization,
  numeric tolerance, ordering, matching partial credit, open-ended → manual.
  The engine is pure TypeScript (`src/lib/scoring.ts`) — keep extending
  these with `tsx` or your preferred runner.
- **Database**: migration applied cleanly to the production Supabase project;
  RLS enabled on all 26 tables; seed plans/settings present.
- **Deployment**: production build READY on Vercel from the arena branch.

## Manual acceptance script (15 minutes, do this on the live URL)

1. Register with the Super Admin email → confirm email → sign in → `/admin` loads.
2. Create an organization (Premium trial starts) → dashboard shows trial banner.
3. Questions → create one of each type (include `$x^2$` math) → publish.
4. Import the CSV template → rows land in *Pending review* with a report → publish.
5. Quizzes → build a quiz → publish → **Go live (synchronized)**.
6. On a phone: join with the code → answer → host advances → leaderboard updates;
   projector at `/live/{code}` mirrors the round.
7. End session → Reports → session report → export CSV.
8. Exams → create from the quiz (proctoring on) → add 2 candidates → Open exam.
9. `/exam-access` as candidate 1 → allow camera → answer → autosave indicator;
   refresh the page → same codes resume the attempt with answers intact.
10. Supervisor opens *Proctoring room* → candidate feed visible → log an incident.
11. Submit as candidate → attempt auto-marked; mark any open-ended answer →
    Publish results → candidate sees score & PASS/FAIL.
12. Billing → submit a test payment reference → Super Admin → Payments →
    reject with reason (org gets notified) → submit again → approve →
    subscription activates.
13. Team → invite a second email as *Corrector* → accept via link → verify
    they cannot reach Billing (server rejects).

## Security tests to run regularly

- Tenant isolation: two orgs, attempt cross-org reads via the Supabase REST
  API with each user's JWT — all must return zero rows.
- Guest tokens: wrong token / wrong question id / late answer → 4xx.
- Forged LiveKit requests: candidate token for another exam → 403.
- Payment bypass: submitting a reference never changes entitlements until approval.

## Progressive load-test plan (measure, don't assume)

Use k6 or Artillery against a **staging** deployment (never production data):

| Stage | Scenario | Success signal |
|---|---|---|
| 1 | 5–20 participants, synchronized quiz | p95 state latency < 300 ms |
| 2 | 100 participants answering the same question within 2 s | 0 lost answers (unique-constraint count = submissions) |
| 3 | 500 participants | Vercel function errors < 0.1%, DB CPU < 70% |
| 4 | 1,000 participants | same + Supabase connection headroom verified |
| 5 | Video: 5 → 20 → 50 → 100 cameras in one exam room | supervisor grid stable, LiveKit minutes/bandwidth recorded per candidate-hour |

Report quiz capacity and video capacity **separately** — they are different
infrastructures with different ceilings.
