import katex from "katex";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronRight,
  Clock3,
  Flag,
  GraduationCap,
  Layers3,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sigma,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Real product-interface previews for the public landing page.
 *
 * These are deliberately built from DOM + the application's real evergreen /
 * gold tokens instead of screenshots: they stay crisp at any density, weigh a
 * few kilobytes, translate for screen readers, and cannot drift out of date in
 * a way a screenshot would. Layouts mirror the shipped screens:
 *   · candidate paper  → src/app/take-exam/[attemptId]/TakeExamClient.tsx
 *   · live monitor     → src/app/dashboard/exams/[id]/monitor
 *   · proctoring grid  → src/app/dashboard/proctoring + /api/livekit/token
 *   · studio + marking → dashboard questions / rubrics
 */

/** Server-rendered KaTeX so the previews ship zero JavaScript. */
export function M({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: false,
    trust: false,
  });
  return (
    <span
      className="inline-block align-middle [&_.katex]:text-[1.02em]"
      // Static, authored TeX — never user input.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Dot({ tone }: { tone: "live" | "warn" | "idle" }) {
  const cls =
    tone === "live" ? "bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.16)]"
    : tone === "warn" ? "bg-amber-500 shadow-[0_0_0_3px_rgb(245_158_11/0.16)]"
    : "bg-stone-400";
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function MiniBar({ value, tone = "green" }: { value: number; tone?: "green" | "gold" | "red" }) {
  const fill =
    tone === "gold" ? "linear-gradient(90deg,#c9a227,#e2c45c)"
    : tone === "red" ? "linear-gradient(90deg,#b91c1c,#f87171)"
    : "linear-gradient(90deg,#0a5c36,#268253)";
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-evergreen-900/10">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: fill }} />
    </span>
  );
}

/* ───────────────────────────── 1. Hero: candidate paper ─────────────────── */

