"use server";

import { can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { publicScreenPath } from "@/lib/liveDisplayToken";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type LivePhase = "waiting" | "question" | "answer_reveal" | "leaderboard" | "podium" | "completed";
type ParticipantModerationStatus = "pending" | "admitted" | "rejected" | "blocked";

async function loadOwnedSession(sessionId: string) {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!data) return null;
  if (!can(ctx, data.organization_id, CREATOR_ROLES) && data.host_id !== ctx.user.id) return null;
  return { supabase, session: data, ctx };
}

function revalidate(sessionId: string) {
  revalidatePath(`/dashboard/sessions/${sessionId}/host`);
}

async function syncCompetitionStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  status: "live" | "paused" | "ended",
) {
  await supabase
    .from("competitions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
}

async function questionTiming(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quizId: string,
  index: number,
) {
  const [{ data: quiz }, { data: rows }] = await Promise.all([
    supabase.from("quizzes").select("settings").eq("id", quizId).maybeSingle(),
    supabase.from("quiz_questions").select("time_limit_seconds").eq("quiz_id", quizId).order("position"),
  ]);
  const settings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const row = rows?.[index];
  return {
    count: rows?.length ?? 0,
    durationSeconds: Math.max(
      5,
      Number(row?.time_limit_seconds ?? settings.time_per_question_seconds ?? 30) || 30,
    ),
  };
}

async function updateSession(
  own: NonNullable<Awaited<ReturnType<typeof loadOwnedSession>>>,
  patch: Record<string, unknown>,
) {
  const { error } = await own.supabase.from("quiz_sessions").update(patch).eq("id", own.session.id);
  return error ? { error: "The organizer action could not be saved." } : { ok: true as const };
}

export async function hostStart(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  if (session.status === "ended") return { error: "This session has ended." };
  if (session.status === "live") return { error: "This session is already live." };

  if (session.mode === "self_paced") {
    const res = await updateSession(own, {
      status: "live",
      phase: "question",
      phase_started_at: new Date().toISOString(),
      current_question_index: 0,
      question_started_at: new Date().toISOString(),
      question_deadline_at: null,
    });
    if ("error" in res) return res;
    await syncCompetitionStatus(supabase, session.id, "live");
    revalidate(sessionId);
    return { ok: true };
  }

  const { count, durationSeconds } = await questionTiming(supabase, session.quiz_id, 0);
  if (count === 0) return { error: "This quiz has no questions." };
  const startsAt = new Date(Date.now() + 3000);
  const deadline = new Date(startsAt.getTime() + durationSeconds * 1000);
  const res = await updateSession(own, {
    status: "live",
    phase: "countdown",
    phase_started_at: new Date().toISOString(),
    current_question_index: 0,
    question_started_at: startsAt.toISOString(),
    question_deadline_at: deadline.toISOString(),
  });
  if ("error" in res) return res;
  await syncCompetitionStatus(supabase, session.id, "live");
  revalidate(sessionId);
  return { ok: true };
}

export async function hostNext(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  if (session.mode !== "synchronized") return { error: "Self-paced sessions advance per participant." };
  if (session.status === "ended") return { error: "This session has ended." };

  const next = session.current_question_index + 1;
  const { count, durationSeconds } = await questionTiming(supabase, session.quiz_id, Math.max(next, 0));
  if (next >= count) {
    const res = await updateSession(own, {
      status: "ended",
      phase: "completed",
      phase_started_at: new Date().toISOString(),
      question_deadline_at: null,
      ended_at: new Date().toISOString(),
    });
    if ("error" in res) return res;
    await syncCompetitionStatus(supabase, session.id, "ended");
  } else {
    const startsAt = new Date(Date.now() + 2000);
    const deadline = new Date(startsAt.getTime() + durationSeconds * 1000);
    const res = await updateSession(own, {
      status: "live",
      phase: "countdown",
      phase_started_at: new Date().toISOString(),
      current_question_index: next,
      question_started_at: startsAt.toISOString(),
      question_deadline_at: deadline.toISOString(),
    });
    if ("error" in res) return res;
    await syncCompetitionStatus(supabase, session.id, "live");
  }
  revalidate(sessionId);
  return { ok: true };
}

export async function hostPauseToggle(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  const settings = { ...((session.settings as Record<string, unknown> | null) ?? {}) };

  if (session.status === "live") {
    settings.pause_snapshot = {
      paused_at: new Date().toISOString(),
      question_started_at: session.question_started_at,
      question_deadline_at: session.question_deadline_at,
      phase: session.phase,
    };
    const res = await updateSession(own, { status: "paused", settings });
    if ("error" in res) return res;
    await syncCompetitionStatus(supabase, session.id, "paused");
  } else if (session.status === "paused") {
    const snapshot = (settings.pause_snapshot ?? {}) as Record<string, unknown>;
    const pausedAt = typeof snapshot.paused_at === "string" ? new Date(snapshot.paused_at).getTime() : NaN;
    let startsAt = session.question_started_at ? new Date(session.question_started_at) : new Date();
    let deadline = session.question_deadline_at ? new Date(session.question_deadline_at) : null;
    if (Number.isFinite(pausedAt)) {
      const shift = Date.now() - pausedAt;
      startsAt = new Date(startsAt.getTime() + shift);
      deadline = deadline ? new Date(deadline.getTime() + shift) : null;
    } else if (session.mode === "synchronized") {
      const { durationSeconds } = await questionTiming(
        supabase,
        session.quiz_id,
        Math.max(session.current_question_index, 0),
      );
      startsAt = new Date();
      deadline = new Date(Date.now() + durationSeconds * 1000);
    }
    delete settings.pause_snapshot;
    const phase = session.mode === "synchronized" && startsAt.getTime() > Date.now()
      ? "countdown"
      : session.phase === "countdown"
        ? "question"
        : session.phase;
    const res = await updateSession(own, {
      status: "live",
      phase,
      phase_started_at: new Date().toISOString(),
      question_started_at: startsAt.toISOString(),
      question_deadline_at: deadline?.toISOString() ?? null,
      settings,
    });
    if ("error" in res) return res;
    await syncCompetitionStatus(supabase, session.id, "live");
  } else {
    return { error: "Only a live session can be paused or resumed." };
  }
  revalidate(sessionId);
  return { ok: true };
}

export async function hostEnd(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { supabase, session } = own;
  const res = await updateSession(own, {
    status: "ended",
    phase: "completed",
    phase_started_at: new Date().toISOString(),
    question_deadline_at: null,
    ended_at: new Date().toISOString(),
  });
  if ("error" in res) return res;
  await syncCompetitionStatus(supabase, session.id, "ended");
  revalidate(sessionId);
  return { ok: true };
}

export async function hostSetPhase(sessionId: string, phase: LivePhase) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const { session } = own;
  const valid: LivePhase[] = ["waiting", "question", "answer_reveal", "leaderboard", "podium", "completed"];
  if (!valid.includes(phase)) return { error: "Invalid presentation phase." };

  if (phase === "waiting" && session.status !== "lobby") return { error: "Waiting room is only available before the start." };
  if (phase === "question" && session.status !== "live") return { error: "Start or resume the session first." };
  if (phase === "answer_reveal") {
    if (session.mode !== "synchronized" || !["live", "paused"].includes(session.status) || session.current_question_index < 0) {
      return { error: "There is no synchronized question to reveal." };
    }
  }
  if (phase === "leaderboard" && !["live", "paused"].includes(session.status)) {
    return { error: "Intermediate rankings are available while the session is live or paused." };
  }
  if (phase === "podium" && session.status !== "ended") return { error: "End the competition before showing the final podium." };
  if (phase === "completed" && session.status !== "ended") return { error: "The competition has not ended." };

  const res = await updateSession(own, { phase, phase_started_at: new Date().toISOString() });
  if ("error" in res) return res;
  revalidate(sessionId);
  return { ok: true };
}

