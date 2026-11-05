-- 0018 — Admission re-check also accepts a reliably verified, authenticated
-- student (students.user_id), never a display name or participant reference.
-- Guest candidates still require the stored hash of an approved token.

create or replace function public.verify_participant_phase_admission(p_participant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_participant record; v_session record; v_comp record; v_phase record;
  v_phase_id uuid; v_required boolean; v_ok boolean; v_student uuid;
begin
  select * into v_participant from public.session_participants where id = p_participant_id;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'Participant not found.'); end if;
  select * into v_session from public.quiz_sessions where id = v_participant.session_id;
  if not found or v_session.status in ('ended','cancelled') or v_session.admission_open is false then
    return jsonb_build_object('allowed', false, 'reason', 'The live session is not available.', 'session_id', v_participant.session_id);
  end if;
  select c.* into v_comp from public.competitions c
  where c.session_id = v_session.id
     or exists (select 1 from public.competition_phase_classes cpc where cpc.session_id = v_session.id and cpc.competition_id = c.id)
  limit 1;
  if not found then
    return jsonb_build_object('allowed', true, 'reason', 'Ordinary live session; no phase admission rule.', 'session_id', v_session.id);
  end if;
  select cpc.phase_id into v_phase_id from public.competition_phase_classes cpc
  where cpc.session_id = v_session.id and cpc.competition_id = v_comp.id limit 1;
  if v_phase_id is null and coalesce(v_comp.settings->>'stage','') <> '' then
    select p.id into v_phase_id from public.competition_event_phases p
    where p.event_id = v_comp.event_id and p.phase_key = v_comp.settings->>'stage' limit 1;
  end if;
  if v_phase_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'No competition phase is linked to this session.', 'session_id', v_session.id);
  end if;
  select * into v_phase from public.competition_event_phases where id = v_phase_id;
  if v_phase.status not in ('scheduled','open','completed') then
    return jsonb_build_object('allowed', false, 'reason', 'This phase is not open for admission.', 'phase_id', v_phase_id);
  end if;

  v_required := coalesce((v_comp.settings->>'qualification_required')::boolean,
                         (v_comp.settings->>'require_qualification')::boolean, false);
  if not v_required then
    return jsonb_build_object('allowed', true, 'reason', 'No qualification requirement configured.', 'phase_id', v_phase_id);
  end if;
  if v_comp.event_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'Competition is not linked to a parent event.', 'phase_id', v_phase_id);
  end if;

  select st.id into v_student from public.students st
  where st.user_id = v_participant.user_id and st.organization_id = v_comp.organization_id limit 1;
  if v_student is not null and v_comp.class_id is not null and not exists (
    select 1 from public.student_enrollments e
    where e.student_id = v_student and e.class_id = v_comp.class_id and e.status = 'active'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'Verified class is not eligible for this phase.', 'phase_id', v_phase_id);
  end if;

  select exists (
    select 1 from public.qualification_records q
    where q.organization_id = v_comp.organization_id
      and q.event_id = v_comp.event_id
      and q.to_phase_id = v_phase_id
      and (v_comp.class_id is null or q.class_id = v_comp.class_id)
      and q.status in ('approved','manual_approved')
      and coalesce(q.approval_status,'pending') = 'approved'
      and (
        (v_participant.qualification_token_hash is not null and q.admission_token_hash = v_participant.qualification_token_hash)
        or (v_student is not null and q.student_id = v_student)
        or (v_student is not null and q.candidate_id in (select id from public.exam_candidates where student_id = v_student))
        or (v_participant.user_id is not null and q.participant_id in (select id from public.session_participants where user_id = v_participant.user_id))
      )
  ) into v_ok;
  if not v_ok then
    return jsonb_build_object('allowed', false, 'reason', 'No approved qualification record matches this participant and phase.', 'phase_id', v_phase_id);
  end if;
  return jsonb_build_object('allowed', true, 'reason', 'Approved qualification verified.',
    'phase_id', v_phase_id, 'event_id', v_comp.event_id, 'class_id', v_comp.class_id);
end $$;
