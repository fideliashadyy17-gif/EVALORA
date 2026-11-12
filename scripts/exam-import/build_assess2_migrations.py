"""Build migrations 0088-0090: the Criteria A–D formative papers (Formative 2).

Regenerate with:  python3 scripts/exam-import/build_assess2_migrations.py
New IDs/slugs/codes only — the original Assess Prep papers (0085-0087) are
never touched. Config carries myp_criterion + strand per question and per part.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from assess2_common import check_exam2
from build_assess_prep_migrations import doc_for, esc, txt, ORG, SUBJECT, AUTHOR
import assess2_myp2, assess2_myp4, assess2_myp5

ROOT = Path(__file__).resolve().parents[2]

def build(mod, migration_name, prefix):
    exam, questions = mod.EXAM, mod.QUESTIONS
    marks, visuals = check_exam2(exam["title"], questions, mod.CRIT_SPLIT,
                                 banned_topics=("probability",) if mod is assess2_myp4 else ())
    source = f"assess2-{exam['key']}-criteria"
    quiz_id, exam_id = f"{prefix}-000000000001", f"{prefix}-000000000002"

    payload = []
    for q in questions:
        first_hint = q["parts"][0]["hints"][0] if q["type"] == "assess_parts" else q["hints"][0]
        next_time = q.get("next") or first_hint
        explanation = q["explanation"].rstrip() + f"\n\nHint for next time: {next_time}"
        cfg = {"source": source, "question_number": q["n"], "myp_criterion": q["criterion"],
               "strand": q["strand"], "next_time_hint": next_time,
               "assessment_style": "assess2_criteria_typed",
               "hints": (q["hints"] if q["type"] != "assess_parts" else [])}
        if q["type"] == "assess_parts":
            cfg["parts"] = q["parts"]
        elif q["kind"] == "numeric":
            cfg["numeric_answer"], cfg["tolerance"] = q["answer"], q["tolerance"]
        elif q["kind"] in ("text", "expr"):
            cfg["accepted"] = q["accepted"]
            if q["kind"] == "expr": cfg["normalize_expression"] = True
        elif q["kind"] == "open":
            cfg.update({"marking_criteria": q["criteria"], "response_tools": ["rich_text", "math", "table"],
                        "response_requirement": "text",
                        "response_guidance": "Write 1–2 clear sentences. Give your conclusion first, then justify it."})
        payload.append({
            "n": q["n"], "t": q["type"], "p": q["prompt"],
            "d": doc_for(q["prompt"], q["diagram"]),
            "e": explanation, "m": q["points"], "df": q["difficulty"],
            "tp": q["topic"], "st": q["subtopic"], "cfg": cfg,
        })
    payload_sql = txt(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    sql = f"""-- {migration_name}
-- {exam['title']}
-- Criteria A-D formative: typed answers only, criterion+strand tagged,
-- 2 hint levels per question/part, native SVG diagrams. Idempotent.
begin;

insert into quizzes (id, organization_id, title, description, status, settings, created_by)
values ({txt(quiz_id)}, {txt(ORG)}, {txt(exam['title'])}, {txt(exam['description'])}, 'published',
        {txt(json.dumps({"randomize_questions": False, "randomize_options": False, "assessment_kind": "formative", "grade_level": exam["grade"], "curriculum": exam["curriculum"], "subject": "Mathematics", "duration_minutes": exam["duration"], "total_marks": marks, "source": source}, separators=(",", ":")))}::jsonb, {txt(AUTHOR)})
on conflict (id) do nothing;

insert into questions (id, organization_id, type, prompt, prompt_doc, explanation, explanation_doc,
                       points, difficulty, topic, subtopic, tags, status, config, created_by,
                       curriculum, curriculum_course, subject_id, review_status, creation_method, class_id)