export async function hostSetAdmission(sessionId: string, open: boolean) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  if (own.session.status === "ended") return { error: "Admission cannot change after the session ends." };
  const res = await updateSession(own, { admission_open: Boolean(open) });
  if ("error" in res) return res;
  revalidate(sessionId);
  return { ok: true };
}

export async function hostSetApprovalRequired(sessionId: string, required: boolean) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  if (own.session.status === "ended") return { error: "Approval settings cannot change after the session ends." };
  const res = await updateSession(own, { require_approval: Boolean(required) });
  if ("error" in res) return res;

  if (!required) {
    const admin = createAdminClient();
    const { data: pending } = await admin
      .from("session_participants")
      .select("id")
      .eq("session_id", sessionId)
      .eq("status", "pending");
    const ids = (pending ?? []).map((p) => p.id);
    if (ids.length) {
      await admin.from("session_participants").update({ status: "admitted" }).in("id", ids);
      await admin
        .from("competition_registrations")
        .update({ status: "admitted" })
        .in("participant_id", ids)
        .eq("status", "registered");
    }
  }
  revalidate(sessionId);
  return { ok: true };
}

export async function hostSetParticipantStatus(
  sessionId: string,
  participantId: string,
  status: ParticipantModerationStatus,
) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  if (!["pending", "admitted", "rejected", "blocked"].includes(status)) return { error: "Invalid participant status." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("session_participants")
    .update({ status })
    .eq("id", participantId)
    .eq("session_id", sessionId);
  if (error) return { error: "Participant moderation could not be saved." };

  const registrationStatus = status === "admitted" ? "admitted" : status === "pending" ? "registered" : "removed";
  await admin
    .from("competition_registrations")
    .update({ status: registrationStatus })
    .eq("participant_id", participantId);
  return { ok: true };
}

