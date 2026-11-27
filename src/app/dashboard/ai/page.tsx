import type { Metadata } from "next";
import { PageTitle, Badge, Card } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { describeCoreProvider } from "@/lib/ai/provider";
import { loadOrgGrounding } from "./grounding";
import { AssistantClient } from "./AssistantClient";

export const metadata: Metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

/**
 * The native assistant.
 *
 * Gated on `ai.use` at the page level as well as inside the action, so a user
 * without the permission never sees a composer that would refuse them. The
 * grounding strip shows the live counts the assistant reads, so a teacher can
 * see whether it is working from real workspace data.
 */
export default async function AiAssistantPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Server-side module gate: the sidebar hides the entry, this refuses the URL.
  const { entitlement } = await getCapabilities(await createClient(), ctx, org.id);
  requireModule(entitlement, "ai_assistant", "/dashboard?e=module");
  const [canUse, canManageAgents, grounding] = await Promise.all([
    canOperate(ctx, org.id, "ai.use"),
    canOperate(ctx, org.id, "ai.manage_agents"),
    loadOrgGrounding(org.id),
  ]);
  const provider = describeCoreProvider();

  if (!canUse) {
    return (
      <div className="space-y-4">
        <PageTitle title="AI Assistant" subtitle="One intelligent workspace for EVALORA." />
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-900">The assistant is not enabled for your role</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Using the assistant requires the <code className="font-mono text-xs">ai.use</code> permission. An administrator can
            grant it in Role &amp; Access Management. Nothing about your workspace has changed.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow={<Badge tone={provider.configured ? "gold" : "gray"}>{provider.configured ? `Model: ${provider.provider}` : "Deterministic engine"}</Badge>}
        title="AI Assistant"
        subtitle="Ask EVALORA to draft an examination, generate questions, check a paper, analyse results or prepare a marking scheme — using the same services, permissions and rules as the rest of the workspace."
        action={
          canManageAgents ? (
            <a
              href="/dashboard/ai/agents"
              className="rounded-xl border border-evergreen-900/25 px-3 py-2 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50"
            >
              Agents &amp; approvals
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Classes", value: grounding.classes },
          { label: "Subjects", value: grounding.subjects },
          { label: "Questions", value: grounding.questions },
          { label: "Examinations", value: grounding.examinations },
        ].map((item) => (
          <Card key={item.label} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-ink-soft">{item.label}</p>
            <p className="font-display text-2xl font-semibold text-evergreen-900">{item.value}</p>
          </Card>
        ))}
      </div>

      {grounding.notes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-900">
            <strong>Grounding caveats.</strong> {grounding.notes.join(" ")}
          </p>
        </Card>
      )}

      <AssistantClient
        canApproveSensitive={canManageAgents}
        modelConfigured={provider.configured}
        providerLabel={provider.configured ? `${provider.provider}` : "not configured"}
      />
    </div>
  );
}
