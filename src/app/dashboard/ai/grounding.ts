import "server-only";

import { loadOrganizationContext } from "@/lib/ai/context";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/auth";

/**
 * The live numbers the assistant works from.
 *
 * Deliberately counts, not content: the page only needs to show that grounding
 * is real. `loadOrganizationContext` reads the same catalogue the planner uses,
 * so the strip and the assistant can never disagree about the workspace.
 */
export async function loadOrgGrounding(organizationId: string): Promise<{
  classes: number;
  subjects: number;
  questions: number;
  examinations: number;
  notes: string[];
}> {
  try {
    const supabase = await createClient();
    const context = await loadOrganizationContext(
      supabase,
      // The context loader reads org-scoped rows through the caller's client;
      // it only uses the profile role for a Super Admin branch it does not hit
      // here, so a neutral context is enough and avoids a second session read.
      { profile: { platform_role: "user" } } as unknown as SessionContext,
      organizationId,
    );
    return {
      classes: context.classes.length,
      subjects: context.subjects.length,
      questions: context.counts.questions,
      examinations: context.counts.exams,
      notes: context.notes,
    };
  } catch {
    return {
      classes: 0,
      subjects: 0,
      questions: 0,
      examinations: 0,
      notes: ["The workspace catalogue could not be read, so no counts are shown rather than zero."],
    };
  }
}