export function CandidatePaperPreview() {
  const options = [
    { key: "A", body: <>x = 3</> },
    { key: "B", body: <>x = -3</> },
    { key: "C", body: <>x = 3 or x = -3</> },
    { key: "D", body: <>x = 9</> },
  ];
  return (
    <div className="relative">
      <div className="lp-frame lp-frame--dark lp-frame--float">
        <div className="lp-frame-bar lp-frame-bar--dark">
          <span className="lp-frame-lights"><span /><span /><span /></span>
          <span className="flex-1 truncate rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-evergreen-100/80">
            evalora-edu.online/take-exam
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
            <Lock className="h-2.5 w-2.5" /> Secure
          </span>
        </div>

        <div className="p-2.5 sm:p-3.5">
          {/* Paper header */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[13px] font-semibold text-white">
                MYP 4 · Mathematics · Paper 2
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-evergreen-100/70">
                <GraduationCap className="h-3 w-3" aria-hidden /> Grade 9 · Section B · 16 questions
              </p>
            </div>
            <div className="rounded-lg border border-white/12 bg-white/[0.06] px-2.5 py-1 text-center">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-evergreen-100/70">Time remaining</p>
              <p className="font-display text-base font-bold tabular-nums leading-tight text-white">42:18</p>
            </div>
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-center">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Saves</p>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold text-emerald-200">
                <Check className="h-3 w-3" aria-hidden /> Server
              </p>
            </div>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[1fr_7.6rem]">
            {/* Question card */}
            <div className="rounded-xl border border-evergreen-900/10 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-evergreen-700">
                  <Sigma className="h-3 w-3" aria-hidden /> Question 7
                </p>
                <span className="rounded-md bg-gold-100 px-1.5 py-0.5 text-[9px] font-bold text-gold-800">4 marks</span>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink">
                Solve the equation and choose the correct solution set.
              </p>
              <div className="mt-1.5 rounded-lg bg-cream px-3 py-2 text-center text-[13px] text-evergreen-950">
                <M tex="x^{2} - 9 = 0" display />
              </div>
              <ul className="mt-2 space-y-1">
                {options.map((o) => {
                  const selected = o.key === "C";
                  return (
                    <li
                      key={o.key}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                        selected
                          ? "border-evergreen-600 bg-evergreen-50 text-evergreen-950"
                          : "border-evergreen-900/12 bg-white text-ink"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold ${
                          selected ? "border-evergreen-700 bg-evergreen-700 text-white" : "border-evergreen-900/30 text-ink-soft"
                        }`}
                      >
                        {o.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{o.body}</span>
                      {selected && <Check className="h-3 w-3 text-evergreen-700" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-evergreen-50 px-2 py-1 text-[9.5px] font-semibold text-evergreen-900">
                  <Check className="h-2.5 w-2.5" aria-hidden /> Saved to server
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-evergreen-900/15 px-2 py-1 text-[9.5px] font-semibold text-ink-soft">
                  <Flag className="h-2.5 w-2.5" aria-hidden /> Flag for review
                </span>
              </div>
            </div>

            {/* Right rail: navigator + video supervision */}
            <div className="space-y-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.05] p-2">
                <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-evergreen-100/70">Navigator</p>
                <div className="mt-1.5 grid grid-cols-5 gap-1">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const state =
                      i < 6 ? "done" : i === 6 ? "current" : i === 8 ? "flagged" : "todo";
                    return (
                      <span
                        key={i}
                        className={`flex h-4 items-center justify-center rounded text-[7.5px] font-bold ${
                          state === "done" ? "bg-emerald-400/25 text-emerald-100"
                          : state === "current" ? "bg-gold-400 text-evergreen-950"
                          : state === "flagged" ? "bg-amber-400/30 text-amber-100"
                          : "bg-white/10 text-evergreen-100/60"
                        }`}
                      >
                        {i + 1}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border-2 border-gold-500/70 bg-evergreen-950">
                <div className="flex h-16 items-center justify-center bg-gradient-to-br from-evergreen-800 via-evergreen-900 to-evergreen-950">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 font-display text-[11px] font-bold text-white">
                    AO
                  </span>
                </div>
                <p className="flex items-center gap-1 bg-evergreen-900/80 px-1.5 py-1 text-[8px] font-semibold text-emerald-200">
                  <Video className="h-2.5 w-2.5" aria-hidden /> Camera live
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating annotations */}
      <div className="lp-pin left-[-0.7rem] top-[38%] hidden sm:flex">
        <Clock3 className="h-3 w-3 text-evergreen-700" aria-hidden /> Server clock
      </div>
      <div className="lp-pin bottom-[16%] right-[-1rem] hidden sm:flex">
        <ShieldCheck className="h-3 w-3 text-evergreen-700" aria-hidden /> Proctored
      </div>
    </div>
  );
}

/* ───────────────────────────── 2. Live monitor ──────────────────────────── */

export function LiveMonitorPreview() {
  const rows = [
    { name: "Amina Okonjo", cls: "MYP 4 · A", pct: 82, q: "Q13/16", conn: "live" as const, pending: 0 },
    { name: "Lucas Ferreira", cls: "MYP 4 · A", pct: 54, q: "Q9/16", conn: "live" as const, pending: 1 },
    { name: "Hana Suzuki", cls: "MYP 5 · B", pct: 26, q: "Q4/16", conn: "warn" as const, pending: 2 },
    { name: "Ibrahim Diallo", cls: "MYP 5 · B", pct: 93, q: "Q15/16", conn: "live" as const, pending: 0 },
    { name: "Sofia Marchetti", cls: "MYP 4 · B", pct: 12, q: "Q2/16", conn: "idle" as const, pending: 0 },
  ];
  return (
    <div className="lp-frame bg-white">
      <div className="lp-frame-bar">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="lp-frame-url">dashboard/exams/monitor</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-800">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-red-600" /> Live
        </span>
      </div>
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="lp-panel-label">Live monitor · Paper 2</p>
            <p className="mt-0.5 font-display text-[15px] font-semibold text-evergreen-950">18 candidates · 4 in progress</p>
          </div>
          <div className="flex gap-1.5">
            {[
              ["Submitted", "9", "text-evergreen-800 bg-evergreen-50"],
              ["Pending", "4", "text-amber-800 bg-amber-50"],
              ["Offline", "1", "text-stone-700 bg-stone-100"],
            ].map(([l, v, cls]) => (
              <span key={l} className={`rounded-md px-2 py-1 text-[9px] font-semibold ${cls}`}>
                {l} <strong className="ml-0.5 tabular-nums">{v}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-evergreen-900/12">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Preview of the live examination monitor</caption>
            <thead>
              <tr className="bg-cream text-[8.5px] uppercase tracking-[0.1em] text-ink-soft">
                <th scope="col" className="px-2.5 py-1.5 font-semibold">Candidate</th>
                <th scope="col" className="hidden px-2 py-1.5 font-semibold sm:table-cell">Class</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Progress</th>
                <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-evergreen-900/8">
                  <td className="px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <Dot tone={r.conn} />
                      <span className="text-[10.5px] font-medium text-ink">{r.name}</span>
                    </span>
                  </td>
                  <td className="hidden px-2 py-1.5 text-[9.5px] text-ink-soft sm:table-cell">{r.cls}</td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="w-14 sm:w-20"><MiniBar value={r.pct} tone={r.conn === "warn" ? "gold" : "green"} /></span>
                      <span className="text-[9px] tabular-nums text-ink-soft">{r.q}</span>
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    {r.pending > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[8.5px] font-semibold text-amber-800">
                        {r.pending} saving
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-evergreen-50 px-1.5 py-0.5 text-[8.5px] font-semibold text-evergreen-800">
                        <Check className="h-2.5 w-2.5" aria-hidden /> Synced
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[9px] text-ink-soft">
          <MessageSquare className="h-3 w-3 text-evergreen-700" aria-hidden />
          Private message sent to Hana Suzuki · never changes answers, marks or timers
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 3. Question studio ───────────────────────── */

export function StudioPreview() {
  return (
    <div className="lp-frame bg-white">
      <div className="lp-frame-bar">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="lp-frame-url">dashboard/questions/new</span>
        <span className="rounded bg-evergreen-50 px-1.5 py-0.5 text-[9px] font-semibold text-evergreen-800">Draft</span>
      </div>
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="lp-panel-label">Question studio</p>
          <span className="rounded-md bg-gold-100 px-1.5 py-0.5 text-[9px] font-bold text-gold-800">Constructed response</span>
        </div>
        <div className="mt-2 rounded-lg border border-evergreen-900/12 bg-cream/60 p-2.5">
          <p className="text-[11px] leading-relaxed text-ink">
            A rectangle has length <M tex="(2x+3)" /> cm and width <M tex="(x-1)" /> cm. Show that the area is{" "}
            <M tex="2x^{2}+x-3" /> cm².
          </p>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_8.5rem]">
          <div className="rounded-lg border border-evergreen-900/12 bg-white p-2">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Response workspaces</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {["Writing", "Mathematics", "Tables", "Graph", "Geometry", "Statistics", "Venn", "Probability tree", "Stem & leaf", "Science"].map((t, i) => (
                <span
                  key={t}
                  className={`rounded px-1.5 py-0.5 text-[8.5px] font-semibold ${
                    i < 5 ? "bg-evergreen-50 text-evergreen-800" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 border-t border-evergreen-900/10 pt-1.5">
              <span className="rounded bg-evergreen-700 px-1.5 py-0.5 text-[8.5px] font-bold text-white">Marks 4</span>
              <span className="rounded border border-evergreen-900/15 px-1.5 py-0.5 text-[8.5px] font-semibold text-ink-soft">Difficulty 3</span>
              <span className="rounded border border-evergreen-900/15 px-1.5 py-0.5 text-[8.5px] font-semibold text-ink-soft">Criterion C</span>
            </div>
          </div>
          <div className="rounded-lg border border-evergreen-900/12 bg-evergreen-950 p-1.5">
            <p className="px-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-evergreen-100/70">Math keyboard</p>
            <div className="mt-1 grid grid-cols-4 gap-0.5">
              {["√", "x²", "a/b", "π", "≤", "≥", "∫", "∑", "θ", "sin", "log", "lim"].map((g) => (
                <span key={g} className="flex h-4 items-center justify-center rounded bg-white/10 text-[8px] font-semibold text-white">
                  {g}
                </span>
              ))}
            </div>
            <p className="mt-1 truncate px-0.5 text-[7.5px] text-evergreen-200/70">20 categories · no LaTeX needed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 4. Marking ───────────────────────────────── */

export function MarkingPreview() {
  const criteria = [
    { code: "C1", label: "Correct expansion", max: 2, given: 2 },
    { code: "C2", label: "Simplification", max: 1, given: 1 },
    { code: "C3", label: "Conclusion stated", max: 1, given: 0 },
  ];
  return (
    <div className="lp-frame bg-white">
      <div className="lp-frame-bar">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="lp-frame-url">dashboard/exams/marking</span>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">Corrector queue</span>
      </div>
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <p className="lp-panel-label">Answer script · Candidate 014</p>
          <span className="font-display text-sm font-bold tabular-nums text-evergreen-900">3 / 4</span>
        </div>
        <div className="mt-2 space-y-1">
          {criteria.map((c) => (
            <div key={c.code} className="flex items-center gap-2 rounded-lg border border-evergreen-900/10 bg-white px-2 py-1.5">
              <span className="flex h-4 w-6 shrink-0 items-center justify-center rounded bg-evergreen-950 text-[7.5px] font-bold text-gold-300">
                {c.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink">{c.label}</span>
              <span className="text-[9px] text-ink-soft">/{c.max}</span>
              <span
                className={`flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold ${
                  c.given === c.max ? "bg-evergreen-700 text-white" : "border border-amber-400 bg-amber-50 text-amber-800"
                }`}
              >
                {c.given}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-cream px-2 py-1.5">
          <span className="text-[9px] text-ink-soft">Every change appended to the grade ledger</span>
          <span className="rounded bg-evergreen-700 px-2 py-0.5 text-[9px] font-bold text-white">Save &amp; next</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 5. Proctoring grid ───────────────────────── */

export function ProctorPreview() {
  const tiles = [
    { initials: "AO", state: "live" as const },
    { initials: "LF", state: "live" as const },
    { initials: "HS", state: "warn" as const },
    { initials: "ID", state: "live" as const },
    { initials: "SM", state: "idle" as const },
    { initials: "TB", state: "live" as const },
  ];
  return (
    <div className="lp-frame lp-frame--dark">
      <div className="lp-frame-bar lp-frame-bar--dark">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="flex-1 truncate rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-evergreen-100/80">
          dashboard/proctoring
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-200">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-red-400" /> Room open
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-evergreen-100/70">LiveKit room · 6 of 18</p>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[8.5px] font-semibold text-evergreen-100">Page 1 / 2</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {tiles.map((t) => (
            <div key={t.initials} className="relative overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-evergreen-800 to-evergreen-950">
              <div className="flex h-11 items-center justify-center sm:h-12">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 font-display text-[10px] font-bold text-white">
                  {t.initials}
                </span>
              </div>
              <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/40 px-1 py-0.5 text-[7px] font-semibold text-white">
                <Dot tone={t.state} />
                {t.state === "live" ? "live" : t.state === "warn" ? "reconnect" : "offline"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1.5">
          <p className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-amber-200">
            <ShieldCheck className="h-2.5 w-2.5" aria-hidden /> Incident logged
          </p>
          <p className="mt-0.5 text-[9px] leading-snug text-amber-100/85">
            HS · screen share stopped · awaiting human review — never an automatic verdict
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 6. Results & analytics ───────────────────── */

export function ResultsPreview() {
  const bars = [62, 74, 58, 81, 69, 88, 76];
  return (
    <div className="lp-frame bg-white">
      <div className="lp-frame-bar">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="lp-frame-url">dashboard/reports/exam</span>
        <span className="rounded bg-evergreen-50 px-1.5 py-0.5 text-[9px] font-semibold text-evergreen-800">Published</span>
      </div>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ["Candidates", "18"],
            ["Average", "71%"],
            ["Pass rate", "83%"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-evergreen-900/10 bg-cream/60 px-2 py-1.5">
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-ink-soft">{l}</p>
              <p className="lp-metric text-base font-bold text-evergreen-950">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-lg border border-evergreen-900/10 p-2">
          <div className="flex items-center justify-between">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">Question facility</p>
            <p className="text-[8px] text-ink-soft">Q1–Q7</p>
          </div>
          <div className="mt-1.5 flex h-12 items-end gap-1">
            {bars.map((b, i) => (
              <span
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${b}%`,
                  background: b > 75 ? "linear-gradient(180deg,#268253,#0a5c36)" : "linear-gradient(180deg,#e2c45c,#c9a227)",
                }}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-evergreen-900/10 px-2 py-1.5">
          <span className="flex items-center gap-1 text-[9px] font-semibold text-evergreen-900">
            <BookOpenCheck className="h-3 w-3" aria-hidden /> MYP criterion C · level 5
          </span>
          <span className="flex items-center gap-1 text-[8.5px] text-ink-soft">CSV · Excel · PDF</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 7. Live quiz / big screen ────────────────── */

export function LiveScreenPreview() {
  return (
    <div className="lp-frame lp-frame--dark">
      <div className="lp-frame-bar lp-frame-bar--dark">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="flex-1 truncate rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-evergreen-100/80">
          evalora-edu.online/live/screen
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" /> Q4 / 10
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
          <span className="font-display text-[12px] font-semibold text-white">Science Bowl · Round 2</span>
          <span className="flex items-center gap-1 rounded-md bg-gold-400 px-2 py-0.5 font-display text-[12px] font-bold tabular-nums text-evergreen-950">
            07
          </span>
        </div>
        <p className="mt-2 rounded-lg bg-white/[0.05] px-2.5 py-2 text-[10.5px] leading-snug text-evergreen-50">
          Which organelle is responsible for synthesising ATP in eukaryotic cells?
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {["Nucleus", "Mitochondrion", "Ribosome", "Golgi body"].map((o, i) => (
            <span
              key={o}
              className={`rounded px-2 py-1 text-[9px] font-medium ${
                i === 1 ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40" : "bg-white/[0.06] text-evergreen-100/80"
              }`}
            >
              {o}
            </span>
          ))}
        </div>
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] p-2">
          <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-evergreen-100/60">Leaderboard</p>
          <div className="mt-1 space-y-1">
            {[
              ["1", "Team Phoenix", "2,480"],
              ["2", "Team Aurora", "2,315"],
              ["3", "Team Meridian", "2,105"],
            ].map(([r, n, s]) => (
              <div key={n} className="flex items-center gap-2 text-[9px]">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-gold-400 font-bold text-evergreen-950">{r}</span>
                <span className="flex-1 truncate text-evergreen-50">{n}</span>
                <span className="tabular-nums font-semibold text-gold-200">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 8. Schools & portals ─────────────────────── */

export function PortalPreview() {
  return (
    <div className="lp-frame bg-white">
      <div className="lp-frame-bar">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="lp-frame-url">oak-international.evalora-edu.online</span>
        <Lock className="h-2.5 w-2.5 text-ink-soft" aria-hidden />
      </div>
      <div>
        <div className="relative h-16 bg-gradient-to-br from-evergreen-800 via-evergreen-900 to-evergreen-950">
          <div className="absolute inset-x-3 bottom-2 flex items-end gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 font-display text-[11px] font-bold text-white ring-1 ring-white/20">
              OI
            </span>
            <div className="min-w-0 pb-0.5">
              <p className="truncate font-display text-[12px] font-semibold text-white">Oak International School</p>
              <p className="text-[8px] text-evergreen-100/75">School portal · Cotonou</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-2.5">
          {[
            ["Join a live quiz", "Code or QR"],
            ["Enter an examination", "Personal access code"],
            ["Student sign in", "Results & papers"],
            ["Staff sign in", "Workspace"],
          ].map(([t, s], i) => (
            <div key={t} className={`rounded-lg border px-2 py-1.5 ${i === 0 ? "border-evergreen-600 bg-evergreen-50" : "border-evergreen-900/12"}`}>
              <p className="text-[9px] font-semibold text-evergreen-950">{t}</p>
              <p className="text-[7.5px] text-ink-soft">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 9. Competition phases ────────────────────── */

export function CompetitionPreview() {
  const phases = [
    { name: "Qualifier · Class A", state: "done" },
    { name: "Qualifier · Class B", state: "live" },
    { name: "Semi-final", state: "soon" },
    { name: "Final", state: "soon" },
  ] as const;
  return (
    <div className="lp-frame bg-white">
      <div className="lp-frame-bar">
        <span className="lp-frame-lights"><span /><span /><span /></span>
        <span className="lp-frame-url">admin/competitions/events</span>
        <span className="rounded bg-evergreen-50 px-1.5 py-0.5 text-[9px] font-semibold text-evergreen-800">Event</span>
      </div>
      <div className="p-3">
        <p className="lp-panel-label">Phases &amp; question pools</p>
        <div className="mt-1.5 space-y-1">
          {phases.map((p) => (
            <div key={p.name} className="flex items-center gap-2 rounded-lg border border-evergreen-900/10 px-2 py-1.5">
              <Layers3 className="h-3 w-3 shrink-0 text-evergreen-700" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[9.5px] font-medium text-ink">{p.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-wide ${
                  p.state === "live" ? "bg-red-100 text-red-800"
                  : p.state === "done" ? "bg-emerald-100 text-emerald-800"
                  : "bg-stone-100 text-stone-600"
                }`}
              >
                {p.state === "live" ? "Live" : p.state === "done" ? "Ranked" : "Scheduled"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1 rounded-lg bg-cream px-2 py-1.5 text-[8.5px] text-ink-soft">
          <ChevronRight className="h-2.5 w-2.5 text-evergreen-700" aria-hidden />
          Ranking is always within one class — levels are never merged
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── 10. Landing hero secondary card ──────────── */

export function JourneyCard({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 backdrop-blur-sm">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-300">
        <ArrowRight className="h-3 w-3" aria-hidden /> One connected platform
      </p>
      {children}
    </div>
  );
}
