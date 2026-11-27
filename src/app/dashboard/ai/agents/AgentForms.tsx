"use client";

import { useActionState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { createAgentAction, type AgentActionState } from "./actions";

/**
 * The registration form.
 *
 * The token result is rendered from the action's return value and is never put
 * in a URL, a toast that could be screenshotted into a log, or local storage.
 * Navigating away loses it, which is stated up front.
 */
export function CreateAgentForm({ permissions }: { permissions: string[] }) {
  const [state, formAction, pending] = useActionState<AgentActionState | null, FormData>(createAgentAction, null);

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <div>
        <label htmlFor="agent-name" className="block text-xs font-medium text-evergreen-900">
          Name
        </label>
        <Input id="agent-name" name="name" required minLength={2} maxLength={120} placeholder="Claude — Grade 9 maths" />
      </div>
      <div>
        <label htmlFor="agent-client" className="block text-xs font-medium text-evergreen-900">
          Client
        </label>
        <select
          id="agent-client"
          name="client"
          className="mt-1 w-full rounded-xl border border-evergreen-900/25 bg-paper px-3 py-2 text-sm"
          defaultValue="custom"
        >
          <option value="chatgpt">ChatGPT</option>
          <option value="claude">Claude</option>
          <option value="gemini">Gemini</option>
          <option value="mcp">Generic MCP client</option>
          <option value="custom">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="agent-owner" className="block text-xs font-medium text-evergreen-900">
          Acts as (member email)
        </label>
        <Input id="agent-owner" name="owner_email" type="email" placeholder="teacher@school.org" />
        <p className="mt-1 text-[11px] text-ink-soft">Leave blank to act as you. The agent can never exceed this person.</p>
      </div>
      <div>
        <label htmlFor="agent-allowed" className="block text-xs font-medium text-evergreen-900">
          Allowed permissions (space or comma separated)
        </label>
        <textarea
          id="agent-allowed"
          name="allowed_permissions"
          rows={2}
          placeholder="exams.view exams.create questions.create"
          className="mt-1 w-full rounded-xl border border-evergreen-900/25 bg-paper px-3 py-2 font-mono text-xs"
        />
        <p className="mt-1 text-[11px] text-ink-soft">
          Empty means “everything its owner may do”. Keys the core recognises:{" "}
          <span className="font-mono">{permissions.join(" ")}</span>
        </p>
      </div>
      <div>
        <label htmlFor="agent-denied" className="block text-xs font-medium text-evergreen-900">
          Denied permissions
        </label>
        <textarea
          id="agent-denied"
          name="denied_permissions"
          rows={2}
          placeholder="results.publish exams.delete"
          className="mt-1 w-full rounded-xl border border-evergreen-900/25 bg-paper px-3 py-2 font-mono text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="rate" className="block text-xs font-medium text-evergreen-900">
            Calls / minute
          </label>
          <Input id="rate" name="rate_limit_per_minute" type="number" min={1} max={600} defaultValue={60} />
        </div>
        <div>
          <label htmlFor="daily" className="block text-xs font-medium text-evergreen-900">
            Calls / day
          </label>
          <Input id="daily" name="daily_call_limit" type="number" min={1} max={1000000} defaultValue={2000} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create credential"}
      </Button>

      {state && !state.ok && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{state.message}</p>
      )}
      {state?.ok && state.token && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Badge tone="amber">Shown once</Badge>
            <p className="text-xs text-amber-900">{state.message}</p>
          </div>
          <code className="mt-2 block break-all rounded bg-stone-900 px-2 py-2 font-mono text-[11px] text-stone-100">
            {state.token}
          </code>
        </div>
      )}
      {state?.ok && !state.token && (
        <p className="rounded-xl border border-evergreen-900/20 bg-evergreen-50 px-3 py-2 text-xs text-evergreen-900">
          {state.message}
        </p>
      )}
    </form>
  );
}
