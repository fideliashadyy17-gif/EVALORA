# First Term 2026/27 — capacity evidence for 100 / 200 / 300 / 500 candidates

This document separates **what was actually executed and measured** from
**what is inferred from infrastructure limits**. No production load test was
run: the owner's rule is that a real exam is never used as a load target.

## 1. What was verified

| Check | Scope | Result |
|---|---|---|
| Autosave + grading activity benchmark | 100, 200, 300 and 500 simultaneous candidates split across the two new papers; 10 autosaves each (5 000 saves at 500); real `src/app/api/exam/save/route.ts` and real `src/lib/myp.ts`; in-memory database boundary | 100% acknowledged; 0 lost or duplicate answer rows; median-of-3 p99 = 20.5 / 12.6 / 24.9 / 69.8 ms; 500 attempts graded, p99 0.7 ms |
| Admission load test | Real link-access route, 100 / 500 / 1 000 simultaneous joins over the same number of devices; isolated in-memory DB | 100% admitted at every level; 0 duplicate attempts; p99 36 / 58 / 116 ms; 1 000 joins over 25 shared devices also 100% |
| Connection-loss recovery | Real presence route and pause ledger, 27 checks | Normal heartbeats do not move the timer; confirmed outages credit exactly; duplicate reconnects add nothing; one student's outage never changes another's attempt; an attempt already paused for connection loss resumes; organizer pause is never cancelled; an entirely hidden tab earns no credit |
| Criterion grading | All four criteria on both papers, 22 checks | Final result with explicit zeros for blank work; pending (never zero) for content-bearing unmarked work; no fabricated overall grade while incomplete |
| Database indexes | Production `pg_indexes` inspection | `exam_answers(attempt_id, question_id)` unique; `exam_attempts(exam_id, started_at)`, open-deadline and pending-manual partial indexes; `exam_presence(attempt_id)` unique and `(exam_id, last_seen_at)`; `quiz_questions(quiz_id, position)` |

### Activity benchmark table (median of three runs)

| Candidates | Autosaves | Verified answers/candidate | Duplicate/lost | Wall time | p50 | p95 | p99 | Saves/s | Attempts graded | Grading p99 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1 000 | 10.0 | 0 | 60 ms | 14.2 ms | 19.7 ms | 20.5 ms | 16 588 | 100 | 0.1 ms |
| 200 | 2 000 | 10.0 | 0 | 42 ms | 8.3 ms | 12.3 ms | 12.6 ms | 48 004 | 200 | 0.1 ms |
| 300 | 3 000 | 10.0 | 0 | 79 ms | 21.2 ms | 24.3 ms | 24.9 ms | 37 983 | 300 | 0.1 ms |
| 500 | 5 000 | 10.0 | 0 | 168 ms | 36.0 ms | 68.8 ms | 69.8 ms | 29 812 | 500 | 0.7 ms |

The 200-candidate run being faster than the 100-candidate run is JIT warm-up,
not a capacity effect; the table is descriptive, not a smooth scaling curve.

Command:

```bash
node scripts/benchmark-exam-activity-500.mjs
```

### What the benchmark does **not** include

- network round-trip time between the candidate's browser and Vercel;
- Vercel function cold starts, concurrency limits or bandwidth;
- Supabase Postgres latency, connection-pool waits or row-lock contention;
- production RLS/authorization queries beyond the route's own logic;
- LiveKit video or proctoring streams.

The in-memory database boundary means these numbers are an **application-work
lower bound**, not a production guarantee.

## 2. What is estimated, and on what basis

| Level | Estimate | Basis |
|---|---|---|
| 100–200 candidates, no video | Expected to work on the current free tiers | Admission and save-route work is milliseconds; free Supabase allows 200 Realtime connections but exams do not hold Realtime sockets; the dominant cost is HTTP + small Postgres upserts |
| 300 candidates, no video | Likely works; monitor p95 and DB connections | 3 000 saves over a ~45–60 minute paper is a very low average rate; the benchmark's in-process p99 stays under 25 ms |
| 500 candidates, no video | **Feasible only with paid headroom** (Vercel Pro + Supabase Pro recommended) | 5 000 saves works in-process, but Supabase Free's shared compute/connection limits and Vercel Hobby's function limits are not designed for an uncontrolled 500-candidate burst; the benchmark cannot prove the managed services' behaviour |
| 500 candidates with video proctoring | **Not claimed** | 500 simultaneous 720p streams is a LiveKit paid-capacity/bandwidth problem, independent of this application's autosave path |

The honest statement is: **500 concurrent candidates without video completed
the full autosave + grading workload in the application benchmark with zero loss
or duplication; production capacity at 500 is estimated, not verified, and
requires paid infrastructure headroom.**

## 3. Why the exam path is comparatively light

- Autosave is debounced and queued in the browser; the benchmark allows three
  saves in flight per candidate, not one request per keystroke.
- A save is one indexed upsert on `(attempt_id, question_id)` plus an optional
  flag update. There is no full-paper rewrite per answer.
- The state endpoint reads the paper once; subsequent saves send only one answer.
- Connection loss is detected server-side from heartbeats (`CONNECTION_LOST_AFTER_MS =
  65 000`) and the pause is stored in the attempt ledger; the timer extension is
  calculated server-side, so a disconnected candidate cannot lose time or gain
  time by manipulating the browser clock.
- Results are computed on demand by one MYP engine; 500 full-paper gradings take
  well under a second in-process.

## 4. Pre-flight recommendations for a 500-candidate sitting

1. Use Vercel Pro and Supabase Pro for the sitting; Free is acceptable for a
   pilot of 100–200 without video.
2. Confirm the Supabase connection pooler is in transaction mode and the
   application's pool limit is below the plan's connection cap.
3. Run a 50-candidate dress rehearsal on the actual school network, then 200,
   before 500. The benchmark is not a substitute for a network rehearsal.
4. Disable video proctoring for the 500-candidate sitting unless LiveKit capacity
   has been purchased and tested separately.
5. Watch `exam_presence` heartbeat lag and `exam_answers` upsert latency in the
   first ten minutes; both are indexed and visible in the Supabase dashboard.
6. Keep the browser autosave queue enabled; it is the recovery mechanism if a
   burst of saves is throttled.

## 5. Reproduce

```bash
node scripts/benchmark-exam-activity-500.mjs
node scripts/test-exam-link-load-1000.mjs
node scripts/test-exam-connection-pause.mjs
node scripts/test-summative-a-grading.mjs
```
