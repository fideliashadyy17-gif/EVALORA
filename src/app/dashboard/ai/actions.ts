"use server";

/**
 * The native EVALORA AI Assistant.
 *
 * This action is the browser's only entry into the AI core. It does NOT contain
 * a second implementation of anything: it resolves the signed-in teacher, asks
 * the core to plan the instruction, and lets the shared engine execute the
 * chosen tools with the same services the dashboard uses.
 *
 * Two modes, and the difference is visible to the user:
 *   - `preview` runs read-only/draft tools and returns the result for review;
 *   - `execute` may run a writing tool. A sensitive one still returns
 *     `approval_required` unless an approval already exists.
 */

import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin";
import { loadOrganizationContext, renderContextForModel } from "@/lib/ai/context";
import { executeTool, loadAiSettings } from "@/lib/ai/engine";
import { runInstruction } from "@/lib/ai/planner";
import { TOOLS, toolsForPermissions } from "@/lib/ai/tools";
import type { ExecutionOutcome } from "@/lib/ai/engine";
import { ToolError } from "@/lib/ai/types";

export interface AssistantTurn {
  instruction: string;
  reply: string;
  strategy: "model" | "rules";
  note?: string;
  refusal?: string;
  executed: {
    tool: string;
    title: string;
    ok: boolean;
    summary?: string;
    detail?: string;
    code?: string;
    approvalId?: string;
    links?: { label: string; href: string }[];
    preview?: ExecutionOutcome["preview"];
    warnings?: string[];
    /**
     * A credential issued by this call, shown once. Never persisted to the
     * transcript, the journal or any log — only returned to the caller that
     * caused it.
     */
    issuedToken?: string;
  }[];
  /** Live facts the assistant actually used, so the UI can show its grounding. */
  grounding: {
    classes: number;
    subjects: number;
    questions: number;
    examinations: number;
    modules: string[];
    notes: string[];
  };
  error?: string;
}

/**
 * Extracts a freshly issued credential from a tool result.
 *
 * Only `register_ai_agent` returns one, and only in `data.token`. It is lifted
 * into the turn so the UI can show it once; nothing else reads it.
 */
function readIssuedToken(outcome: ExecutionOutcome): string | undefined {
  if (outcome.tool !== "register_ai_agent" || !outcome.ok) return undefined;
  const token = (outcome.data as Record<string, unknown> | undefined)?.token;
  return typeof token === "string" && token.startsWith("evalora_") ? token : undefined;
}

/** Turns an engine outcome into a sentence the teacher can act on. */
function summariseOutcome(outcome: ExecutionOutcome): string {
  if (outcome.ok) return outcome.summary ?? "Done.";
  if (outcome.code === "approval_required") {
    return (
      `${outcome.detail ?? "This operation needs a human approval."}\n` +
      "An administrator can approve it in Agents & approvals; nothing has changed yet."
    );
  }
  return outcome.detail ?? "The operation failed and nothing was changed.";
}

/**
 * Runs one instruction from the workspace assistant.
 *
 * `mode = "execute"` is required for anything that writes: the composer's
 * default is a preview, so a teacher cannot accidentally publish by talking.
 */
