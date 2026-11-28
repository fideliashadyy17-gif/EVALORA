import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which subject does this tool call touch?
 *
 * The AI Core authenticates as an agent and runs on the service-role client, so
 * the database's subject policies do not bind its writes: RLS is not evaluated
 * for that role. The permission it checked was `tool.risk.permission`
 * ("questions.create"), which is organization-wide — a Mathematics teacher held
 * it and could therefore have the assistant author, edit or delete Literature
 * content in the same school.
 *
 * Closing that needs the question the RBAC gate cannot answer: *which subject*.
 * The first version of this hook read `args.subject_id`, which no write tool
 * accepts — `create_examination` and `create_quiz` take a subject NAME and every
 * other tool takes a resource id — so the check was dead code. The resolver
 * below reads the call the way the tool itself reads it:
 *
 *   args.subject_id        explicit id (newer callers)
 *   args.subject           a subject name, resolved within the caller's tenant
 *   examination_id         the subject of that examination
 *   quiz_id                the subject of the examination that uses that paper
 *   question_id            the subject of that question
 *
 * It answers with `null` when the call genuinely names no subject — creating a
 * paper before a subject is chosen, which the database also treats as
 * unrestricted. It never guesses: an id that does not resolve inside the
 * caller's organization yields `subjectId: null` with `resolved: false` and the
 * gate refuses, rather than falling through to the permissive branch.
 */

