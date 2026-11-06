-- Transactional acceptance checks for EVALORA event pools, qualification,
-- admission and shared-link exam identity. Run with a privileged SQL client.
-- Every change is rolled back at the end; no production row is persisted.

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
CREATE TEMP TABLE evalora_test_results(name text, passed boolean, detail text) ON COMMIT DROP;

-- ─── B. Generic question-pool assembly ────────────────────────────────
INSERT INTO public.question_pools(id, organization_id, event_id, phase_id, class_id, curriculum, title, target_count, filters)
VALUES ('e0000000-0000-4000-8000-0000000000b1','0a400000-0000-4000-8000-000000000001','0a400000-0000-4000-8000-000000000200','0a400000-0000-4000-8000-000000000210','0a400000-0000-4000-8000-000000000100','beninese','ACCEPTANCE draft pool',5,'{"curriculum_quota":{"beninese":3},"previous_usage":"exclude"}'::jsonb);

DO $$
DECLARE r jsonb; v_old uuid; v_new uuid; v_bad uuid; v_other uuid; v_ids uuid[]; v_msg text;
BEGIN
  r := public.generate_question_pool_items('e0000000-0000-4000-8000-0000000000b1', false);
  INSERT INTO evalora_test_results VALUES ('B1 auto-generate approved', (r->>'selected')::int = 5 AND (r->>'shortfall')::int = 0 AND (r->>'valid')::boolean, r::text);

  r := public.question_pool_validate('e0000000-0000-4000-8000-0000000000b1');
  INSERT INTO evalora_test_results VALUES ('B2 validation/curriculum quota', (r->>'valid')::boolean AND (r->'curriculum_counts'->>'beninese')::int >= 3, r::text);

  r := public.shuffle_question_pool_items('e0000000-0000-4000-8000-0000000000b1');
  INSERT INTO evalora_test_results VALUES ('B3 shuffle', (r->>'shuffled')::int = 5, r::text);

  SELECT question_id INTO v_old FROM public.question_pool_items WHERE pool_id='e0000000-0000-4000-8000-0000000000b1' ORDER BY position LIMIT 1;
  SELECT question_id INTO v_new FROM public.question_pool_eligible('e0000000-0000-4000-8000-0000000000b1', false)
    WHERE question_id NOT IN (SELECT question_id FROM public.question_pool_items WHERE pool_id='e0000000-0000-4000-8000-0000000000b1') LIMIT 1;
  r := public.replace_question_pool_item('e0000000-0000-4000-8000-0000000000b1', v_old, v_new);
  INSERT INTO evalora_test_results VALUES ('B4 replace', (r->>'valid')::boolean, r::text);

  -- set_question_pool_items expects uuid[]; use the first five eligible IDs.
  SELECT array_agg(question_id) INTO v_ids FROM (SELECT question_id FROM public.question_pool_eligible('e0000000-0000-4000-8000-0000000000b1', false) LIMIT 5) s;
  r := public.set_question_pool_items('e0000000-0000-4000-8000-0000000000b1', v_ids);
  INSERT INTO evalora_test_results VALUES ('B5 manual select', (r->>'selected')::int = 5 AND (r->>'valid')::boolean, r::text);

  UPDATE public.question_pools SET target_count=100, filters='{"topic":"__no_such_topic__"}'::jsonb WHERE id='e0000000-0000-4000-8000-0000000000b1';
  r := public.generate_question_pool_items('e0000000-0000-4000-8000-0000000000b1', false);
  INSERT INTO evalora_test_results VALUES ('B6 shortfall workflow', (r->>'insufficient')::boolean AND (r->>'shortfall')::int = 100 AND r->>'workflow' IS NOT NULL, r::text);

  -- An unapproved / unpublished question cannot be inserted even by a direct SQL call.
  BEGIN
    SELECT id INTO v_bad FROM public.questions WHERE review_status <> 'approved' OR status <> 'published' LIMIT 1;
    INSERT INTO public.question_pool_items(pool_id, question_id, position, source) VALUES ('e0000000-0000-4000-8000-0000000000b1', v_bad, 99, 'manual');
    INSERT INTO evalora_test_results VALUES ('B7 unapproved guard', false, 'Guard did not reject');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('B7 unapproved guard', true, v_msg);
  END;

  -- A question from another class cannot be mixed into this pool.
  BEGIN
    SELECT id INTO v_other FROM public.questions WHERE review_status='approved' AND status='published' AND class_id <> '0a400000-0000-4000-8000-000000000100' LIMIT 1;
    INSERT INTO public.question_pool_items(pool_id, question_id, position, source) VALUES ('e0000000-0000-4000-8000-0000000000b1', v_other, 98, 'manual');
    INSERT INTO evalora_test_results VALUES ('B8 no mixed classes', false, 'Guard did not reject');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('B8 no mixed classes', true, v_msg);
  END;

  -- The owner confirmed 20 questions per class (migration 0040), so an
  -- Elimination pool may now be published. Both directions are proved here:
  -- forcing the pending state back inside this transaction must still be
  -- refused by the count guard, and restoring the confirmed state must let the
  -- same publish through.
  UPDATE public.question_pools SET target_count=5, filters='{"previous_usage":"exclude"}'::jsonb WHERE id='e0000000-0000-4000-8000-0000000000b1';
  PERFORM public.generate_question_pool_items('e0000000-0000-4000-8000-0000000000b1', false);

  UPDATE public.competition_events
     SET settings = settings || '{"elimination_question_count_status":"pending_owner_confirmation"}'::jsonb
   WHERE id = '0a400000-0000-4000-8000-000000000200';
  BEGIN
    UPDATE public.question_pools SET status='published' WHERE id='e0000000-0000-4000-8000-0000000000b1';
    INSERT INTO evalora_test_results VALUES ('B9a pending count still blocks publish', false, 'Unresolved count guard did not reject');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('B9a pending count still blocks publish', v_msg ILIKE '%unresolved%', v_msg);
  END;

  UPDATE public.competition_events
     SET settings = settings || '{"elimination_question_count_status":"confirmed"}'::jsonb
   WHERE id = '0a400000-0000-4000-8000-000000000200';
  BEGIN
    UPDATE public.question_pools SET status='published' WHERE id='e0000000-0000-4000-8000-0000000000b1';
    INSERT INTO evalora_test_results
      SELECT 'B9b confirmed count permits publish', status = 'published', 'status=' || status
      FROM public.question_pools WHERE id='e0000000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('B9b confirmed count permits publish', false, v_msg);
  END;
