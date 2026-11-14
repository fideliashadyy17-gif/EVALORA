import { Badge, Button, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { getFeatureFlags, type FeatureKey } from "@/lib/platform";
import { Blocks, Radio, ShieldCheck, Video } from "lucide-react";
import type { Metadata } from "next";
import { saveFeatures } from "../actions";

export const metadata: Metadata = { title: "Modules & Features" };
export const dynamic = "force-dynamic";

const MODULES: {
  key: FeatureKey;
  name: string;
  scope: string;
  description: string;
  enforcedAt: string;
  impactWhenDisabled: string;
}[] = [
  {
    key: "live_quizzes",
    name: "Live quizzes & competitions",
    scope: "Real-time synchronous & self-paced rooms",
    description: "Controls whether hosts can launch new live quiz and competition sessions across all organizations.",
    enforcedAt: "Checked server-side in startSession and competition launch actions.",
    impactWhenDisabled: "Existing live sessions continue safely; starting new live rooms is temporarily blocked.",
  },
  {
    key: "examinations",
    name: "Formal examinations",
    scope: "Scheduled papers, links & candidate attempts",
    description: "Controls creation of new formal examinations across tenant workspaces.",
    enforcedAt: "Checked server-side in createExam actions before persisting new exam records.",
    impactWhenDisabled: "Active examinations, candidate check-ins, autosaves and submissions remain 100% operational.",
  },
  {
    key: "proctoring",
    name: "Video proctoring (LiveKit)",
    scope: "Candidate camera, microphone & screen supervision",
    description: "Controls minting of new LiveKit video room tokens for candidates and proctors platform-wide.",
    enforcedAt: "Checked server-side in /api/livekit/token before any room token is minted.",
    impactWhenDisabled: "Candidates can still sit and submit papers without interruption; new video joins are paused.",
  },
];

export default async function AdminModules({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const flags = await getFeatureFlags();
  const enabledCount = MODULES.filter((m) => flags[m.key]).length;

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Feature Gates & Kill Switches"
        title="Modules & Features"
        subtitle="Authoritative platform-wide switches persisted in PostgreSQL and enforced server-side. Per-plan entitlements (such as which subscription tier includes proctoring) are managed separately in Subscription Plans."
        action={
          <>
            <ButtonLink href="/admin/plans" variant="outline">Subscription plans</ButtonLink>
            <ButtonLink href="/admin/settings" variant="outline">Platform settings</ButtonLink>
          </>
        }
      />

      {sp.saved && (
        <p role="status" className="mb-5 rounded-xl bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900 ring-1 ring-evergreen-600/30">
          Module switches saved and recorded in the security audit log.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Enabled modules" value={`${enabledCount} / ${MODULES.length}`} hint="Active platform capabilities" icon={<Blocks className="h-5 w-5" />} />
        <StatCard label="Live & Exam Gate" value={flags.live_quizzes && flags.examinations ? "Nominal" : "Restricted"} hint="Assessment creation gates" icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Video Proctoring" value={flags.proctoring ? "Active" : "Paused"} hint="LiveKit token issuance" icon={<Video className="h-5 w-5" />} />
      </div>

      <form action={saveFeatures} className="space-y-4">
        {MODULES.map((m) => {
          const on = Boolean(flags[m.key]);
          return (
            <Card key={m.key} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={on ? "green" : "red"}>{on ? "Enabled" : "Disabled"}</Badge>
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{m.scope}</span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-semibold text-evergreen-950">{m.name}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{m.description}</p>
                  <div className="mt-3 grid gap-2 rounded-xl border border-evergreen-900/10 bg-cream/70 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-evergreen-950">Enforcement point: </span>
                      <span className="text-ink-soft">{m.enforcedAt}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-evergreen-950">Safety guarantee when off: </span>
                      <span className="text-ink-soft">{m.impactWhenDisabled}</span>
                    </div>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-evergreen-900/20 bg-cream px-4 py-3 text-sm font-semibold text-evergreen-950 transition hover:bg-evergreen-50">
                  <input type="checkbox" name={m.key} defaultChecked={on} className="h-5 w-5 accent-evergreen-700" />
                  <span>Allow {m.key.replace(/_/g, " ")}</span>
                </label>
              </div>
            </Card>
          );
        })}

        <Card className="flex flex-wrap items-center justify-between gap-4 border-evergreen-700/25 bg-evergreen-50/70 p-5">
          <div className="flex items-center gap-3 text-sm text-evergreen-950">
            <ShieldCheck className="h-5 w-5 shrink-0 text-evergreen-700" />
            <span>Every toggle update writes an immutable audit entry with actor identity and previous/new state.</span>
          </div>
          <Button type="submit" variant="gold">Save module settings</Button>
        </Card>
      </form>
    </>
  );
}
