#!/usr/bin/env python3
"""Generates supabase/migrations/0058_ap_calculus_limits_exam.sql from ap_limits_spec.py.

Usage:
  python3 build_ap_limits_migration.py            -> the migration (commits the import)
  python3 build_ap_limits_migration.py --test     -> same SQL ending in a forced
                                                     exception, used to rehearse the
                                                     import inside a rolled-back transaction
"""
import importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("spec", os.path.join(HERE, "ap_limits_spec.py"))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

ORG = "0a400000-0000-4000-8000-000000000001"
SRC = "ap-calculus-abbc-limits-practice-exam"
TITLE_EXAM = "AP Examination"
TITLE_QUIZ = "AP Examination"
ACCESS_CODE = "AP-LIM-2026"
FIG_DIR = "/exam-figures/ap-limits/"
TEST = "--test" in sys.argv


def split_inline(text):
    """Split '$…$' / '$$…$$' text into rich nodes. '\\$' is a literal dollar sign."""
    text = text.replace("\\$", "\u0000")
    nodes = []
    for part in re.split(r"(\$\$.+?\$\$|\$[^$]+?\$)", text):
        if not part:
            continue
        if part.startswith("$$") and part.endswith("$$"):
            nodes.append({"type": "mathInline", "attrs": {"latex": part[2:-2]}})
        elif part.startswith("$") and part.endswith("$") and len(part) > 1:
            nodes.append({"type": "mathInline", "attrs": {"latex": part[1:-1]}})
        else:
            nodes.append({"type": "text", "text": part.replace("\u0000", "$")})
    return nodes


def block_node(b, n):
    if isinstance(b, dict):
        key = b["img"]
        return {"type": "image", "attrs": {"src": FIG_DIR + key + ".png", "alt": f"Figure for question {n}", "width": S.FIGURES[key]}}
    stripped = b.strip()
    if stripped.startswith("$$") and stripped.endswith("$$") and stripped.count("$$") == 2:
        return {"type": "mathBlock", "attrs": {"latex": stripped[2:-2]}}
    return {"type": "paragraph", "content": split_inline(b)}


def plain(b):
    if isinstance(b, dict):
        return ""
    return b.replace("\\$", "$")


def dq(s):
    """Dollar-quote a string literal, refusing any collision with the delimiter."""
    tag = "$zq$"
    assert tag not in s, s
    return f"{tag}{s}{tag}"


