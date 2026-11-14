import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileCheck2,
  GraduationCap,
  MonitorPlay,
  PenLine,
  Radio,
  ShieldCheck,
  Trophy,
  Users,
  Video,
  Zap,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    icon: Radio,
    title: "Live interactive quizzes",
    body: "Synchronized or self-paced quiz events with join codes, QR entry, server-run countdowns, live leaderboards and a projector view for the big screen.",
  },
  {
    icon: FileCheck2,
    title: "Assessments & examinations",
    body: "Formal exams with candidate admission, randomized questions, autosave, server-authoritative timers, automatic marking and controlled result publication.",
  },
  {
    icon: Video,
    title: "Live video proctoring",
    body: "Real LiveKit video rooms: candidates broadcast camera (and screen when required) while supervisors monitor a paginated grid and review incidents.",
  },
  {
    icon: BarChart3,
    title: "Reports & analytics",
    body: "Individual and group performance, question-level statistics, topic and difficulty analysis — exportable to CSV for Excel and PDF printing.",
  },
];

const FEATURES = [
  { icon: PenLine, title: "Question bank & studio", body: "Ten question types, KaTeX mathematics, media, categories, difficulty levels and reviewed CSV imports." },
  { icon: Clock3, title: "Fair by design", body: "Timers and scoring live on the server. Nobody gains time by tampering with their browser clock." },
  { icon: ShieldCheck, title: "Tenant isolation", body: "Every organization's data is separated with row-level security and explicit role permissions." },
  { icon: Users, title: "Roles for everyone", body: "Owners, administrators, teachers, organizers, supervisors, correctors, candidates and parents." },
  { icon: MonitorPlay, title: "Projector mode", body: "A read-only public screen showing only what the organizer approves: question, countdown, progress, rankings." },
  { icon: Zap, title: "Recovery built in", body: "Connection dropped? Participants and candidates rejoin and continue from their saved server state." },
];