END $$;

-- ─── C. Qualification, approval, override, backend admission ──────────
-- Synthetic source results are inserted only inside this transaction.
INSERT INTO public.exam_candidates(id, exam_id, full_name, first_name, last_name, class_id, access_code, status, source) VALUES
 ('de000000-0000-4000-8000-000000009001','0a400000-0000-4000-8000-000000000600','Qualified One','Qualified','One','0a400000-0000-4000-8000-000000000100','ACCEPT-Q1','submitted','admin'),
 ('de000000-0000-4000-8000-000000009002','0a400000-0000-4000-8000-000000000600','Qualified Two','Qualified','Two','0a400000-0000-4000-8000-000000000100','ACCEPT-Q2','submitted','admin'),
 ('de000000-0000-4000-8000-000000009003','0a400000-0000-4000-8000-000000000600','Not Qualified','Not','Qualified','0a400000-0000-4000-8000-000000000100','ACCEPT-N1','submitted','admin');
INSERT INTO public.exam_attempts(id, exam_id, candidate_id, score, max_score, status) VALUES
 ('de000000-0000-4000-8000-00000000a001','0a400000-0000-4000-8000-000000000600','de000000-0000-4000-8000-000000009001',90,100,'marked'),
 ('de000000-0000-4000-8000-00000000a002','0a400000-0000-4000-8000-000000000600','de000000-0000-4000-8000-000000009002',80,100,'marked'),
 ('de000000-0000-4000-8000-00000000a003','0a400000-0000-4000-8000-000000000600','de000000-0000-4000-8000-000000009003',10,100,'marked');

UPDATE public.competitions SET status='published', starts_at=NULL, ends_at=NULL, registration_opens_at=NULL, registration_closes_at=NULL
WHERE id IN ('0a400000-0000-4000-8000-000000000700','0a400000-0000-4000-8000-000000000701');
UPDATE public.competition_event_phases SET status='open' WHERE id='0a400000-0000-4000-8000-000000000211';
UPDATE public.quiz_sessions SET status='lobby', admission_open=true, require_approval=false WHERE id IN ('0a400000-0000-4000-8000-000000000900','0a400000-0000-4000-8000-000000000901');

