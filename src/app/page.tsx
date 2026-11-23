import { Logo } from "@/components/Logo";
import { PlatformCredit } from "@/components/PlatformCredit";
import {
  BillingToggle,
  EngineShowcase,
  MobileNav,
  PriceValue,
  Reveal,
  RoleSwitcher,
} from "@/components/site/landing/LandingInteractive";
import {
  CandidatePaperPreview,
  CompetitionPreview,
  LiveMonitorPreview,
  LiveScreenPreview,
  MarkingPreview,
  PortalPreview,
  ProctorPreview,
  ResultsPreview,
  StudioPreview,
} from "@/components/site/landing/ProductPreviews";
import { BRAND } from "@/lib/brand";
import { getSessionContext } from "@/lib/auth";
import {
  CAPABILITY_GROUPS,
  DEPLOYMENT_FACTS,
  FOOTNOTES,
  PROOF_PILLARS,
  ROLE_WORKSPACES,
  WORKFLOW_STEPS,
} from "@/lib/landing";
import { createAdminClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://evalora-edu.online";

export const metadata: Metadata = {
  title: "EVALORA — Assessment, examination & proctoring platform for institutions",
  description:
    "EVALORA is one secure platform for live quizzes, formal examinations and human-reviewed video proctoring — with a visual mathematics editor, server-authoritative timing, automatic and corrector marking, and results you can defend.",
  alternates: { canonical: APP_URL },
  openGraph: {
    title: "EVALORA — Assess, examine and excel on one platform",
    description:
      "Live quizzes, formal examinations, optional Lockdown and human-reviewed video proctoring for schools, universities and examination boards.",
    url: APP_URL,
    siteName: BRAND.name,
    type: "website",
  },
};

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

const AUDIENCES = [
  "K-12 schools",
  "Universities & colleges",
  "Examination centres & boards",
  "Training companies",
  "Educational groups",
  "Independent educators",
  "Competition organisers",
];

const EXAMPLES = [
  {
    title: "A school's end-of-term",
    body: "Mathematics paper with KaTeX questions, per-candidate randomisation, live monitoring, a corrector queue and published scripts.",
    detail: "Exams · Marking · Reports",
  },
  {
    title: "A classroom that energises",
    body: "Synchronised quiz rounds with QR entry, a projector screen in the hall and an instant leaderboard — no accounts for students.",
    detail: "Live quizzes · Projector",
  },
  {
    title: "An examination board",
    body: "Candidate registers with personal codes, optional Windows Lockdown, video supervision with incident review and a defensible grade ledger.",
    detail: "Lockdown · Proctoring · Ledger",
  },
  {
    title: "A school-vs-school competition",
    body: "Multi-phase events, question pools per class, qualification review and rankings that never merge class levels.",
    detail: "Competitions · Pools · Rankings",
  },
];

const FAQS = [
  {
    q: "Do candidates need an account to sit an examination?",
    a: "No. A formal paper is entered with a personal access code — or an expiring exam link — issued by the institution. Live quiz participants can join with a six-character code or QR and no account at all. Organisations, teachers and staff work inside the signed-in workspace.",
  },
  {
    q: "Is Lockdown mandatory?",
    a: "Never. Lockdown is a per-examination policy, switched off by default, and it applies to the EVALORA Secure Exam Browser for Windows 10 and 11. Papers with Lockdown off run in any modern browser.",
  },
  {
    q: "Are sessions recorded?",
    a: "No. Video proctoring streams live into the supervisor grid; session recording is not enabled in this deployment. Incident observations are stored and reviewed by a person, and retention policies are configurable.",
  },
  {
    q: "How does marking work?",
    a: "Objective questions are marked by the server as soon as they are submitted. Written answers enter a corrector queue where a person awards marks against paper-specific limits, with rubrics, moderation and an append-only grade ledger.",
  },
  {
    q: "Who can create an organisation?",
    a: "Schools, universities, training centres, examination centres and independent educators can register free. Paid plans begin with a 14-day trial and activate after a manual payment check.",
  },
];

function Section({
  id,
  children,
  className = "",
  labelledBy,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={className}>
      {children}
    </section>
  );
}

/**
 * Pricing is public marketing data, so it is read with the service-role client
 * on the server. That keeps the landing page identical for signed-out visitors
 * and crawlers even while the anonymous key is being rotated, and it avoids a
 * second Supabase round-trip inside the public RLS path.
 */
type PublicPlan = typeof FALLBACK_PLANS[number];

const PLAN_CACHE_MS = 60_000;
const PLAN_TIMEOUT_MS = 2_000;
let planCache: { at: number; plans: PublicPlan[] } | null = null;

async function loadPublicPlans(): Promise<PublicPlan[] | null> {
  if (planCache && Date.now() - planCache.at < PLAN_CACHE_MS) return planCache.plans;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const query = createAdminClient()
      .from("plans")
      .select("id, slug, name, description, price_monthly_cents, price_yearly_cents, currency, trial_days, features, sort")
      .eq("is_active", true)
      .order("sort");
    // A marketing page must never wait on the database. If the catalogue does
    // not answer quickly, the verified fallback renders immediately.
    const result = await Promise.race([
      query,
      new Promise<{ data: null; error: Error }>((resolve) => {
        timer = setTimeout(() => resolve({ data: null, error: new Error("plan timeout") }), PLAN_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (result.error || !result.data?.length) return null;
    planCache = { at: Date.now(), plans: result.data as PublicPlan[] };
    return planCache.plans;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Shown only if the catalogue cannot be read; never invents prices or limits. */
const FALLBACK_PLANS = [
  {
    id: "fallback-free",
    slug: "free",
    name: "Free",
    description: "For individual teachers getting started with interactive quizzes.",
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    currency: "USD",
    trial_days: 0,
    features: ["Up to 5 quizzes", "30 participants per live session", "Question bank (100 questions)", "Basic results & CSV export", "2 examinations"],
    sort: 1,
  },
  {
    id: "fallback-premium",
    slug: "premium",
    name: "Premium",
    description: "For schools and training centres that need examinations and proctoring.",
    price_monthly_cents: 1900,
    price_yearly_cents: 19000,
    currency: "USD",
    trial_days: 14,
    features: ["Unlimited quizzes & questions", "500 participants per live session", "Video proctoring with LiveKit", "Advanced analytics & exports", "Manual marking workflows", "50 team members"],
    sort: 2,
  },
  {
    id: "fallback-institution",
    slug: "institution",
    name: "Institution",
    description: "For universities and examination boards running assessments at scale.",
    price_monthly_cents: 7900,
    price_yearly_cents: 79000,
    currency: "USD",
    trial_days: 14,
    features: ["Everything in Premium", "1,000 participants per live session", "Unlimited team members", "Priority support & onboarding", "Institutional class & student management", "Centralised resources & quotas"],
    sort: 3,
  },
];

/**
 * Whether to offer "Open console" instead of "Sign in".
 *
 * Only asked when the request actually carries a Supabase auth cookie — a
 * first-time visitor triggers zero session round-trips, which keeps the
 * marketing page fast for crawlers and cold traffic.
 */
async function resolveSignedIn(request: { cookies: { getAll(): { name: string }[] } } | null) {
  try {
    const cookieNames = request?.cookies.getAll().map((c) => c.name) ?? [];
    const hasAuthCookie = cookieNames.some((name) => name.startsWith("sb-") && name.includes("auth-token"));
    if (!hasAuthCookie) return false;
    const session = await getSessionContext();
    return Boolean(session);
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const { cookies } = await import("next/headers");
  const [livePlans, cookieStore] = await Promise.all([loadPublicPlans(), cookies()]);
  const authed = await resolveSignedIn({ cookies: { getAll: () => cookieStore.getAll() } });
  const plans = livePlans ?? FALLBACK_PLANS;

  return (
    <div className="evalora-landing min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ───────────────────────── Navigation ───────────────────────── */}
      <header className="lp-header sticky top-0 z-40 border-b border-white/10 bg-[#042315]/92 text-white backdrop-blur-md">
        <div className="lp-shell flex h-[4.25rem] items-center justify-between gap-4">
          <Logo variant="light" />
          <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-[0.85rem] font-medium text-evergreen-100 transition hover:bg-white/10 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <a href="/join" className="rounded-lg px-3 py-2 text-[0.85rem] font-medium text-evergreen-100 transition hover:bg-white/10 hover:text-white">
              Join a quiz
            </a>
            {authed ? (
              <a href="/auth/resolve" className="lp-btn lp-btn--gold !min-h-0 !px-4 !py-2 !text-[0.82rem]">
                Open console
              </a>
            ) : (
              <>
                <a href="/login" className="lp-btn lp-btn--onDark !min-h-0 !px-4 !py-2 !text-[0.82rem]">
                  Sign in
                </a>
                <a href="/register" className="lp-btn lp-btn--gold !min-h-0 !px-4 !py-2 !text-[0.82rem]">
                  Get started free
                </a>
              </>
            )}
          </div>
          <MobileNav
            links={[
              ...NAV_LINKS,
              { href: "/join", label: "Join a live quiz" },
              { href: "/exam-access", label: "Enter an examination" },
            ]}
            authed={authed}
          />
        </div>
      </header>

      <main id="main-content">
        {/* ───────────────────────── Hero ───────────────────────── */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-shell relative z-10 grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:py-24">
            <div className="lp-hero-copy">
              <span className="lp-hero-chip">
                <span className="lp-hero-dot" aria-hidden />
                Live quizzes · Examinations · Human-reviewed proctoring
              </span>
              <h1 id="hero-title" className="mt-6">
                Where learning is <em>assessed</em>, <em>examined</em> and <em>excelled</em>.
              </h1>
              <p className="mt-6 max-w-xl text-[1.02rem] leading-relaxed text-evergreen-100/90 sm:text-[1.08rem]">
                One secure platform for schools, universities and examination boards:
                author with real mathematics, run live or high-stakes papers on a server-owned
                clock, supervise with evidence, and publish results you can defend.
              </p>
              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <a href="/register" className="lp-btn lp-btn--gold text-[0.95rem]">
                  Create your organisation — free
                  <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <a href="/exam-access" className="lp-btn lp-btn--onDark text-[0.95rem]">
                  Enter an examination
                </a>
                <a href="/join" className="px-1 py-2 text-[0.86rem] font-semibold text-evergreen-100 underline decoration-gold-400/60 decoration-2 underline-offset-4 transition hover:text-white">
                  Join a live quiz →
                </a>
              </div>

              <dl className="lp-hero-proof mt-9 border-t border-white/12 pt-6">
                {DEPLOYMENT_FACTS.map((f) => (
                  <div key={f.k}>
                    <dt>{f.v}</dt>
                    <dd>{f.k}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.72rem] text-evergreen-200/80">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-gold-400" aria-hidden /> No credit card to start
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-gold-400" aria-hidden /> 14-day Premium trial
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-gold-400" aria-hidden /> Participants need no account
                </span>
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
              <CandidatePaperPreview />
            </div>
          </div>

          {/* audience strip */}
          <div className="relative z-10 border-t border-white/10 bg-black/15 py-4">
            <div className="lp-shell flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <p className="shrink-0 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-evergreen-200/70">
                Built for
              </p>
              <div className="lp-marquee min-w-0">
                <div className="lp-marquee-track items-center gap-6">
                  {[...AUDIENCES, ...AUDIENCES].map((a, i) => (
                    <span key={`${a}-${i}`} className="flex items-center gap-6 whitespace-nowrap text-[0.8rem] font-medium text-evergreen-100/85">
                      {a}
                      <span className="h-1 w-1 rounded-full bg-gold-500/60" aria-hidden />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────────────── Engines ───────────────────────── */}
        <Section id="platform" labelledBy="platform-title" className="lp-shell py-16 sm:py-20 lg:py-24">
          <Reveal>
            <p className="lp-eyebrow">One platform, four engines</p>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <h2 id="platform-title" className="lp-h2 max-w-2xl">
                Authoring, delivery, marking and integrity — joined up.
              </h2>
              <p className="lp-lead max-w-sm lg:text-right">
                Stop stitching a quiz app, a spreadsheet and a video call together. EVALORA carries
                the same question from studio to published mark.
              </p>
            </div>
          </Reveal>

          <Reveal className="mt-10" delay={60}>
            <div className="lp-showcase">
              <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:gap-10">
                <EngineShowcase
                  previews={{
                    livescreen: <LiveScreenPreview />,
                    monitor: <LiveMonitorPreview />,
                    proctor: <ProctorPreview />,
                    results: <ResultsPreview />,
                  }}
                  items={[
                    {
                      id: "quizzes",
                      tab: "Live quizzes",
                      kicker: "Interactive delivery",
                      title: "A classroom that answers back",
                      body:
                        "Synchronised rounds the host releases question by question, or self-paced practice. Participants join by six-character code or QR — no account, no download.",
                      bullets: [
                        "Host control: admit, release, pause, reveal answers, rankings, final podium",
                        "Server-timed countdowns and ranking with a speed factor in synchronised mode",
                        "Token-protected projector screen for the hall — a join code never opens it",
                        "Idempotent answers: a reconnecting device can never double-count",
                      ],
                      note: "Live sessions verified in production: join codes, QR entry and host controls.",
                      panelId: "livescreen",
                    },
                    {
                      id: "exams",
                      tab: "Examinations",
                      kicker: "Formal assessment",
                      title: "Papers with a clock nobody can argue with",
                      body:
                        "Assemble a formal examination from the bank, register candidates individually or in bulk, and issue personal access codes. Every candidate gets a server-computed paper, deadline and autosave.",
                      bullets: [
                        "Per-candidate randomisation of question and option order",
                        "Autosave queue with explicit pending, saved and failed states",
                        "Automatic submission at the server deadline — browser clocks are irrelevant",
                        "Resume after a dropped connection from the last confirmed save",
                      ],
                      note: "Candidates can flag questions for review and message the supervisor without leaving the paper.",
                      panelId: "monitor",
                    },
                    {
                      id: "proctoring",
                      tab: "Proctoring",
                      kicker: "LiveKit video rooms",
                      title: "Supervision that produces evidence, not verdicts",
                      body:
                        "Candidates publish camera and, when the paper requires it, screen share. Supervisors watch a paginated live grid while every join, drop and reconnect is timestamped.",
                      bullets: [
                        "Room tokens minted server-side and bound to one attempt",
                        "Supervisor grid with per-candidate connection state and focus view",
                        "Incident workflow: open → investigating → confirmed or dismissed",
                        "Configurable retention policies with a reviewable run history",
                      ],
                      note: "Session recording is not enabled in this deployment; the grid is live supervision only.",
                      panelId: "proctor",
                    },
                    {
                      id: "marking",
                      tab: "Marking & results",
                      kicker: "From answer to defended mark",
                      title: "Marking that leaves a trail",
                      body:
                        "Objective items mark themselves on the server. Written answers go to correctors with paper-specific limits, rubrics and moderation. Publication is a deliberate act, not a side effect.",
                      bullets: [
                        "Numeric answer normalisation and multi-part breakdowns",
                        "Rubrics, grading assignments, moderation records",
                        "Append-only grade ledger: every change attributed, never rewritten",
                        "Candidate result links with worked solutions and printable scripts",
                      ],
                      note: "MYP schools can map A–D criteria to achievement levels and an overall 1–7 grade.",
                      panelId: "results",
                    },
                  ]}
                />
                <div>
                  <StudioPreview />
                  <MarkingPreview />
                  <p className="mt-3 text-center text-[0.68rem] leading-relaxed text-ink-soft">
                    Interface previews redrawn from the shipped application — not mockups of a future product.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROOF_PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 60}>
                <article className="lp-cap h-full">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-evergreen-700">{p.tag}</p>
                  <h3 className="mt-2 font-display text-[1.02rem] font-semibold leading-snug text-evergreen-950">{p.title}</h3>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-ink-soft">{p.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ───────────────────────── How it flows ───────────────────────── */}
        <Section id="journey" labelledBy="journey-title" className="relative overflow-hidden border-y border-evergreen-900/10 bg-[#f7f5ee]">
          <div className="lp-shell py-16 sm:py-20 lg:py-24">
            <Reveal>
              <p className="lp-eyebrow">The assessment journey</p>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                <h2 id="journey-title" className="lp-h2 max-w-xl">
                  Six steps from a blank question to a published result.
                </h2>
                <p className="lp-lead max-w-md lg:justify-self-end">
                  Each step is a real screen in the product, available to the role that owns it —
                  with the same permissions enforced on the server.
                </p>
              </div>
            </Reveal>

            <div className="relative mt-12">
              <div className="lp-step-line hidden lg:block" aria-hidden />
              <ol className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-6">
                {WORKFLOW_STEPS.map((s, i) => (
                  <Reveal as="li" key={s.step} delay={i * 70} className="lp-step group relative">
                    <span className="lp-step-num relative z-10">{s.step}</span>
                    <h3 className="mt-4 font-display text-[1.1rem] font-semibold text-evergreen-950">{s.title}</h3>
                    <p className="mt-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-gold-700">{s.line}</p>
                    <p className="mt-2 text-[0.83rem] leading-relaxed text-ink-soft">{s.body}</p>
                  </Reveal>
                ))}
              </ol>
            </div>

            <Reveal className="mt-12">
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-evergreen-900/12 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <p className="max-w-2xl text-[0.9rem] leading-relaxed text-ink">
                  <strong className="font-semibold text-evergreen-950">Fairness is architectural, not cosmetic.</strong>{" "}
                  The server — never a participant&apos;s device — owns the clock, validates every submission
                  window and computes every score, so a modified browser gains nothing.
                </p>
                <a href="/how-it-works" className="lp-btn lp-btn--ghost shrink-0">
                  See the full journey
                </a>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ───────────────────────── Roles ───────────────────────── */}
        <Section id="roles" labelledBy="roles-title" className="lp-shell py-16 sm:py-20 lg:py-24">
          <Reveal>
            <p className="lp-eyebrow">Four workspaces, one product</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <h2 id="roles-title" className="lp-h2 max-w-xl">
                Everyone sees exactly the job they were given.
              </h2>
              <p className="lp-lead max-w-md lg:justify-self-end">
                Navigation follows the verified organisation role. Hiding a link is never the security
                boundary — every page and server action re-checks the permission.
              </p>
            </div>
          </Reveal>
          <Reveal className="mt-10" delay={60}>
            <RoleSwitcher roles={ROLE_WORKSPACES} />
          </Reveal>
          <Reveal className="mt-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Ten organisation roles", "Owner, administrator, teacher, organiser, supervisor, corrector, participant, candidate, parent, student."],
                ["Invitations by email", "Staff and teachers join through a tokenised invitation and land in the right workspace."],
                ["Server-enforced capability", "Plan entitlements and feature flags resolve on the server before any write."],
              ].map(([t, b]) => (
                <div key={t} className="rounded-xl border border-evergreen-900/10 bg-white px-4 py-3.5">
                  <p className="text-[0.8rem] font-semibold text-evergreen-950">{t}</p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-soft">{b}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* ───────────────────────── Capabilities ───────────────────────── */}
        <Section id="capabilities" labelledBy="capabilities-title" className="border-y border-evergreen-900/10 bg-[#f7f5ee]">
          <div className="lp-shell py-16 sm:py-20 lg:py-24">
            <Reveal>
              <p className="lp-eyebrow">Verified capability inventory</p>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                <h2 id="capabilities-title" className="lp-h2 max-w-xl">
                  Everything that actually ships — nothing that doesn&apos;t.
                </h2>
                <p className="lp-lead max-w-md lg:justify-self-end">
                  This list is reviewed against the running product. Features still in development are
                  not advertised here.
                </p>
              </div>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CAPABILITY_GROUPS.map((group, i) => (
                <Reveal key={group.key} delay={(i % 3) * 60}>
                  <article className="lp-showcase h-full !p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-[1.15rem] font-semibold text-evergreen-950">{group.title}</h3>
                        <p className="text-[0.75rem] text-ink-soft">{group.blurb}</p>
                      </div>
                      <span className="rounded-md bg-evergreen-950 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-gold-300">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2.5">
                      {group.items.map((item) => (
                        <li key={item.name} className="flex gap-2">
                          <svg viewBox="0 0 20 20" aria-hidden className="mt-[0.15rem] h-3.5 w-3.5 shrink-0 text-evergreen-600" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M4 10.5l4 4 8-8.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="min-w-0">
                            <span className="block text-[0.84rem] font-semibold leading-snug text-evergreen-950">{item.name}</span>
                            <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-soft">{item.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-5">
              <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-evergreen-900/10 bg-white px-5 py-4 sm:flex-row sm:items-center">
                <p className="text-[0.78rem] leading-relaxed text-ink-soft">
                  Looking for AI question generation, scanned-paper marking, SIS sync or session
                  recording? Those are on the roadmap — not in this release, and not sold as shipped.
                </p>
                <a href="/features" className="shrink-0 text-[0.82rem] font-semibold text-evergreen-800 underline decoration-gold-500 decoration-2 underline-offset-4">
                  Read the feature breakdown →
                </a>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ───────────────────────── Candidate experience ───────────────────────── */}
        <Section id="candidates" labelledBy="candidates-title" className="lp-shell py-16 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-14">
            <Reveal>
              <p className="lp-eyebrow">The candidate experience</p>
              <h2 id="candidates-title" className="lp-h2 mt-3 max-w-lg">
                Calm enough to concentrate. Strict enough to be fair.
              </h2>
              <p className="lp-lead mt-4">
                Candidates meet one clear paper: the question, the marks, the clock and the state of
                their saves. Nothing decorative competes with the work.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  ["Server-owned countdown", "Remaining time is derived from a server deadline and a measured offset — not the device clock."],
                  ["Save states you can trust", "Every answer moves through queued, saved and failed states, with an explicit warning before anything is lost."],
                  ["Recovery after a drop", "Reconnect and continue from confirmed server state, including paused papers where the paper allows it."],
                  ["Answer tools for real subjects", "Visual mathematics, graph, geometry, statistics, Venn, probability trees, stem-and-leaf, tables and science units."],
                ].map(([t, b]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                    <span>
                      <span className="block text-[0.9rem] font-semibold text-evergreen-950">{t}</span>
                      <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-ink-soft">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="/exam-access" className="lp-btn lp-btn--forest">
                  Try the examination check-in
                </a>
                <a href="/join" className="lp-btn lp-btn--ghost">
                  Join a live quiz
                </a>
              </div>
            </Reveal>
            <Reveal delay={80} className="space-y-4">
              <CandidatePaperPreview />
              <div className="grid gap-4 sm:grid-cols-2">
                <ResultsPreview />
                <div className="rounded-xl border border-evergreen-900/10 bg-white p-4">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-evergreen-700">
                    Answer tools available on a paper
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      "Writing", "Mathematics", "Tables", "Data table", "Science & units",
                      "Graph", "Geometry", "Statistics", "Venn", "Probability tree", "Stem & leaf",
                    ].map((t) => (
                      <span key={t} className="rounded-md border border-evergreen-900/10 bg-cream/70 px-2 py-0.5 text-[0.7rem] font-medium text-evergreen-900">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-soft">
                    Tools are chosen per question by the author, or derived automatically from the
                    question&apos;s language. Objective questions keep their native interface.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-evergreen-900/10 bg-cream/70 px-4 py-3 text-[0.75rem] leading-relaxed text-ink-soft">
                <strong className="font-semibold text-evergreen-950">Honest scope:</strong> Lockdown is a
                per-examination policy using the EVALORA Secure Exam Browser for Windows 10 and 11. In-page
                clipboard controls also stop copy, paste and context menus — they cannot stop a second device
                or a screenshot, and we do not pretend otherwise.
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ───────────────────────── Institutions ───────────────────────── */}
        <Section id="institutions" labelledBy="institutions-title" className="relative overflow-hidden bg-[#062719] text-white">
          <div className="lp-shell py-16 sm:py-20 lg:py-24">
            <Reveal>
              <p className="lp-eyebrow lp-eyebrow--light">Institution &amp; operations</p>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                <h2 id="institutions-title" className="max-w-xl font-display text-[clamp(1.95rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-white">
                  The school, the portal and the money — in the same place.
                </h2>
                <p className="max-w-md text-[0.95rem] leading-relaxed text-evergreen-100/80 lg:justify-self-end">
                  Students, staff, classes and academic structure are first-class records, not
                  free-text fields. Every organisation gets its own branded portal and plan.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-start">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Students & enrolment", "Records, class enrolment, bulk import from CSV, XLSX, PDF, DOCX or TXT with an extraction review step."],
                  ["Classes & curriculum", "Classes, subjects, curricula, academic years, departments and education levels."],
                  ["Staff & permissions", "Teachers, organisers, supervisors and correctors with invitations and a capability matrix."],
                  ["Branded school portal", "A public portal per organisation on its own subdomain or path, with its own sign-in."],
                  ["Billing & plan", "Free, Premium and Institution tiers with live limits, trials and manual verification."],
                  ["MYP reporting", "Criterion A–D achievement levels and an overall 1–7 grade, exported to Excel or PDF."],
                ].map(([t, b], i) => (
                  <Reveal key={t} delay={i * 50}>
                    <div className="h-full rounded-xl border border-white/12 bg-white/[0.05] p-4">
                      <p className="text-[0.86rem] font-semibold text-white">{t}</p>
                      <p className="mt-1 text-[0.76rem] leading-relaxed text-evergreen-100/75">{b}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
              <Reveal delay={80} className="space-y-4">
                <PortalPreview />
                <CompetitionPreview />
              </Reveal>
            </div>
          </div>
        </Section>

        {/* ───────────────────────── Use cases ───────────────────────── */}
        <Section id="use-cases" labelledBy="use-cases-title" className="lp-shell py-16 sm:py-20 lg:py-24">
          <Reveal>
            <p className="lp-eyebrow">In practice</p>
            <h2 id="use-cases-title" className="lp-h2 mt-3 max-w-2xl">
              Four rooms, one platform.
            </h2>
          </Reveal>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXAMPLES.map((u, i) => (
              <Reveal key={u.title} delay={i * 60}>
                <article className="lp-cap h-full">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-gold-700">{u.detail}</p>
                  <h3 className="mt-2 font-display text-[1.05rem] font-semibold text-evergreen-950">{u.title}</h3>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-ink-soft">{u.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ───────────────────────── Pricing ───────────────────────── */}
        <Section id="pricing" labelledBy="pricing-title" className="border-y border-evergreen-900/10 bg-[#f7f5ee]">
          <div className="lp-shell py-16 sm:py-20 lg:py-24" id="lp-pricing" data-billing="yearly">
            <Reveal>
              <p className="lp-eyebrow">Pricing</p>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                <h2 id="pricing-title" className="lp-h2 max-w-xl">
                  Start free. Grow when the term does.
                </h2>
                <p className="lp-lead max-w-md lg:justify-self-end">
                  Every paid plan begins with a 14-day trial. Payment is verified by our team, so a
                  subscription activates only after approval — never by surprise.
                </p>
              </div>
              <div className="mt-6">
                <BillingToggle monthlyLabel="Monthly" yearlyLabel="Yearly" />
              </div>
            </Reveal>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {plans.map((p, i) => {
                const featured = p.slug === "premium";
                return (
                  <Reveal key={p.id} delay={i * 70}>
                    <article className={`lp-price h-full ${featured ? "lp-price--featured" : ""}`}>
                      {featured && (
                        <span className="absolute -top-3 left-5 rounded-full bg-gold-500 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-evergreen-950">
                          Most popular
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-[1.25rem] font-semibold text-evergreen-950">{p.name}</h3>
                        {p.trial_days > 0 && (
                          <span className="rounded-full border border-evergreen-900/12 bg-white px-2 py-0.5 text-[0.62rem] font-semibold text-evergreen-800">
                            {p.trial_days}-day trial
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 min-h-[2.6rem] text-[0.8rem] leading-snug text-ink-soft">{p.description}</p>
                      <PriceValue
                        monthly={money(p.price_monthly_cents, p.currency)}
                        yearly={money(p.price_yearly_cents, p.currency)}
                        suffix={p.price_monthly_cents === 0 ? "/ forever" : "/ year"}
                      />
                      <ul className="mt-4 flex-1 space-y-2">
                        {((p.features as string[]) ?? []).slice(0, featured ? 6 : 5).map((f) => (
                          <li key={f} className="flex gap-2 text-[0.82rem] leading-snug text-ink">
                            <svg viewBox="0 0 20 20" aria-hidden className="mt-[0.15rem] h-3.5 w-3.5 shrink-0 text-evergreen-600" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <path d="M4 10.5l4 4 8-8.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <a
                        href="/register"
                        className={`lp-btn mt-6 w-full ${featured ? "lp-btn--gold" : "lp-btn--ghost"}`}
                      >
                        {p.price_monthly_cents === 0 ? "Start free" : "Start free trial"}
                      </a>
                    </article>
                  </Reveal>
                );
              })}
            </div>

            <Reveal className="mt-6">
              <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-evergreen-900/10 bg-white px-5 py-4 sm:flex-row sm:items-center">
                <p className="text-[0.8rem] text-ink-soft">
                  Need the exact limits — participants, storage, team members, proctoring?
                </p>
                <a href="/pricing" className="lp-btn lp-btn--ghost !min-h-0 !py-2">
                  Compare every plan limit
                </a>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ───────────────────────── FAQ ───────────────────────── */}
        <Section id="faq" labelledBy="faq-title" className="lp-shell py-16 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <Reveal>
              <p className="lp-eyebrow">Straight answers</p>
              <h2 id="faq-title" className="lp-h2 mt-3 max-w-sm">
                The questions institutions actually ask.
              </h2>
              <p className="lp-lead mt-3 text-[0.92rem]">
                Still unsure? Read the{" "}
                <a href="/help" className="font-semibold text-evergreen-800 underline decoration-gold-500 decoration-2 underline-offset-4">
                  help centre
                </a>{" "}
                or{" "}
                <a href="/contact" className="font-semibold text-evergreen-800 underline decoration-gold-500 decoration-2 underline-offset-4">
                  talk to our team
                </a>
                .
              </p>
            </Reveal>
            <div className="divide-y divide-evergreen-900/10 rounded-2xl border border-evergreen-900/10 bg-white">
              {FAQS.map((f) => (
                <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.92rem] font-semibold text-evergreen-950">
                    {f.q}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-evergreen-900/15 text-evergreen-700 transition group-open:rotate-45">
                      <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-2.5 max-w-2xl text-[0.85rem] leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>

        {/* ───────────────────────── CTA ───────────────────────── */}
        <Section id="start" labelledBy="cta-title" className="lp-shell pb-16 sm:pb-20">
          <Reveal>
            <div className="lp-cta">
              <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold-300">
                    Assess · Examine · Excel
                  </p>
                  <h2 id="cta-title" className="mt-3 max-w-xl font-display text-[clamp(1.9rem,3.3vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-white">
                    Your next assessment is one join code away.
                  </h2>
                  <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed text-evergreen-100/85">
                    Create your organisation in minutes, publish a first quiz today, and run a
                    proctored examination this week. No credit card, no installation for students.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <a href="/register" className="lp-btn lp-btn--gold">
                      Create free account
                    </a>
                    <a href="/contact" className="lp-btn lp-btn--onDark">
                      Talk to our team
                    </a>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-5">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-300">Also free to try</p>
                  <div className="mt-3 space-y-2.5">
                    {[
                      ["/join", "Join a live quiz with a code"],
                      ["/exam-access", "Enter an examination with a candidate code"],
                      ["/pricing", "Compare the three plans"],
                    ].map(([href, label]) => (
                      <a
                        key={href}
                        href={href}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[0.83rem] font-medium text-evergreen-50 transition hover:border-gold-400/40 hover:bg-white/10"
                      >
                        {label}
                        <span aria-hidden className="text-gold-300">→</span>
                      </a>
                    ))}
                  </div>
                  <p className="mt-4 text-[0.68rem] leading-relaxed text-evergreen-200/70">
                    Every mark is computed on the server, and every save is confirmed before it counts.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </Section>
      </main>

      {/* ───────────────────────── Footer ───────────────────────── */}
      <footer className="border-t border-evergreen-900/10 bg-[#042315] text-evergreen-100">
        <div className="lp-shell py-14">
          <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
            <div>
              <Logo variant="light" />
              <p className="mt-4 max-w-xs text-[0.82rem] leading-relaxed text-evergreen-100/80">
                {BRAND.tagline}. One secure platform for schools, universities, training centres and
                examination organisations.
              </p>
              <p className="mt-4 text-[0.78rem] text-evergreen-200/70">{BRAND.supportEmail}</p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {["Server-authoritative timing", "Tenant-isolated", "Human-reviewed"].map((t) => (
                  <span key={t} className="rounded-full border border-white/12 px-2 py-0.5 text-[0.62rem] text-evergreen-100/80">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {[
              {
                title: "Platform",
                links: [
                  ["/features", "Features"],
                  ["/how-it-works", "How it works"],
                  ["/use-cases", "Use cases"],
                  ["/pricing", "Pricing"],
                  ["/faq", "FAQ"],
                ],
              },
              {
                title: "Get started",
                links: [
                  ["/register", "Create an organisation"],
                  ["/login", "Sign in"],
                  ["/join", "Join a live quiz"],
                  ["/exam-access", "Enter an examination"],
                  ["/download/secure-browser", "Secure Exam Browser"],
                ],
              },
              {
                title: "Support",
                links: [
                  ["/help", "Help centre"],
                  ["/contact", "Contact us"],
                  ["/faq", "FAQ"],
                  ["/how-it-works", "Getting started guide"],
                ],
              },
              {
                title: "Legal",
                links: [
                  ["/privacy", "Privacy policy"],
                  ["/terms", "Terms & conditions"],
                  ["/cookies", "Cookie policy"],
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <h2 className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-gold-400">{col.title}</h2>
                <ul className="mt-3 space-y-2">
                  {col.links.map(([href, label]) => (
                    <li key={href}>
                      <a
                        href={href}
                        className="text-[0.8rem] text-evergreen-100/85 transition hover:text-white hover:underline hover:underline-offset-4"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 space-y-1.5 border-t border-white/12 pt-5">
            {FOOTNOTES.map((f) => (
              <p key={f} className="text-[0.68rem] leading-relaxed text-evergreen-200/60">
                {f}
              </p>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[0.7rem] text-evergreen-200/70">
            <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
            <PlatformCredit tone="inverse" className="text-evergreen-200/70" />
            <span className="flex items-center gap-2">
              Hosted on Vercel · Data in Supabase · Video by LiveKit
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