export default async function HomePage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort");

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero — high-contrast editorial type with a clear product journey. */}
      <section className="public-hero relative isolate overflow-hidden border-b border-evergreen-900/10 bg-paper">
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
          <div className="relative z-10 max-w-3xl">
            <Badge tone="gold" className="mb-5">Interactive quizzes · Examinations · Online proctoring</Badge>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] text-evergreen-950 sm:text-6xl">
              Where learning is <em className="text-gold-700">assessed</em>,{" "}
              <em className="text-gold-700">examined</em> and{" "}
              <em className="text-gold-700">excelled</em>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-ink-soft">
              {BRAND.name} unites live interactive quizzes, academic assessments,
              formal examinations and real-time video proctoring in one secure
              platform — with server-side fair timing and results you can trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/register" variant="gold" className="px-6 py-3 text-base">
                Start free — create your organization
              </ButtonLink>
              <ButtonLink href="/join" variant="outline" className="px-6 py-3 text-base">
                Join a live quiz
              </ButtonLink>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              {["Server-side fair timing", "Live leaderboards", "Human-reviewed proctoring", "No account needed to participate"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-600" /> {t}
                </span>
              ))}
            </div>
          </div>
          <aside className="public-journey-card" aria-label="Assessment workflow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-200">One connected platform</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">From first question to useful feedback.</h2>
              </div>
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-gold-200 sm:flex">
                <GraduationCap aria-hidden="true" className="h-6 w-6" />
              </span>
            </div>
            <ol className="mt-7 space-y-3">
              {[
                ["01", "Build", "Create question banks, quizzes and formal papers."],
                ["02", "Run", "Host live activities or supervised examinations."],
                ["03", "Understand", "Review marks, reports and feedback before publishing."],
              ].map(([step, title, body]) => (
                <li key={step} className="public-journey-step flex items-start gap-4 rounded-2xl p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400 font-mono text-sm font-bold text-evergreen-950">{step}</span>
                  <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-evergreen-100">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 flex items-center gap-2 border-t border-white/15 pt-4 text-xs text-evergreen-100">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-gold-200" />
              Tenant-aware access and server-kept timing throughout.
            </p>
          </aside>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-evergreen-700">One platform, four engines</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-evergreen-950 sm:text-4xl">
            Everything assessment, under one roof
          </h2>
          <p className="mt-3 text-ink-soft">
            Stop stitching together a quiz app, a spreadsheet and a video call.
            {BRAND.name} runs the full journey — from authoring a question to a
            verified, published result.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PILLARS.map((p) => (
            <Card key={p.title} className="group p-6 transition hover:shadow-[var(--shadow-lift)]">
              <div className="mb-4 inline-flex rounded-xl bg-evergreen-700 p-3 text-white">
                <p.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-semibold text-evergreen-950">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works strip */}
      <section className="border-y border-evergreen-900/10 bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-evergreen-700">How it works</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-evergreen-950">
                From question bank to published results
              </h2>
            </div>
            <ButtonLink href="/how-it-works" variant="outline">See the full journey</ButtonLink>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              { n: 1, t: "Author & assemble", b: "Build a question bank, then assemble quizzes and examinations in the studio." },
              { n: 2, t: "Invite & admit", b: "Share a join code or QR code — or register formal exam candidates with personal access codes." },
              { n: 3, t: "Run it live", b: "Host synchronized rounds, watch progress, and supervise video-proctored exams in real time." },
              { n: 4, t: "Mark & publish", b: "Objective questions mark themselves; written answers go to correctors. Publish results when ready." },
            ].map((s) => (
              <li key={s.n} className="rounded-2xl border border-evergreen-900/15 bg-cream p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 font-display text-lg font-bold text-evergreen-950">{s.n}</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-evergreen-950">{s.t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-evergreen-900/15 bg-paper p-6 shadow-[var(--shadow-card)]">
              <f.icon className="h-6 w-6 text-evergreen-700" />
              <h3 className="mt-3 font-semibold text-evergreen-950">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Use cases */}
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {[
            { icon: GraduationCap, title: "Schools & teachers", body: "Energize lessons with live quizzes, track mastery by topic, and run end-of-term tests without printing a page." },
            { icon: Trophy, title: "Competitions & training centers", body: "Championship-style rounds with real-time leaderboards on the hall screen and fair, server-kept clocks." },
            { icon: Award, title: "Universities & exam boards", body: "High-stakes examinations with candidate admission, randomized papers and supervised video proctoring." },
          ].map((u) => (
            <div key={u.title} className="rounded-2xl border border-evergreen-900/15 bg-paper p-7 shadow-[var(--shadow-card)]">
              <div className="inline-flex rounded-xl bg-evergreen-700 p-3 text-white">
                <u.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold text-evergreen-950">{u.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section className="border-t border-evergreen-900/10 bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-evergreen-700">Pricing</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-evergreen-950 sm:text-4xl">
              Start free. Grow when you do.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-soft">
              Every Premium plan begins with a free trial. Payments are verified
              manually by our team — your subscription activates only after approval.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {(plans ?? []).map((p) => (
              <Card key={p.id} className={p.slug === "premium" ? "relative border-2 border-gold-500 p-7" : "p-7"}>
                {p.slug === "premium" && (
                  <Badge tone="gold" className="absolute -top-3 left-6">Most popular</Badge>
                )}
                <h3 className="font-display text-xl font-semibold text-evergreen-950">{p.name}</h3>
                <p className="mt-1 text-sm text-ink-soft">{p.description}</p>
                <p className="mt-4">
                  <span className="font-display text-4xl font-bold text-evergreen-900">
                    {money(p.price_monthly_cents, p.currency)}
                  </span>
                  <span className="text-sm text-ink-soft"> / month</span>
                </p>
                <ul className="mt-5 space-y-2">
                  {((p.features as string[]) ?? []).map((f) => (
                    <li key={f} className="flex gap-2 text-sm text-ink">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-600" /> {f}
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/register" variant={p.slug === "premium" ? "gold" : "primary"} className="mt-6 w-full">
                  {p.price_monthly_cents === 0 ? "Start free" : `Start ${p.trial_days}-day free trial`}
                </ButtonLink>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-soft">
            <Link href="/pricing" className="font-medium text-evergreen-700 underline underline-offset-2">
              Compare all plans and limits →
            </Link>
          </p>
        </div>
      </section>

      {/* CTA — the single deep-green band; solid white/evergreen-100 text only */}
      <section className="bg-evergreen-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Your next assessment is one join code away.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-evergreen-100">
            Create your organization in minutes, publish your first quiz today,
            and run your first proctored examination this week.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/register" variant="gold" className="px-6 py-3 text-base">Create free account</ButtonLink>
            <ButtonLink href="/contact" variant="outline" className="border-white/50 bg-transparent px-6 py-3 text-base text-white hover:bg-white/10">Talk to our team</ButtonLink>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
