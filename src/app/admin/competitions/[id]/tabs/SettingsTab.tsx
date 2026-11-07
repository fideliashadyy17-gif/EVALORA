import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import {
  deleteCompetition,
  duplicateCompetition,
  updateCompetition,
} from "../../../actions/competitions";
import { ConfirmField, Notice, Section } from "../../../ui";

interface CompRow {
  id: string;
  organization_id: string;
  quiz_id: string | null;
  title: string;
  description: string | null;
  category: string;
  format: string;
  target_audience: string | null;
  education_level: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  max_participants: number | null;
  visibility: string;
  instructions: string | null;
  rules: string | null;
  scoring: Record<string, unknown> | null;
  result_publication_mode: "manual" | "automatic" | null;
  session_id: string | null;
  results_published: boolean;
}

export async function SettingsTab({ comp, sp }: { comp: CompRow; sp: { ok?: string; e?: string } }) {
  const admin = createAdminClient();
  const { data: quizzes } = await admin
    .from("quizzes")
    .select("id, title, status, quiz_questions(id)")
    .eq("organization_id", comp.organization_id)
    .order("updated_at", { ascending: false })
    .limit(300);

  const toLocal = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");
  const scoring = comp.scoring ?? {};

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          saved: "Competition settings saved.",
          title: "Competition name is required.",
          quiz_org: "The quiz must belong to the host organization.",
          confirm: "Tick the confirmation box to delete.",
          live_delete: "End the competition before deleting it.",
          duplicate_failed: "Duplication failed.",
          mode_locked: "Publication mode cannot change after a session has been created or results have been published.",
          not_found: "Competition no longer exists.",
        }}
      />

      <Card className="p-6">
        <form action={updateCompetition} className="space-y-5">
          <input type="hidden" name="id" value={comp.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Competition name *" className="sm:col-span-2">
              <Input name="title" required defaultValue={comp.title} />
            </Field>
            <Field label="Format">
              <Select name="format" defaultValue={comp.format}>
                {COMPETITION_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category"><Input name="category" defaultValue={comp.category} /></Field>
            <Field label="Quiz (host organization's bank)">
              <Select name="quiz_id" defaultValue={comp.quiz_id ?? ""}>
                <option value="">— None —</option>
                {(quizzes ?? []).map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} · {(q.quiz_questions as unknown[])?.length ?? 0} questions · {q.status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Visibility">
              <Select name="visibility" defaultValue={comp.visibility}>
                <option value="private">Private — code holders only</option>
                <option value="unlisted">Unlisted — direct link</option>
                <option value="public">Public listing</option>
              </Select>
            </Field>
            <Field label="Target audience"><Input name="target_audience" defaultValue={comp.target_audience ?? ""} /></Field>
            <Field label="Grade / education level"><Input name="education_level" defaultValue={comp.education_level ?? ""} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={3} defaultValue={comp.description ?? ""} /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Registration opens"><Input name="registration_opens_at" type="datetime-local" defaultValue={toLocal(comp.registration_opens_at)} /></Field>
            <Field label="Registration closes"><Input name="registration_closes_at" type="datetime-local" defaultValue={toLocal(comp.registration_closes_at)} /></Field>
            <Field label="Maximum participants"><Input name="max_participants" type="number" min={1} defaultValue={comp.max_participants ?? ""} placeholder="Unlimited" /></Field>
            <Field label="Starts"><Input name="starts_at" type="datetime-local" defaultValue={toLocal(comp.starts_at)} /></Field>
            <Field label="Ends"><Input name="ends_at" type="datetime-local" defaultValue={toLocal(comp.ends_at)} /></Field>
            <Field label="Duration (minutes)"><Input name="duration_minutes" type="number" min={1} defaultValue={comp.duration_minutes ?? ""} /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Points per correct answer">
              <Input name="scoring_points" type="number" min={1} defaultValue={Number(scoring.points_per_correct ?? 100)} />
            </Field>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-ink">
              <input type="checkbox" name="scoring_time_bonus" defaultChecked={Boolean(scoring.time_bonus)} className="h-4 w-4 accent-evergreen-700" /> Speed bonus weighting
            </label>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-ink">
              <input type="checkbox" name="scoring_negative" defaultChecked={Boolean(scoring.negative_marking)} className="h-4 w-4 accent-evergreen-700" /> Negative marking
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">Result publication mode</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="manual" defaultChecked={comp.result_publication_mode !== "automatic"} disabled={Boolean(comp.session_id || comp.results_published)} className="mt-1 accent-evergreen-700" /><span><strong>Manual Result Publication</strong><span className="block text-xs text-ink-soft">Organizer validates and publishes official rankings.</span></span></label>
              <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="automatic" defaultChecked={comp.result_publication_mode === "automatic"} disabled={Boolean(comp.session_id || comp.results_published)} className="mt-1 accent-evergreen-700" /><span><strong>Automatic Result Publication</strong><span className="block text-xs text-ink-soft">Objective results publish automatically after completion.</span></span></label>
            </div>
            {(comp.session_id || comp.results_published) && <p className="mt-2 text-xs text-amber-800">Mode is locked because a live session exists or results have already been published.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Instructions"><Textarea name="instructions" rows={4} defaultValue={comp.instructions ?? ""} /></Field>
            <Field label="Rules & regulations"><Textarea name="rules" rows={4} defaultValue={comp.rules ?? ""} /></Field>
          </div>

          <Button type="submit">Save settings</Button>
        </form>
      </Card>

      <Section title="Duplicate or delete">
        <Card className="space-y-5 p-6">
          <form action={duplicateCompetition} className="flex flex-wrap items-center justify-between gap-3">
            <input type="hidden" name="id" value={comp.id} />
            <p className="text-sm text-ink-soft">Create a fresh draft copy (new code, no session, no registrations).</p>
            <Button type="submit" variant="outline">Duplicate competition</Button>
          </form>
          <form action={deleteCompetition} className="space-y-3 border-t border-red-200 pt-4">
            <input type="hidden" name="id" value={comp.id} />
            <p className="text-sm text-ink-soft">
              Permanently deletes the competition, its codes and registrations. The underlying quiz and any
              completed session records remain in the host workspace.
            </p>
            <ConfirmField label="Permanently delete this competition" />
            <Button type="submit" variant="danger">Delete competition</Button>
          </form>
        </Card>
      </Section>
    </>
  );
}