export async function hostRemoveParticipant(sessionId: string, participantId: string) {
  return hostSetParticipantStatus(sessionId, participantId, "rejected");
}

export interface LiveSettingsPatch {
  show_leaderboard?: boolean;
  projector_enabled?: boolean;
  public_instructions?: string;
  audio?: {
    enabled?: boolean;
    volume?: number;
    theme?: "evergreen" | "focus" | "celebration" | "off";
    sound_effects?: boolean;
  };
  presentation?: {
    animations_enabled?: boolean;
    show_join_code_on_screen?: boolean;
  };
}

export async function hostUpdateLiveSettings(sessionId: string, patch: LiveSettingsPatch) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const current = { ...((own.session.settings as Record<string, unknown> | null) ?? {}) };
  const audio = { ...((current.audio as Record<string, unknown> | undefined) ?? {}) };
  const presentation = { ...((current.presentation as Record<string, unknown> | undefined) ?? {}) };

  if (typeof patch.show_leaderboard === "boolean") current.show_leaderboard = patch.show_leaderboard;
  if (typeof patch.projector_enabled === "boolean") current.projector_enabled = patch.projector_enabled;
  if (typeof patch.public_instructions === "string") {
    current.public_instructions = patch.public_instructions.slice(0, 500);
  }
  if (patch.audio) {
    if (typeof patch.audio.enabled === "boolean") audio.enabled = patch.audio.enabled;
    if (typeof patch.audio.sound_effects === "boolean") audio.sound_effects = patch.audio.sound_effects;
    if (typeof patch.audio.volume === "number" && Number.isFinite(patch.audio.volume)) {
      audio.volume = Math.min(1, Math.max(0, patch.audio.volume));
    }
    if (patch.audio.theme && ["evergreen", "focus", "celebration", "off"].includes(patch.audio.theme)) {
      audio.theme = patch.audio.theme;
    }
    current.audio = audio;
  }
  if (patch.presentation) {
    if (typeof patch.presentation.animations_enabled === "boolean") {
      presentation.animations_enabled = patch.presentation.animations_enabled;
    }
    if (typeof patch.presentation.show_join_code_on_screen === "boolean") {
      presentation.show_join_code_on_screen = patch.presentation.show_join_code_on_screen;
    }
    current.presentation = presentation;
  }

  const res = await updateSession(own, { settings: current });
  if ("error" in res) return res;
  revalidate(sessionId);
  return { ok: true, settings: current };
}

export async function hostToggleLeaderboard(sessionId: string, show: boolean) {
  return hostUpdateLiveSettings(sessionId, { show_leaderboard: show });
}

export async function hostRotateDisplayToken(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const nextVersion = Number(own.session.display_token_version ?? 1) + 1;
  const settings = { ...((own.session.settings as Record<string, unknown> | null) ?? {}), projector_enabled: true };
  const res = await updateSession(own, { display_token_version: nextVersion, settings });
  if ("error" in res) return res;
  const { data: competition } = await own.supabase
    .from("competitions")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();
  revalidate(sessionId);
  return {
    ok: true,
    public_screen_path: publicScreenPath(competition?.id ?? sessionId, sessionId, nextVersion),
  };
}

export async function hostRevokeDisplayToken(sessionId: string) {
  const own = await loadOwnedSession(sessionId);
  if (!own) return { error: "Session not found." };
  const settings = { ...((own.session.settings as Record<string, unknown> | null) ?? {}), projector_enabled: false };
  const res = await updateSession(own, {
    display_token_version: Number(own.session.display_token_version ?? 1) + 1,
    settings,
  });
  if ("error" in res) return res;
  revalidate(sessionId);
  return { ok: true };
}