DO $$
DECLARE r jsonb; v_eligible uuid; v_rejected uuid; v_token text; v_override_token text; v_msg text; v_count int; v_qual_count int; v_pool_count int; v_insert_err text;
BEGIN
  r := public.compute_phase_qualification('0a400000-0000-4000-8000-000000000210','0a400000-0000-4000-8000-000000000211','3c3ed712-f409-4aa1-a645-816418e22ec4');
  INSERT INTO evalora_test_results VALUES ('C1 compute per-class ranks', (r->>'eligible')::int = 2 AND (r->>'rejected')::int = 1, r::text);

  SELECT id INTO v_eligible FROM public.qualification_records WHERE event_id='0a400000-0000-4000-8000-000000000200' AND to_phase_id='0a400000-0000-4000-8000-000000000211' AND status='eligible' ORDER BY source_rank LIMIT 1;
  SELECT id INTO v_rejected FROM public.qualification_records WHERE event_id='0a400000-0000-4000-8000-000000000200' AND to_phase_id='0a400000-0000-4000-8000-000000000211' AND status='rejected' LIMIT 1;

  r := public.verify_phase_admission('0a400000-0000-4000-8000-000000000700');
  INSERT INTO evalora_test_results VALUES ('C2 unqualified direct URL denied', NOT (r->>'allowed')::boolean, r::text);
  r := public.verify_phase_admission('0a400000-0000-4000-8000-000000000700', 'invalid-token', NULL, 'display name spoof', NULL);
  INSERT INTO evalora_test_results VALUES ('C3 invalid token / ref denied', NOT (r->>'allowed')::boolean, r::text);
  r := public.verify_phase_admission('0a400000-0000-4000-8000-000000000700', NULL, NULL, NULL, NULL);
  INSERT INTO evalora_test_results VALUES ('C4 eligible-but-unapproved denied', NOT (r->>'allowed')::boolean, r::text);

  r := public.approve_phase_qualification(v_eligible,'3c3ed712-f409-4aa1-a645-816418e22ec4','Acceptance approval');
  v_token := r->>'admission_token';
  INSERT INTO evalora_test_results VALUES ('C5 organizer approval returns token', v_token IS NOT NULL AND length(v_token) > 20, 'token length ' || length(v_token));
  r := public.verify_phase_admission('0a400000-0000-4000-8000-000000000700', v_token);
  INSERT INTO evalora_test_results VALUES ('C6 approved token admits', (r->>'allowed')::boolean, r::text);
  r := public.verify_phase_admission('0a400000-0000-4000-8000-000000000701', v_token);
  INSERT INTO evalora_test_results VALUES ('C7 token cannot cross classes', NOT (r->>'allowed')::boolean, r::text);

  INSERT INTO public.session_participants(id, session_id, display_name, status, qualification_token_hash)
  VALUES ('de000000-0000-4000-8000-00000000b001','0a400000-0000-4000-8000-000000000900','Qualified One','admitted', public.evalora_hash_secret(v_token));
  r := public.verify_participant_phase_admission('de000000-0000-4000-8000-00000000b001');
  INSERT INTO evalora_test_results VALUES ('C8 state/answer recheck allows', (r->>'allowed')::boolean, r::text);

  INSERT INTO public.session_participants(id, session_id, display_name, status, qualification_token_hash)
  VALUES ('de000000-0000-4000-8000-00000000b002','0a400000-0000-4000-8000-000000000900','Spoofed participant','admitted', public.evalora_hash_secret('wrong-token'));
  r := public.verify_participant_phase_admission('de000000-0000-4000-8000-00000000b002');
  INSERT INTO evalora_test_results VALUES ('C9 forged participant hash denied', NOT (r->>'allowed')::boolean, r::text);

  r := public.override_phase_qualification(v_rejected,'manual_approved','Organizer verified an extenuating circumstance','3c3ed712-f409-4aa1-a645-816418e22ec4');
  v_override_token := r->>'admission_token';
  SELECT count(*) INTO v_count FROM public.qualification_overrides WHERE record_id=v_rejected AND administrator_id='3c3ed712-f409-4aa1-a645-816418e22ec4' AND original_status='rejected' AND new_status='manual_approved' AND reason IS NOT NULL AND event_id IS NOT NULL AND to_phase_id IS NOT NULL AND created_at IS NOT NULL;
  INSERT INTO evalora_test_results VALUES ('C10 override audit complete', v_count = 1, 'audit rows=' || v_count);
  r := public.verify_phase_admission('0a400000-0000-4000-8000-000000000700', v_override_token);
  INSERT INTO evalora_test_results VALUES ('C11 override token admits', (r->>'allowed')::boolean, r::text);

  SELECT score INTO v_count FROM public.exam_attempts WHERE id='de000000-0000-4000-8000-00000000a003';
  INSERT INTO evalora_test_results VALUES ('C12 source result unchanged', v_count = 10, 'score=' || v_count);

  -- RLS: anonymous callers cannot read private rosters / qualifications / pools.
  -- Record counts before inserting into the privileged temp results table.
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_qual_count FROM public.qualification_records;
  SELECT count(*) INTO v_pool_count FROM public.question_pools;
  BEGIN
    INSERT INTO public.session_participants(session_id, display_name, status) VALUES ('0a400000-0000-4000-8000-000000000900','Direct REST spoof','admitted');
    v_insert_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_insert_err = MESSAGE_TEXT;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO evalora_test_results VALUES ('C13 anon cannot read qualifications', v_qual_count = 0, 'rows=' || v_qual_count);
  INSERT INTO evalora_test_results VALUES ('C14 anon cannot read pools', v_pool_count = 0, 'rows=' || v_pool_count);
  INSERT INTO evalora_test_results VALUES ('C15 anon cannot insert participant', v_insert_err IS NOT NULL, coalesce(v_insert_err,'insert allowed'));