def dj(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    assert "$zj$" not in s
    return f"$zj${s}$zj$::jsonb"


def chapter(n):
    for lo, hi, name in S.CHAPTERS:
        if lo <= n <= hi:
            return name
    raise ValueError(n)


def question_sql(q):
    """Plain $…$ text renders through MathText; a rich document is stored only when a figure must be shown."""
    n = q["n"]
    prompt = "\n".join(p for p in (plain(b) for b in q["blocks"]) if p)
    fig_keys = [b["img"] for b in q["blocks"] if isinstance(b, dict)]
    doc = {"type": "doc", "content": [block_node(b, n) for b in q["blocks"]]} if fig_keys else None
    config = {
        "source": SRC, "question_number": n, "part": "A" if n <= 30 else "B",
        "chapter": chapter(n), "printed_level": q["lvl"], "bc_only": q["bc"],
        "figure": (FIG_DIR + fig_keys[0] + ".png") if fig_keys else None,
        "answer_key": q["ans"], "answer_key_status": "derived_and_checked_on_page_images",
        "marks_printed_in_pdf": False,
    }
    rows = []
    for i, opt in enumerate(q["opts"]):
        letter = "ABCD"[i]
        rows.append(f"    ({dq(opt)}, {'true' if letter == q['ans'] else 'false'}, {i + 1})")
    values_sql = ",\n".join(rows)
    doc_sql = dj(doc) if doc else "null"
    return f"""with q_{n} as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('{ORG}', 'single_choice', {dq(prompt)}, {doc_sql}, null, 1, '{q["lvl"]}',
          {dq(chapter(n))}, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', {dj(config)})
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_{n}.id, v.label, v.ok, v.pos
  from q_{n}, (values
{values_sql}
  ) as v(label, ok, pos);
"""


HEADER = f"""-- AP Examination — AP Calculus AB/BC, Limits Practice Exam (Oak International School)
--
-- Source document: "AP Calculus ABBC.pdf" — Limits Practice Exam, Student Edition,
-- 17 pages, fifty multiple-choice questions (1–30 Part A no calculator, 31–50
-- Part B calculator permitted; 45–50 BC only). The student edition prints no answer
-- key and no marks per item.
--
-- Fidelity rules applied:
--   * every stem and option is transcribed from the page images, not from the text
--     layer (the text layer drops superscripts and signs, e.g. 3^x in item 38);
--   * the sixteen figures and printed tables (items 1–7, 21, 23, 26, 29, 31, 34–36, 45)
--     are cropped from their own pages at 200 dpi into public/exam-figures/ap-limits/;
--   * the answer key is DERIVED by hand (no key is printed) and checked on the page
--     images; it is stored in config.answer_key with answer_key_status set accordingly;
--   * each item is worth 1 mark: the PDF prints no marks, so this is a default that
--     the owner must confirm;
--   * no explanation text is written: the PDF contains none;
--   * question order and option order stay fixed, A–D as printed.
--
-- Safety: this migration only INSERTs new rows (one quiz, 50 questions, 200 options,
-- 50 quiz links, one draft examination). It does not update or delete any existing
-- row, so the examinations already open (Summative Assessment — Grade 7, 9 and 10) and
-- their attempts are untouched. The examination is created as 'draft' and is not
-- visible to candidates until an owner publishes it.
--
-- Idempotent: an existing examination with this title in this organization stops the block.
-- Atomic: any failed check raises an exception and rolls the whole migration back.
"""

parts = [HEADER, "do $body$\ndeclare\n  v_org uuid := '" + ORG + "';\n  v_quiz uuid;\n  v_exam uuid;\n  v_n int;\n  v_o int;\n  v_c int;\n  v_qq int;\nbegin\n"
         "  if exists (select 1 from public.exams where organization_id = v_org and title = '" + TITLE_EXAM + "') then\n"
         "    raise notice 'AP Examination already exists, nothing to do.';\n    return;\n  end if;\n\n"
         "  insert into public.quizzes (organization_id, title, description, status, settings)\n  values (\n    v_org,\n"
         "    " + dq(TITLE_QUIZ) + ",\n"
         "    " + dq("AP Calculus AB/BC — Limits Practice Exam. Fifty multiple-choice questions on limits: one-sided and two-sided limits, algebraic evaluation, special trigonometric limits, infinite limits, limits at infinity, indeterminate forms; questions 45–50 are BC only.") + ",\n"
         "    'published',\n    " + dj({"randomize_questions": False, "randomize_options": False}) + "\n  )\n  returning id into v_quiz;\n\n"]

for q in S.Q:
    parts.append(f"  -- Question {q['n']}\n" + question_sql(q) + "\n")

parts.append(f"""  insert into public.quiz_questions (quiz_id, question_id, position, points)
  select v_quiz, q.id, (q.config ->> 'question_number')::int, 1
    from public.questions q
   where q.organization_id = v_org and q.config ->> 'source' = '{SRC}'
   order by (q.config ->> 'question_number')::int;

  insert into public.exams
    (organization_id, quiz_id, class_id, title, description, instructions, duration_minutes,
     status, access_code, shared_link_enabled, settings)
  values (
    v_org,
    v_quiz,
    null,
    {dq(TITLE_EXAM)},
    {dq("AP Calculus AB/BC — Limits Practice Exam. 50 multiple-choice questions, one correct answer each. Questions 45–50 are for BC students only.")},
    {dq("Mark one answer per question. There is no penalty for guessing, so answer every question. Part A (questions 1–30) does not allow a calculator; in Part B (questions 31–50) a graphing calculator is permitted, but your reasoning must support each choice. Answers are exact values unless a graphing calculator is specified.")},
    75,
    'draft',
    '{ACCESS_CODE}',
    false,
    {dj({"randomize_questions": False, "randomize_options": False, "track_selection": True, "track_policy": {"AB": "questions 1-44 (bc_only items excluded)", "BC": "questions 1-50"}, "scoring": "ap_mcq_no_penalty", "parts": [{"name": "Part A", "questions": "1-30", "minutes": 45, "calculator": False}, {"name": "Part B", "questions": "31-50", "minutes": 30, "calculator": True}]})}
  )
  returning id into v_exam;

  select count(*) into v_n from public.questions
   where organization_id = v_org and config ->> 'source' = '{SRC}';
  select count(*) into v_o from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = '{SRC}';
  select count(*) into v_c from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = '{SRC}' and o.is_correct;
  select count(*) into v_qq from public.quiz_questions where quiz_id = v_quiz;

  if v_n <> 50 or v_o <> 200 or v_c <> 50 or v_qq <> 50 then
    raise exception 'AP import incomplete: questions=%, options=%, keyed=%, quiz_questions=%', v_n, v_o, v_c, v_qq;
  end if;
""")

if TEST:
    parts.append("  raise exception 'AP_TEST_ROLLBACK questions=%, options=%, keyed=%, quiz_questions=%, exam=%', v_n, v_o, v_c, v_qq, v_exam;\n")

parts.append("end $body$;\n")
sql = "".join(parts)
out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else None
if out is None:
    out = os.path.join(HERE, "..", "..", "supabase", "migrations", "0058_ap_calculus_limits_exam.sql") if not TEST else "/home/user/exam-work/ap_limits_test.sql"
with open(out, "w", encoding="utf-8") as f:
    f.write(sql)
print("wrote", os.path.abspath(out), len(sql), "chars")
