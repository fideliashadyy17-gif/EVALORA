import { Card } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { describeCoreProvider } from "@/lib/ai/provider";
import { moduleEnabled } from "@/lib/modules";
import { AssistantClient } from "@/app/dashboard/ai/AssistantClient";

/**
 * The assistant, embedded on a workspace page.
 *
 * The brief asks for the assistant to be integrated into the pages where the
 * work happens — registration, import, teacher assignment, the question bank,
 * examinations, marking, results — rather than existing only as a separate
 * room. This is that integration point: a page drops it in and the assistant
 * arrives already knowing where it is, because `AssistantClient` sends the
 * current path and the server resolves it.
 *
 * Every gate is applied HERE as well as in the server action, because a surface
 * that renders a composer for a caller who cannot use it is a promise the system
 * will break one click later:
 *
 *   * the `ai_assistant` plan module must be enabled for the organization;
 *   * the caller needs `ai.use`;
 *   * `mayWrite` is `questions.create`, which is what the tool gate requires,
 *     so the copy does not invite a write the caller cannot perform.
 *
 * It renders NOTHING when the assistant is unavailable, rather than a disabled
 * shell — a page for a school without the module should not carry a dead panel.
 */
export async function AssistantPanel({
  title = "Assistant",
  className,
}: {
  title?: string;
  className?: string;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return null;

  const supabase = await createClient();
  const [{ entitlement }, canUse, canApproveSensitive, mayWrite] = await Promise.all([
    getCapabilities(supabase, ctx, org.id),
    canOperate(ctx, org.id, "ai.use"),
    canOperate(ctx, org.id, "ai.manage_agents"),
    canOperate(ctx, org.id, "questions.create"),
  ]);

  if (!moduleEnabled(entitlement.modules, "ai_assistant")) return null;
  if (!canUse) return null;

  const provider = describeCoreProvider();

  return (
    <Card className={className ? `p-4 ${className}` : "p-4"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-evergreen-900">{title}</h2>
        <span className="text-[11px] text-ink-soft">
          {provider.configured ? `Model: ${provider.provider}` : "Deterministic engine"}
          {mayWrite ? "" : " · read-only for your role"}
        </span>
      </div>
      <AssistantClient
        embedded
        canApproveSensitive={canApproveSensitive}
        modelConfigured={provider.configured}
        providerLabel={provider.configured ? provider.provider : "not configured"}
      />
    </Card>
  );
}