export async function runAssistant(input: {
  instruction: string;
  mode: "preview" | "execute";
  approvalId?: string;
}): Promise<AssistantTurn> {
  const instruction = String(input?.instruction ?? "").trim().slice(0, 4000);
  const empty: AssistantTurn = {
    instruction,
    reply: "",
    strategy: "rules",
    executed: [],
    grounding: { classes: 0, subjects: 0, questions: 0, examinations: 0, modules: [], notes: [] },
  };

  if (instruction.length < 3) {
    return { ...empty, error: "Write an instruction first." };
  }

  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ...empty, error: "Select a workspace first." };
  if (org.status !== "active" && ctx.profile.platform_role !== "super_admin") {
    return { ...empty, error: "This organization is not active." };
  }

  // The assistant itself is a permission, not a free feature.
  if (!(await canOperate(ctx, org.id, "ai.use"))) {
    return { ...empty, error: "You do not have the \"ai.use\" permission. An administrator can grant it in Role & Access Management." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const settings = await loadAiSettings(admin, org.id);
  if (!settings.enabled || !settings.nativeAssistantEnabled) {
    return { ...empty, error: "The AI assistant is disabled for this organization." };
  }

  // ── Grounding: read the live structures, never a static description ──
  const context = await loadOrganizationContext(supabase, ctx, org.id);
  const grounding = {
    classes: context.classes.length,
    subjects: context.subjects.length,
    questions: context.counts.questions,
    examinations: context.counts.exams,
    modules: context.modules.filter((m) => m.enabled).map((m) => m.key),
    notes: context.notes,
  };

  const hasPermission = (permission: string) => canOperate(ctx, org.id, permission);
  const actor = {
    kind: "human" as const,
    userId: ctx.user.id,
    userEmail: ctx.user.email,
  };
  const scope = { surface: "native" as const, organizationId: org.id, requestId: crypto.randomUUID() };

  // ── Execute the instruction ─────────────────────────────────────────
  let executed: AssistantTurn["executed"] = [];
  let reply = "";
  let strategy: AssistantTurn["strategy"] = "rules";
  let note: string | undefined;
  let refusal: string | undefined;

  try {
    if (input.mode === "preview") {
      // A preview plans and, when every step is read-only, runs it so the user
      // sees real data. A writing step is described but not executed.
      const plan = await runInstruction(instruction, {
        admin,
        supabase,
        actor,
        scope,
        settings,
        hasPermission,
        context: renderContextForModel(context, 3000),
      });
      strategy = plan.plan.strategy;
      note = plan.plan.note;
      refusal = plan.plan.refusal;
      const planned = plan.plan.steps;
      if (!planned.length && refusal) {
        reply = refusal;
      } else {
        executed = plan.outcomes.map((outcome) => ({
          tool: outcome.tool,
          title: TOOLS.find((t) => t.name === outcome.tool)?.title ?? outcome.tool,
          ok: outcome.ok,
          summary: outcome.summary,
          detail: outcome.detail,
          code: outcome.code,
          approvalId: outcome.approvalId,
          links: outcome.links,
          preview: outcome.preview,
          warnings: outcome.warnings,
          issuedToken: readIssuedToken(outcome),
        }));
        const readOnly = planned.every((step) => !TOOLS.find((t) => t.name === step.tool)?.risk.writes);
        const lines: string[] = [];
        if (!readOnly) {
          lines.push(
            "This instruction would change data, so it was not run in preview. Press “Run for real” to execute it.",
          );
        }
        lines.push(...executed.map((e) => (e.ok ? e.summary ?? "" : e.detail ?? "")).filter(Boolean));
        reply = lines.filter(Boolean).join("\n\n");
      }
    } else {
      // Execute: one step at a time through the engine, stopping at a refusal or
      // an approval requirement.
      const plan = await runInstruction(instruction, {
        admin,
        supabase,
        actor,
        scope,
        settings,
        hasPermission,
        context: renderContextForModel(context, 3000),
      });
      strategy = plan.plan.strategy;
      note = plan.plan.note;
      refusal = plan.plan.refusal;
      executed = plan.outcomes.map((outcome) => ({
        tool: outcome.tool,
        title: TOOLS.find((t) => t.name === outcome.tool)?.title ?? outcome.tool,
        ok: outcome.ok,
        summary: outcome.summary,
        detail: outcome.detail,
        code: outcome.code,
        approvalId: outcome.approvalId,
        links: outcome.links,
        preview: outcome.preview,
        warnings: outcome.warnings,
        issuedToken: readIssuedToken(outcome),
      }));
      reply = refusal
        ? refusal
        : executed.map((e) => (e.ok ? e.summary ?? "" : summariseOutcome(plan.outcomes[executed.indexOf(e)]))).filter(Boolean).join("\n\n");
      if (input.approvalId && executed.length === 0) {
        // Executing directly with an approval: one tool, already identified.
        reply = "That approval could not be matched to an operation.";
      }
    }
  } catch (error) {
    const message =
      error instanceof ToolError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The assistant could not complete that request.";
    return { ...empty, grounding, error: message };
  }

  // The workspace audit log records that the assistant acted, separately from
  // the AI journal (which records each tool call).
  if (executed.some((e) => e.ok)) {
    try {
      await audit(ctx, "ai.assistant.execute", "ai_assistant", org.id, org.id, {
        tools: executed.map((e) => e.tool),
        strategy,
      });
    } catch {
      /* the tool call is already journaled in ai_executions */
    }
  }

  return {
    instruction,
    reply: reply || "The assistant had nothing to add.",
    strategy,
    note,
    refusal,
    executed,
    grounding,
  };
}

/** Executes one specific tool, used by the confirmation UI for an approval. */
export async function runAssistantTool(input: {
  tool: string;
  args: Record<string, unknown>;
  approvalId?: string;
}): Promise<{ ok: boolean; summary?: string; detail?: string; code?: string; links?: { label: string; href: string }[] }> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ok: false, detail: "Select a workspace first." };
  if (!(await canOperate(ctx, org.id, "ai.use"))) {
    return { ok: false, detail: "You do not have the \"ai.use\" permission." };
  }
  const supabase = await createClient();
  const admin = createAdminClient();
  const outcome = await executeTool(
    {
      tool: input.tool,
      args: input.args ?? {},
      actor: { kind: "human", userId: ctx.user.id, userEmail: ctx.user.email },
      scope: { surface: "native", organizationId: org.id, requestId: crypto.randomUUID() },
      approvalId: input.approvalId,
    },
    {
      hasPermission: (permission) => canOperate(ctx, org.id, permission),
      hasPermissionFor: (permission) => canOperate(ctx, org.id, permission),
      admin,
      supabase,
      modelTransport: undefined,
      publicBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? undefined,
    },
  );
  return {
    ok: outcome.ok,
    summary: outcome.summary,
    detail: outcome.detail,
    code: outcome.code,
    links: outcome.links,
  };
}

/** The capability list the composer shows, computed from this teacher's rights. */
export async function assistantCapabilities() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { tools: [] as { name: string; title: string; risk: string }[] };
  const checks = new Map<string, boolean>();
  for (const tool of TOOLS) {
    if (!checks.has(tool.risk.permission)) {
      checks.set(tool.risk.permission, await canOperate(ctx, org.id, tool.risk.permission));
    }
  }
  return {
    tools: toolsForPermissions((permission) => checks.get(permission) === true).map((tool) => ({
      name: tool.name,
      title: tool.title,
      risk: tool.risk.risk,
    })),
  };
}
