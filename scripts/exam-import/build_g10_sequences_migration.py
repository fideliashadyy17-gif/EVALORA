#!/usr/bin/env python3
"""Generates supabase/migrations/0060_g10_examination.sql from g10_sequences_spec.py.

Usage: python3 build_g10_sequences_migration.py [output_path]
The migration is idempotent (an existing 'G10 Examination' stops the block) and atomic
(any failed count check raises, which rolls the whole migration back).
"""
import importlib.util, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("spec", os.path.join(HERE, "g10_sequences_spec.py"))
S = importlib.util.module_from_spec(spec); spec.loader.exec_module(S)

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "supabase", "migrations", "0060_g10_examination.sql")

DIFFICULTY = {1: "easy", 2: "easy", 3: "medium", 4: "medium", 5: "hard", 6: "hard"}


def num_value(x):
    return round(float(x), 6)


def config_for(item):
    n, part, kind = item["n"], item["part"], item["kind"]
    crit, level, _ = S.META[n]
    cfg = {
        "source": S.SRC,
        "question_number": n,
        "part": part or "-",
        "chapter": S.chapter(n),
        "criterion": crit,
        "printed_level": f"Level {level}",
        "printed_question_marks": S.META[n][2],
        "marks_printed_in_pdf": "question total only",
    }
    if kind == "numeric":
        cfg["numeric_answer"] = num_value(item["value"])
        cfg["tolerance"] = num_value(item["tol"])
    elif kind == "match":
        cfg["match_mode"] = "match"
        cfg["pairs"] = item["pairs"]
    elif kind == "sort":
        cfg["match_mode"] = "sort"
        cfg["pairs"] = item["pairs"]
    elif kind == "open":
        cfg["marking_criteria"] = item["criteria"]
    elif kind == "order":
        cfg["correct_order"] = item["steps"]
    return cfg


def qtype(kind):
    return {"numeric": "numeric", "order": "ordering", "match": "matching", "sort": "matching", "open": "open_ended"}[kind]


def item_json(item, position):
    return {
        "position": position,
        "type": qtype(item["kind"]),
        "prompt": item["prompt"],
        "points": item["pts"],
        "difficulty": DIFFICULTY[S.META[item["n"]][1]],
        "topic": S.chapter(item["n"]),
        "config": config_for(item),
        "options": [{"label": s, "is_correct": True} for s in item["steps"]] if item["kind"] == "order" else [],
    }


def dollar(s, tag="$zj$"):
    assert tag not in s, "delimiter collision"
    return f"{tag}{s}{tag}"


def build():
    items = [item_json(i, pos) for pos, i in enumerate(S.ITEMS, start=1)]
    payload = json.dumps(items, ensure_ascii=False, separators=(",", ":"))
    total = round(sum(float(i["points"]) for i in items), 2)
    assert total == S.TOTAL_MARKS, total
    exam_desc = ("MYP 5 Sequences & Series E-Assessment. Fifty printed questions (105 scored answer parts), "
                 "100 marks, 90 minutes: recursive and explicit formulas, linear sequences, arithmetic sequences, "
                 "quadratic sequences, geometric sequences and arithmetic series.")
    instructions = ("Answer every part. Show your working where it is asked for. Give units and follow the rounding "
                    "instruction in each question. A calculator is allowed. Sort and match questions: drag each item onto its "
                    "target (on a touch screen, tap an item and then tap its target). Ordering questions: drag the steps into "
                    "order, or use the arrows. Written parts are marked against the criteria shown to the examiner.")
    return f"""-- G10 Examination — MYP 5 Sequences & Series E-Assessment (Oak International School)
--
-- Source document: "MYP 5 Mathematics.pdf", 27 pages, 50 printed theory and reasoning questions, 100 marks,
-- 90 minutes. The paper prints no answer key. Every answer was derived by hand and checked independently in
-- scripts/exam-import/verify_g10_sequences.py.
--
-- Structure: 50 printed questions are stored as {len(items)} scored answer parts (the engine has no multi-part type).
-- Each part keeps its printed question number in config.question_number and its letter in config.part.
-- Marks per question equal the printed totals (16/11/16/19/20/18 by chapter, 100 overall).
--
-- Interaction types: numeric (auto), ordering (auto, drag or arrows), matching in match mode and sort mode
-- (auto, drag or tap), open_ended (marked against config.marking_criteria).
--
-- Idempotent: an existing examination with this title in this organization stops the block.
-- Atomic: a failed count check raises and rolls the whole migration back.
do $body$
declare
  v_org uuid := '{S.ORG}';
  v_quiz uuid;
  v_exam uuid;
  v_items jsonb := {dollar(payload)}::jsonb;
  v_item jsonb;
  v_qid uuid;
  v_n int;
  v_o int;
  v_qq int;
  v_points numeric;
begin
  if exists (select 1 from public.exams where organization_id = v_org and title = $zq$G10 Examination$zq$) then
    raise notice 'G10 Examination already exists, nothing to do.';
    return;
  end if;

  insert into public.quizzes (organization_id, title, description, status, settings)
  values (
    v_org,
    $zq$G10 Examination$zq$,
    $zq${exam_desc}$zq$,
    'published',
    $zj${{"randomize_questions":false,"randomize_options":false}}$zj$::jsonb
  )
  returning id into v_quiz;

  for v_item in select value from jsonb_array_elements(v_items) as t(value) order by (value->>'position')::int loop
    insert into public.questions
      (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
    values (
      v_org,
      v_item->>'type',
      v_item->>'prompt',
      null,
      null,
      (v_item->>'points')::numeric,
      v_item->>'difficulty',
      v_item->>'topic',
      array['myp5','sequences-series']::text[],
      'published',
      'approved',
      v_item->'config'
    )
    returning id into v_qid;

    if v_item->>'type' = 'ordering' then
      insert into public.question_options (question_id, label, is_correct, position)
      select v_qid, o->>'label', (o->>'is_correct')::boolean, ord::int
        from jsonb_array_elements(v_item->'options') with ordinality as x(o, ord);
    end if;

    insert into public.quiz_questions (quiz_id, question_id, position, points)
    values (v_quiz, v_qid, (v_item->>'position')::int, (v_item->>'points')::numeric);
  end loop;

  insert into public.exams
    (organization_id, quiz_id, class_id, title, description, instructions, duration_minutes,
     status, access_code, shared_link_enabled, settings)
  values (
    v_org,
    v_quiz,
    null,
    $zq$G10 Examination$zq$,
    $zq${exam_desc}$zq$,
    $zq${instructions}$zq$,
    90,
    'draft',
    '{S.ACCESS_CODE}',
    false,
    $zj${{"randomize_questions":false,"randomize_options":false,"total_marks":100}}$zj$::jsonb
  )
  returning id into v_exam;

  select count(*) into v_n from public.questions
   where organization_id = v_org and config ->> 'source' = '{S.SRC}';
  select count(*) into v_o from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = '{S.SRC}';
  select count(*), coalesce(sum(points), 0) into v_qq, v_points from public.quiz_questions where quiz_id = v_quiz;

  if v_n <> {len(items)} or v_o <> {sum(len(i['options']) for i in items)} or v_qq <> {len(items)} or v_points <> {S.TOTAL_MARKS} then
    raise exception 'G10 import incomplete: questions=%, options=%, quiz_questions=%, marks=%', v_n, v_o, v_qq, v_points;
  end if;
end $body$;
"""


if __name__ == "__main__":
    sql = build()
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(sql)
    print(f"wrote {os.path.abspath(OUT)} ({len(sql)} bytes, {len(S.ITEMS)} parts)")