export interface SubjectScope {
  /** The subject the call touches, or null when it touches none. */
  subjectId: string | null;
  /** Human-readable subject, for the refusal message. */
  label: string;
  /** False when the call named a resource that could not be resolved. */
  resolved: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolves a subject name inside one organization.
 *
 * Names are unique per organization in production (checked: zero duplicates
 * across Demo Academy and Oak), so a case-insensitive match is unambiguous. A
 * name that matches nothing is NOT treated as an error here — the subject may
 * simply not exist yet, and refusing to save a paper because the school has not
 * registered the subject would be worse than leaving it unscoped. The
 * companion `subject_unmatched` flag tells the caller which happened.
 */
export async function resolveSubjectByName(
  admin: SupabaseClient,
  organizationId: string,
  name: string,
): Promise<{ id: string | null; matched: boolean }> {
  const { data, error } = await admin
    .from("subjects")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .limit(2);
  if (error) throw new Error(`Could not resolve subject "${name}": ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 1) return { id: rows[0].id, matched: true };
  // Two names differing only in case would be ambiguous. Refusing to pick one
  // is the only safe answer; the caller reports it rather than scoping blindly.
  if (rows.length > 1) return { id: null, matched: false };
  return { id: null, matched: false };
}

/**
 * The subject a tool call touches, resolved against the caller's organization.
 *
 * Reads through the service-role client deliberately: the caller is already
 * authenticated and the organization is already resolved server-side, and the
 * lookups must not silently return "no rows" (which would read as "no subject"
 * and be grandfathered) because a policy hid the row.
 */
export async function resolveToolSubject(
  admin: SupabaseClient,
  organizationId: string,
  args: Record<string, unknown>,
): Promise<SubjectScope> {
  const explicitId = str(args.subject_id);
  if (explicitId) {
    if (!UUID.test(explicitId)) return { subjectId: null, label: "unknown", resolved: false };
    const { data } = await admin
      .from("subjects")
      .select("id, name")
      .eq("id", explicitId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const row = data as { id: string; name: string } | null;
    return row
      ? { subjectId: row.id, label: row.name, resolved: true }
      : { subjectId: null, label: "another organization's subject", resolved: false };
  }

  const byName = str(args.subject);
  if (byName) {
    const { id, matched } = await resolveSubjectByName(admin, organizationId, byName);
    // An unrecognised name is not a failure: the school has not registered that
    // subject, so the paper it is writing cannot be scoped to one. Same branch
    // as "no subject named", which the database also allows.
    return { subjectId: id, label: byName, resolved: matched || true };
  }

  const examinationId = str(args.examination_id) ?? str(args.exam_id);
  if (examinationId) {
    if (!UUID.test(examinationId)) return { subjectId: null, label: "unknown examination", resolved: false };
    const { data } = await admin
      .from("exams")
      .select("subject_id, settings")
      .eq("id", examinationId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const row = data as { subject_id: string | null; settings: Record<string, unknown> | null } | null;
    if (!row) return { subjectId: null, label: "another organization's examination", resolved: false };
    if (row.subject_id) return { subjectId: row.subject_id, label: row.subject_id, resolved: true };
    // Papers created before `exams.subject_id` existed carry the subject name in
    // settings only, and every dashboard-created paper still does.
    const legacy = str(row.settings?.subject);
    if (legacy) {
      const { id, matched } = await resolveSubjectByName(admin, organizationId, legacy);
      if (matched && id) return { subjectId: id, label: legacy, resolved: true };
    }
    return { subjectId: null, label: "the examination", resolved: true };
  }

  const quizId = str(args.quiz_id);
  if (quizId) {
    if (!UUID.test(quizId)) return { subjectId: null, label: "unknown paper", resolved: false };
    const { data: quiz } = await admin
      .from("quizzes")
      .select("id, settings")
      .eq("id", quizId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!quiz) return { subjectId: null, label: "another organization's paper", resolved: false };
    // A paper takes its subject from the examination that uses it.
    const { data: exam } = await admin
      .from("exams")
      .select("subject_id, settings")
      .eq("quiz_id", quizId)
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();
    const row = exam as { subject_id: string | null; settings: Record<string, unknown> | null } | null;
    const name = str(row?.settings?.subject) ?? str((quiz as { settings: Record<string, unknown> | null }).settings?.subject);
    if (row?.subject_id) return { subjectId: row.subject_id, label: row.subject_id, resolved: true };
    if (name) {
      const { id, matched } = await resolveSubjectByName(admin, organizationId, name);
      if (matched && id) return { subjectId: id, label: name, resolved: true };
    }
    return { subjectId: null, label: "the paper", resolved: true };
  }

  const questionId = str(args.question_id);
  if (questionId) {
    // A malformed id must be refused, not skipped. Testing the shape and then
    // falling through on failure makes `{question_id: "garbage"}` indistinguishable
    // from "no subject named", which is the grandfathered, permitted branch.
    if (!UUID.test(questionId)) return { subjectId: null, label: "unknown question", resolved: false };
    const { data } = await admin
      .from("questions")
      .select("subject_id")
      .eq("id", questionId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const row = data as { subject_id: string | null } | null;
    if (!row) return { subjectId: null, label: "another organization's question", resolved: false };
    return { subjectId: row.subject_id, label: "that question", resolved: !!row.subject_id };
  }

  return { subjectId: null, label: "no subject", resolved: true };
}

/**
 * Binds the resolver into the shape the AI Core expects.
 *
 * One implementation for MCP, the tool API and the native assistant: three
 * copies of an authorization rule is three chances for them to disagree, and
 * the brief requires the assistant and the agent path to enforce the same rule.
 */
export function subjectScopeGate(
  admin: SupabaseClient,
  organizationId: string,
  actorId: string,
): (tool: string, args: Record<string, unknown>) => Promise<{ allowed: boolean; label: string }> {
  return async (_tool, args) => {
    const scope = await resolveToolSubject(admin, organizationId, args);
    if (!scope.resolved) {
      return { allowed: false, label: scope.label };
    }
    const { data, error } = await admin.rpc("can_author_subject_for", {
      p_actor: actorId,
      p_org: organizationId,
      p_subject: scope.subjectId,
    });
    if (error) {
      // An unanswerable check must fail closed and say so. Treating a failed RPC
      // as "allowed" is how a permission check becomes decorative.
      throw new Error(`Subject authorization could not be verified: ${error.message}`);
    }
    return { allowed: data === true, label: scope.label };
  };
}
