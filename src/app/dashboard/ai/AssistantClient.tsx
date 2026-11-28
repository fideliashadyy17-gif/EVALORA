"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { runAssistant, type AssistantTurn } from "./actions";

/**
 * The assistant conversation.
 *
 * Everything rendered here comes from a real tool result. There is no simulated
 * typing, no invented "thinking" text and no placeholder success: if a tool did
 * not run, the transcript says so, and a sanitised error is shown instead of a
 * cheerful confirmation.
 *
 * The composer is a preview by default. "Run for real" is a separate, explicit
 * action, because an instruction like "publish the exam" must not be one Enter
 * key away from going live.
 */

const EXAMPLES = [
  "Create a Grade 9 MYP Mathematics examination on algebraic expressions, linear equations and sequences, 90 minutes, 2 sections, 100 marks",
  "Show me my workspace context",
  "List my most recent examinations",
  "Generate a hard question on trigonometry",
  "How did the class do on 00000000-0000-4000-8000-000000000000",
];

function outcomeTone(code?: string): "green" | "amber" | "red" | "gray" {
  if (!code) return "green";
  if (code === "approval_required") return "amber";
  if (code === "permission_denied" || code === "unauthenticated") return "red";
  return "gray";
}

export function AssistantClient({
  canApproveSensitive,
  modelConfigured,
  providerLabel,
}: {
  canApproveSensitive: boolean;
  modelConfigured: boolean;
  providerLabel: string;
}) {
  const [instruction, setInstruction] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [pending, startTransition] = useTransition();

  // One id per submitted instruction, held until that instruction succeeds.
  // A retry after a dropped response therefore carries the SAME id, and the
  // engine returns the first result instead of creating a second examination or
  // question batch. Changing the text starts a new request.
  const requestId = useRef<string | null>(null);
  const lastText = useRef<string>("");

  const submit = (mode: "preview" | "execute") => {
    const text = instruction.trim();
    if (text.length < 3 || pending) return;
    if (lastText.current !== text || !requestId.current) {
      requestId.current = crypto.randomUUID();
      lastText.current = text;
    }
    const id = requestId.current;
    startTransition(async () => {
      const turn = await runAssistant({ instruction: text, mode, requestId: id });
      setTurns((current) => [turn, ...current]);
      if (turn.executed.some((e) => e.ok)) {
        // The instruction is done; a new one must not reuse this id.
        setInstruction("");
        requestId.current = null;
        lastText.current = "";
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card className="p-4">
          <label htmlFor="ai-instruction" className="block text-sm font-medium text-evergreen-900">
            Ask EVALORA to do something
          </label>
          <textarea
            id="ai-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit("preview");
            }}
            rows={4}
            maxLength={4000}
            placeholder="e.g. Create a Grade 9 examination on fractions and percentages, 60 minutes, 20 questions"
            className="mt-2 w-full resize-y rounded-xl border border-evergreen-900/25 bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-evergreen-700"
            disabled={pending}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => submit("preview")} disabled={pending || instruction.trim().length < 3}>
              {pending ? "Working…" : "Preview"}
            </Button>
            <Button
              type="button"
              onClick={() => submit("execute")}
              disabled={pending || instruction.trim().length < 3}
              className="bg-gold-600 text-evergreen-950 hover:bg-gold-500"
            >
              Run for real
            </Button>
            <span className="text-xs text-ink-soft">
              Preview runs read-only work. “Run for real” may draft or change data; sensitive changes still need an approval.
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            {modelConfigured
              ? `Model provider: ${providerLabel}. Every answer says whether the model or EVALORA's deterministic engine produced it.`
              : "No model credential is configured on this deployment, so EVALORA uses its own deterministic planner and content generator. Each answer says which engine produced it."}
          </p>
        </Card>

        <div className="space-y-4">
          {turns.length === 0 && (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-evergreen-900">Try one of these</h3>
              <ul className="mt-3 space-y-2">
                {EXAMPLES.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => setInstruction(example)}
                      className="text-left text-sm text-evergreen-800 underline decoration-evergreen-900/25 underline-offset-2 hover:decoration-evergreen-800"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-soft">
                Replace the sample id with a real one from your workspace. The assistant never guesses a record id.
              </p>
            </Card>
          )}

          {turns.map((turn, index) => (
            <Card key={`${turn.instruction}-${index}`} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium text-evergreen-950">“{turn.instruction}”</p>
                <div className="flex items-center gap-2">
                  <Badge tone={turn.strategy === "model" ? "gold" : "gray"}>
                    {turn.strategy === "model" ? "Planned by model" : "Deterministic planner"}
                  </Badge>
                  {turn.grounding.questions >= 0 && (
                    <Badge tone="green">Live data</Badge>
                  )}
                </div>
              </div>

              {turn.error ? (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{turn.error}</p>
              ) : (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{turn.reply}</p>
              )}

              {turn.note && <p className="mt-2 text-xs text-ink-soft">{turn.note}</p>}

              {turn.executed.length > 0 && (
                <div className="mt-4 space-y-3">
                  {turn.executed.map((step, stepIndex) => (
                    <div key={`${step.tool}-${stepIndex}`} className="rounded-xl border border-evergreen-900/15 bg-stone-50/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-evergreen-800">{step.tool}</span>
                        <Badge tone={outcomeTone(step.code)}>{step.ok ? "succeeded" : step.code ?? "failed"}</Badge>
                        <span className="text-xs text-ink-soft">{step.title}</span>
                      </div>

                      {step.code === "approval_required" && (
                        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          This operation needs a human approval before it can run.{" "}
                          {step.approvalId && <span className="font-mono">{step.approvalId}</span>}
                          {canApproveSensitive ? (
                            <>
                              {" "}
                              Open <Link className="underline" href="/dashboard/ai/approvals">Agents &amp; approvals</Link> to
                              review and approve it.
                            </>
                          ) : (
                            " Ask an administrator to review it in Agents & approvals."
                          )}
                        </div>
                      )}

                      {step.warnings?.map((warning) => (
                        <p key={warning} className="mt-2 text-xs text-ink-soft">
                          {warning}
                        </p>
                      ))}

                      {step.preview && (
                        <div className="mt-3 space-y-3">
                          {step.preview.sections.map((section, sectionIndex) => (
                            <div key={`${section.heading}-${sectionIndex}`}>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-evergreen-800">
                                {section.heading}
                              </h4>
                              {section.rows && (
                                <dl className="mt-1 divide-y divide-evergreen-900/10 text-sm">
                                  {section.rows.map((row, rowIndex) => (
                                    <div key={`${row.label}-${rowIndex}`} className="flex flex-wrap justify-between gap-2 py-1">
                                      <dt className="text-ink">{row.label}</dt>
                                      <dd className="text-ink-soft">{row.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              )}
                              {section.bullets && (
                                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                                  {section.bullets.map((bullet, bulletIndex) => (
                                    <li key={`${bulletIndex}-${bullet.slice(0, 20)}`}>{bullet}</li>
                                  ))}
                                </ul>
                              )}
                              {section.paragraphs?.map((paragraph, paragraphIndex) => (
                                <p key={`${paragraphIndex}-${paragraph.slice(0, 20)}`} className="mt-1 text-sm text-ink">
                                  {paragraph}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {step.issuedToken && (
                        <div className="mt-2 rounded-lg border border-gold-500/60 bg-gold-50 px-3 py-2">
                          <p className="text-xs font-medium text-evergreen-950">
                            Copy this credential now — it is shown once and cannot be retrieved again.
                          </p>
                          <code className="mt-1 block break-all rounded bg-paper px-2 py-1 font-mono text-[11px] text-ink">
                            {step.issuedToken}
                          </code>
                          <p className="mt-1 text-[11px] text-ink-soft">
                            Send it as <code className="font-mono">Authorization: Bearer …</code>. Agent
                            Management will only ever show its prefix.
                          </p>
                        </div>
                      )}

                      {step.links?.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="mt-2 inline-block text-sm font-medium text-evergreen-800 underline underline-offset-2"
                        >
                          {link.label} →
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-[11px] text-ink-soft">
                Grounding: {turn.grounding.classes} classes · {turn.grounding.subjects} subjects ·{" "}
                {turn.grounding.questions} questions · {turn.grounding.examinations} examinations ·{" "}
                {turn.grounding.modules.length} modules enabled
                {turn.grounding.notes.length > 0 && ` · ${turn.grounding.notes.join(" ")}`}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <Card className="p-4">
          <h3 className="font-display text-sm font-semibold text-evergreen-900">How this works</h3>
          <ul className="mt-2 space-y-2 text-xs text-ink-soft">
            <li>
              The assistant uses <strong>your</strong> permissions. A tool you cannot use is not offered to it.
            </li>
            <li>Every call is journaled: who, when, which tool, and what happened.</li>
            <li>Publishing, marking and score changes need a recorded human approval.</li>
            <li>
              Validation is structural. Passing it does not prove the mathematics is correct — a teacher reviews every
              paper.
            </li>
            <li>Generated examinations are always saved as drafts.</li>
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="font-display text-sm font-semibold text-evergreen-900">What it can do</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Draft examinations, generate questions, build quizzes, validate papers, analyse results, preview grade
            adjustments, propose marks, list agents — depending on your role.
          </p>
          <Link href="/dashboard/ai/activity" className="mt-2 inline-block text-xs font-medium text-evergreen-800 underline">
            View the operation log →
          </Link>
        </Card>
      </aside>
    </div>
  );
}
