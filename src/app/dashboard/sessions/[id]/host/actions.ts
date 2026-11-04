"use server";

import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function loadOwnedSession(sessionId: string) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("organization_id", org.id)
    .maybeSingle();
  return data ? { supabase, session: data, org } : null;
}

export async function hostStart(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  await supabase
    .from("quiz_sessions")
    .update({ status: "live", current_question_index: 0, question_started_at: new Date().toISOString() })
    .eq("id", session.id);
  revalidatePath(`/dashboard/sessions/${sessionId}/host`);
  return { ok: true };
}

export async function hostNext(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  const { count } = await supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", session.quiz_id);
  const next = session.current_question_index + 1;
  if (next >= (count ?? 0)) {
    await supabase
      .from("quiz_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", session.id);
  } else {
    await supabase
      .from("quiz_sessions")
      .update({ current_question_index: next, question_started_at: new Date().toISOString(), status: "live" })
      .eq("id", session.id);
  }
  revalidatePath(`/dashboard/sessions/${sessionId}/host`);
  return { ok: true };
}

export async function hostPauseToggle(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  if (session.status === "live") {
    await supabase.from("quiz_sessions").update({ status: "paused" }).eq("id", session.id);
  } else if (session.status === "paused") {
    // Resume restarts the current question's window fairly.
    await supabase
      .from("quiz_sessions")
      .update({ status: "live", question_started_at: new Date().toISOString() })
      .eq("id", session.id);
  }
  revalidatePath(`/dashboard/sessions/${sessionId}/host`);
  return { ok: true };
}

export async function hostEnd(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  await supabase
    .from("quiz_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", session.id);
  revalidatePath(`/dashboard/sessions/${sessionId}/host`);
  return { ok: true };
}

export async function hostRemoveParticipant(sessionId: string, participantId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase } = own;
  // RLS only grants SELECT on participants to org members; use a scoped
  // update through the service role after the ownership check above.
  const { createAdminClient } = await import("@/lib/supabase/server");
  const admin = createAdminClient();
  await admin
    .from("session_participants")
    .update({ status: "rejected" })
    .eq("id", participantId)
    .eq("session_id", sessionId);
  void supabase;
  return { ok: true };
}

export async function hostToggleLeaderboard(sessionId: string, show: boolean) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  const settings = { ...((session.settings as object) ?? {}), show_leaderboard: show };
  await supabase.from("quiz_sessions").update({ settings }).eq("id", session.id);
  return { ok: true };
}