select ({txt(prefix)} || lpad((100 + (x->>'n')::int)::text, 12, '0'))::uuid,
       {txt(ORG)}, x->>'t', x->>'p', x->'d', x->>'e', null,
       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',
       array[{txt(exam['curriculum'])}, 'Mathematics', 'formative', 'assess2-criteria'], 'published', x->'cfg', {txt(AUTHOR)},
       'MYP', {txt(exam['curriculum'] + ' Mathematics')}, {txt(SUBJECT)}, 'approved', 'manual', {txt(exam['class_id'])}
  from jsonb_array_elements({payload_sql}::jsonb) as x
on conflict (id) do nothing;

insert into question_options (id, question_id, label, is_correct, position)
select ({txt(prefix)} || lpad((300000 + (q.config->>'question_number')::int * 100 + (v.idx - 1))::text, 12, '0'))::uuid,
       q.id, v.variant, true, v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'accepted') with ordinality as v(variant, idx)
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (id) do nothing;

insert into quiz_questions (quiz_id, question_id, position, points)
select {txt(quiz_id)}, q.id, (q.config->>'question_number')::int, q.points
  from questions q
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, class_id, title, description, instructions, duration_minutes, status, access_code, shared_link_enabled, settings, created_by)
values ({txt(exam_id)}, {txt(ORG)}, {txt(quiz_id)}, {txt(exam['class_id'])}, {txt(exam['title'])}, {txt(exam['description'])},
  'Type every answer in the box provided — there are no options to choose from. Each question shows its MYP criterion and strand. Multi-part questions have a separate box and separate marks for each part. Press the Hint button whenever you are stuck: hints show you the way but never give the answer, and using a hint costs no marks. You have {'1 hour (60 minutes)' if exam['duration'] == 60 else str(exam['duration']) + ' minutes'}. Your feedback shows the correct answer, a worked solution, a hint for next time, and your score by criterion A-D with an indicative MYP level band.',
  {exam['duration']}, 'open', {txt(exam['access_code'])}, true,
  {txt(json.dumps({"proctoring": False, "require_screen_share": False, "randomize_questions": False, "randomize_options": False, "pass_mark_percent": 50, "results_published": True, "access_mode": "shared_link", "identity_fields": [], "eligible_class_ids": [exam["class_id"]], "attempt_policy": "single_resume", "assessment_kind": "formative", "grade_level": exam["grade"], "curriculum": exam["curriculum"], "subject": "Mathematics", "total_marks": marks, "source": source}, separators=(",", ":")))}::jsonb, {txt(AUTHOR)})
on conflict (id) do nothing;

insert into question_hints (id, organization_id, exam_id, question_id, level, body, status, source, created_by, approved_by)
select ({txt(prefix)} || lpad((500000 + (q.config->>'question_number')::int * 10 + h.level)::text, 12, '0'))::uuid,
       {txt(ORG)}, {txt(exam_id)}, q.id, h.level, h.body, 'published', 'manual', {txt(AUTHOR)}, {txt(AUTHOR)}
  from questions q
  cross join lateral (values
    (1, case when q.type = 'assess_parts'
             then 'Work through the parts in order: later parts often build on earlier ones. Every part also has its own Hint button beside its answer box.'
             else q.config->'hints'->>0 end),
    (2, case when q.type = 'assess_parts'
             then 'For part (a), start here: ' || (q.config->'parts'->0->'hints'->>0)
             else q.config->'hints'->>1 end)
  ) as h(level, body)
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (id) do nothing;

commit;
"""
    out = ROOT / "supabase" / "migrations" / migration_name
    out.write_text(sql)
    print(f"{migration_name}: 25 questions, {marks} marks, {visuals} visuals, {len(sql)//1024} KB -> {out}")

if __name__ == "__main__":
    build(assess2_myp2, "0088_assess2_myp2.sql", "c2000000-0000-4000-8000")
    build(assess2_myp4, "0089_assess2_myp4.sql", "c4000000-0000-4000-8000")
    build(assess2_myp5, "0090_assess2_myp5.sql", "c5000000-0000-4000-8000")
