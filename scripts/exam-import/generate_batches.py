import json
import pathlib
import build_grade10_myp5_sequences_summative as builder

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent

questions, options = builder.build_all_questions()

batches = {
    "batch_part_a_1": questions[0:10],    # Q1–10
    "batch_part_a_2": questions[10:20],   # Q11–20
    "batch_part_a_3": questions[20:25],   # Q21–25
    "batch_part_b_task1": questions[25:31], # Q26–31 (Task 1 Crit A)
    "batch_part_b_task2": questions[31:35], # Q32–35 (Task 2 Crit B)
    "batch_part_b_task3": questions[35:40], # Q36–40 (Task 3 Crit C)
    "batch_part_b_task4": questions[40:45], # Q41–45 (Task 4 Crit D)
}

def make_insert_questions(q_list):
    q_elements = []
    for q in q_list:
        q_elements.append({
            "id": q["id"],
            "n": q["n"],
            "t": q["type"],
            "p": q["prompt"],
            "d": q["prompt_doc"],
            "e": q["explanation"],
            "m": q["points"],
            "df": q["difficulty"],
            "tp": q["topic"],
            "st": q["subtopic"],
            "cfg": q["config"],
        })
    return f"""insert into questions (id, organization_id, type, prompt, prompt_doc, explanation,
                       points, difficulty, topic, subtopic, tags, status, config,
                       created_by, curriculum, curriculum_course, subject_id,
                       review_status, creation_method, class_id, source_reference)
select (x->>'id')::uuid,
       '{builder.ORG_ID}', x->>'t', x->>'p', x->'d', x->>'e',
       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',
       array['MYP 5', 'Grade 10', 'Mathematics', 'summative', 'sequences-and-series', 'criteria-a-d']::text[],
       'published', x->'cfg',
       '{builder.CREATED_BY}', 'MYP', 'MYP 5 Mathematics', '{builder.SUBJECT_ID}',
       'approved', 'manual', '{builder.CLASS_ID}', '{builder.SOURCE}'
  from jsonb_array_elements('{builder.json_sql(q_elements)}'::jsonb) as x
on conflict (id) do update set
   type = excluded.type,
   prompt = excluded.prompt,
   prompt_doc = excluded.prompt_doc,
   explanation = excluded.explanation,
   points = excluded.points,
   difficulty = excluded.difficulty,
   topic = excluded.topic,
   subtopic = excluded.subtopic,
   tags = excluded.tags,
   status = 'published',
   config = excluded.config,
   review_status = 'approved',
   updated_at = now();"""

out_dir = ROOT / "batches"
out_dir.mkdir(exist_ok=True)

for name, q_list in batches.items():
    sql = make_insert_questions(q_list)
    (out_dir / f"{name}.sql").write_text(sql, encoding="utf-8")
    print(f"Wrote {name}.sql: {len(q_list)} questions, {len(sql)} bytes")

# Also write options in two batches of 50
opts_1 = options[:50]
opts_2 = options[50:]

def make_insert_options(opt_list, delete_first=False):
    opt_elements = []
    for opt in opt_list:
        opt_elements.append({
            "qid": opt["question_id"],
            "l": opt["label"],
            "c": opt["is_correct"],
            "p": opt["position"],
            "doc": opt["content_doc"],
        })
    prefix = ""
    if delete_first:
        prefix = f"""delete from question_options where question_id in (
  select id from questions where id::text like '{builder.ID_PREFIX}%'
);
"""
    return f"""{prefix}insert into question_options (question_id, label, is_correct, position, content_doc)
select (o->>'qid')::uuid, o->>'l', (o->>'c')::boolean, (o->>'p')::integer, o->'doc'
  from jsonb_array_elements('{builder.json_sql(opt_elements)}'::jsonb) as o;"""

(out_dir / "options_1.sql").write_text(make_insert_options(opts_1, delete_first=True), encoding="utf-8")
(out_dir / "options_2.sql").write_text(make_insert_options(opts_2, delete_first=False), encoding="utf-8")
print("Wrote options_1.sql and options_2.sql")
