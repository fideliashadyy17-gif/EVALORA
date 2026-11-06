import { Badge, Button, Card, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { getFeatureFlags, type FeatureKey } from "@/lib/platform";
import type { Metadata } from "next";
import { saveFeatures } from "../actions";

export const metadata: Metadata = { title: "Modules & Features" };
export const dynamic = "force-dynamic";

const MODULES: { key: FeatureKey; name: string; description: string; enforcedAt: string }[] = [
  {
    key: "live_quizzes",
    name: "Live quizzes & competitions",
    description: "Hosts can start new live sessions (synchronized and self-paced). Existing sessions keep running.",
    enforcedAt: "Checked server-side in the start-session action.",
  },
  {
    key: "examinations",
    name: "Examinations",
    description: "Organizations can create new formal examinations. Existing exams and attempts are unaffected.",
    enforcedAt: "Checked server-side in the create-examination action.",
  },
  {
    key: "proctoring",
    name: "Video proctoring (LiveKit)",
    description: "New proctoring video tokens are issued to candidates and supervisors. Disabling stops new video joins platform-wide (use for incidents or quota protection).",
    enforcedAt: "Checked server-side in /api/livekit/token before any token is minted.",
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

  return (
    <>
      <PageTitle
        title="Modules & Features"
        subtitle="Platform-level switches, stored in the database and enforced on the server — never merely hidden in the UI. Per-plan feature access (e.g. which plans include proctoring) is configured in Pricing & Plans."
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Module settings saved and audit-logged.</p>}

      <form action={saveFeatures} className="space-y-4">
        {MODULES.map((m) => (
          <Card key={m.key} className="flex flex-wrap items-start justify-between gap-4 p-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-evergreen-950">{m.name}</h2>
                <Badge tone={flags[m.key] ? "green" : "red"}>{flags[m.key] ? "Enabled" : "Disabled"}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{m.description}</p>
              <p className="mt-1 text-xs text-ink-soft">{m.enforcedAt}</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" name={m.key} defaultChecked={flags[m.key]} className="h-5 w-5 accent-evergreen-700" />
              Enabled
            </label>
          </Card>
        ))}
        <Button type="submit" variant="gold">Save module settings</Button>
      </form>
    </>
  );
}