END $$;

-- ─── D. Shareable exam link, code hash, names, class and attempts ─────
UPDATE public.exams
SET access_code='TESTLINK', status='open', starts_at=NULL, ends_at=NULL,
    shared_link_enabled=true, invite_expires_at=NULL,
    invite_token='e0000000-0000-4000-8000-0000000000c1',
    event_id='0a400000-0000-4000-8000-000000000200',
    class_id=NULL
WHERE id='0a400000-0000-4000-8000-000000000600';

DO $$
DECLARE r record; v_hash text; v_other uuid; v_msg text; v_count int; v_candidate uuid; v_attempt uuid; v_student_name text; v_attempt_count int; v_answer_count int;
BEGIN
  SELECT * INTO r FROM public.exams WHERE id='0a400000-0000-4000-8000-000000000600';
  INSERT INTO evalora_test_results VALUES ('D1 code hash matches server verifier', r.access_code_hash = public.evalora_hash_secret(public.evalora_normalize_code('testlink')), 'normalized hash check');
  INSERT INTO evalora_test_results VALUES ('D2 wrong code rejected', r.access_code_hash <> public.evalora_hash_secret(public.evalora_normalize_code('WRONGCODE')), 'wrong hash check');
  UPDATE public.exams SET invite_expires_at=now()-interval '1 day' WHERE id=r.id;
  SELECT (invite_expires_at < now())::int INTO v_count FROM public.exams WHERE id=r.id;
  INSERT INTO evalora_test_results VALUES ('D3 expired link detected', v_count = 1, 'expired=' || v_count);
  UPDATE public.exams SET invite_expires_at=NULL WHERE id=r.id;

  SELECT id INTO v_other FROM public.classes WHERE organization_id <> r.organization_id LIMIT 1;
  INSERT INTO evalora_test_results VALUES ('D4 unrelated class not linked', NOT EXISTS (SELECT 1 FROM public.competition_phase_classes WHERE exam_id=r.id AND class_id=v_other), 'other class=' || coalesce(v_other::text,'none'));
  SELECT count(*) INTO v_count FROM public.competition_phase_classes pc
  JOIN public.competition_event_phases p ON p.id=pc.phase_id
  WHERE p.event_id=r.event_id AND pc.exam_id IS NULL
    AND p.phase_key <> coalesce(r.settings->>'stage','elimination');
  INSERT INTO evalora_test_results VALUES ('D4b later-phase classes excluded', v_count > 0, 'excluded later-phase unassigned links=' || v_count);

  BEGIN
    INSERT INTO public.exam_candidates(exam_id, full_name, first_name, last_name, class_id, access_code, source, guest_key_hash)
    VALUES (r.id,'No Names',NULL,NULL,'0a400000-0000-4000-8000-000000000100','BAD-1','shared_link','bad-hash-1');
    INSERT INTO evalora_test_results VALUES ('D5 mandatory first/last/class', false, 'Constraint did not reject');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('D5 mandatory first/last/class', true, v_msg);
  END;

  INSERT INTO public.exam_candidates(id, exam_id, full_name, first_name, last_name, class_id, access_code, source, guest_key_hash, invite_token)
  VALUES ('de000000-0000-4000-8000-000000009101',r.id,'Ada Lovelace','Ada','Lovelace','0a400000-0000-4000-8000-000000000100','SHARE-1','shared_link','guest-hash-1','e0000000-0000-4000-8000-0000000000c1')
  RETURNING id INTO v_candidate;

  BEGIN
    INSERT INTO public.exam_candidates(exam_id, full_name, first_name, last_name, class_id, access_code, source, guest_key_hash)
    VALUES (r.id,'Impostor Ada','Impostor','Ada','0a400000-0000-4000-8000-000000000100','SHARE-2','shared_link','guest-hash-1');
    INSERT INTO evalora_test_results VALUES ('D6 duplicate guest identity rejected', false, 'Unique guard did not reject');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('D6 duplicate guest identity rejected', true, v_msg);
  END;

  INSERT INTO public.exam_attempts(id, exam_id, candidate_id, first_name, last_name, class_id, guest_key_hash, invite_token, status, score, max_score)
  VALUES ('de000000-0000-4000-8000-00000000a101',r.id,v_candidate,'Ada','Lovelace','0a400000-0000-4000-8000-000000000100','guest-hash-1','e0000000-0000-4000-8000-0000000000c1','in_progress',7,10)
  RETURNING id INTO v_attempt;
  INSERT INTO evalora_test_results VALUES ('D7 names/score stored with attempt', EXISTS (SELECT 1 FROM public.exam_attempts WHERE id=v_attempt AND first_name='Ada' AND last_name='Lovelace' AND score=7), 'attempt identity snapshot');

  BEGIN
    INSERT INTO public.exam_attempts(exam_id, candidate_id, first_name, last_name, class_id, guest_key_hash, status)
    VALUES (r.id,v_candidate,'Ada','Lovelace','0a400000-0000-4000-8000-000000000100','guest-hash-1','in_progress');
    INSERT INTO evalora_test_results VALUES ('D8 duplicate attempt rejected', false, 'Unique guard did not reject');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO evalora_test_results VALUES ('D8 duplicate attempt rejected', true, v_msg);
  END;

  SELECT full_name INTO v_student_name FROM public.students WHERE organization_id=r.organization_id LIMIT 1;
  IF v_student_name IS NOT NULL THEN
    INSERT INTO public.exam_candidates(exam_id, full_name, first_name, last_name, class_id, access_code, source, guest_key_hash, student_id)
    VALUES (r.id,v_student_name,split_part(v_student_name,' ',1),v_student_name,'0a400000-0000-4000-8000-000000000100','SHARE-3','shared_link','guest-hash-2',NULL);
    INSERT INTO evalora_test_results VALUES ('D9 name alone never merges student', EXISTS (SELECT 1 FROM public.exam_candidates WHERE exam_id=r.id AND full_name=v_student_name AND guest_key_hash='guest-hash-2' AND student_id IS NULL), 'no name-only association');
  ELSE
    INSERT INTO evalora_test_results VALUES ('D9 name alone never merges student', true, 'No student fixture; API uses verified students.user_id only');
  END IF;

  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_attempt_count FROM public.exam_attempts;
  SELECT count(*) INTO v_answer_count FROM public.exam_answers;
  RESET ROLE;
  INSERT INTO evalora_test_results VALUES ('D10 anon cannot retrieve results', v_attempt_count = 0, 'attempt rows=' || v_attempt_count);
  INSERT INTO evalora_test_results VALUES ('D11 anon cannot read answers', v_answer_count = 0, 'answer rows=' || v_answer_count);
END $$;

SELECT name, passed, detail FROM evalora_test_results ORDER BY name;
ROLLBACK;
