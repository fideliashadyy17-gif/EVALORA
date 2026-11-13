"""Stage the mock paper migrations in the database and apply them from there.

Why this exists: each paper is ~90 KB of exam prose, and moving that text
through a migration tool risks a mangled character that would still *look*
right — a curly apostrophe, a multiplication sign, an em dash. So the prose is
never transmitted. The database fetches the committed files itself from an
immutable GitHub commit, and SQL extracts each part's question payload.

What is sent by hand is only the small, boring SQL: the staging statements, the
quiz row (its description and settings come from the authored source, not from a
long literal), and each paper's ~8 KB assembly file, which is passed through
verbatim. Everything the papers actually say arrives byte-for-byte.

    python3 scripts/exam-import/stage_mock_migrations.py --stage   # fetch files
    python3 scripts/exam-import/stage_mock_migrations.py --apply myp2
    python3 scripts/exam-import/stage_mock_migrations.py --verify  # fingerprints
    python3 scripts/exam-import/stage_mock_migrations.py --done    # cleanup

The commit is pinned, so this is reproducible: it applies exactly the SQL that
`verify_mock_exams.py` audited and `test-myp-mock-migrations.mjs` proved against
PostgreSQL. Every statement is idempotent.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
sys.path.insert(0, str(ROOT / "scripts" / "exam-import"))

REPO = "fideliashadyy17-gif/EVALORA"
ORG = "0a400000-0000-4000-8000-000000000001"
AUTHOR = "3c3ed712-f409-4aa1-a645-816418e22ec4"
CLASS_ID = "0a400000-0000-4000-8000-000000000107"
SUBJECT = "0a400000-0000-4000-8000-000000000030"
PASS_DEFAULT = 50

PAPERS = {
    "myp2": {"prefix": "d2000000-0000-4000-8000", "marks": 189,
             "objective_marks": 55, "structured_marks": 134},
    "myp4": {"prefix": "d4000000-0000-4000-8000", "marks": 221,
             "objective_marks": 62, "structured_marks": 159},
    "myp5": {"prefix": "d5000000-0000-4000-8000", "marks": 259,
             "objective_marks": 60, "structured_marks": 199},
}


def commit():
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def parts(paper):
    return sorted(MIGRATIONS.glob(f"*_{paper}_mock_*.sql"))


def payload_rows(sql):
    rows = []
    for match in re.finditer(r"jsonb_array_elements\('(.*?)'::jsonb\)", sql, re.S):
        rows.extend(json.loads(match.group(1).replace("''", "'")))
    return rows


def fingerprint(rows):
    return {
        "questions": len(rows),
        "prompts": hashlib.md5("".join(r["p"] for r in rows).encode()).hexdigest(),
        "explanations": hashlib.md5("".join(r["e"] for r in rows).encode()).hexdigest(),
    }


def lit(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'" if "'" not in text or True else text


def quoted(text):
    """A SQL string literal that is safe for arbitrary prose ('' for a quote)."""
    return "'" + text.replace("'", "''") + "'"


def staged_files():
    return [path.name for paper in PAPERS for path in parts(paper)]


def stage_sql(sha):
    values = ",\n       ".join(
        f"({quoted(name)}, {quoted(f'https://raw.githubusercontent.com/{REPO}/{sha}/supabase/migrations/{name}')})"
        for name in staged_files()
    )
    return f"""-- Stage the mock paper migrations from the audited commit, fetched by the
-- database itself so the prose is never re-encoded in transit.
create table if not exists public.mock_migration_stage (
  file text primary key,
  url text not null,
  content text,
  fetched_at timestamptz
);

insert into public.mock_migration_stage (file, url) values
       {values}
on conflict (file) do update set url = excluded.url;

update public.mock_migration_stage s
   set content = (extensions.http_get(s.url)).content,
       fetched_at = now()
 where s.fetched_at is null;

do $$
declare
  v_missing int;
  v_wrong int;
begin
  select count(*) into v_missing from public.mock_migration_stage where content is null;
  if v_missing > 0 then
    raise exception 'staging failed: % files could not be fetched', v_missing;
  end if;
  select count(*) into v_wrong
    from public.mock_migration_stage
   where position('mock examination' in lower(content)) = 0;
  if v_wrong > 0 then
    raise exception 'staging failed: % staged files are not mock migrations', v_wrong;
  end if;
end $$;
"""


def authored(paper):
    """The paper's own metadata, from the authored source rather than a literal."""
    module = __import__(f"mock_{paper}")
    return module.EXAM


def apply_sql(paper):
    cfg = PAPERS[paper]
    exam = authored(paper)
    source = f"myp-mock-{paper}-mock"
    quiz_id = f"{cfg['prefix']}-000000000001"
    settings = {
        "randomize_questions": False, "randomize_options": False,
        "assessment_kind": "mock", "grade_level": exam["grade"],
        "curriculum": exam["curriculum"], "subject": "Mathematics",
        "duration_minutes": exam["duration"], "total_marks": cfg["marks"],
        "source": source, "mock_exam_key": exam["key"], "mock_code": exam["code"],
        "sections": [
            {"id": "A", "title": "Section A — Objective", "questions": 22,
             "marks": cfg["objective_marks"],
             "instructions": "One correct answer per question. The options are written so a "
                             "wrong choice identifies a specific misconception."},
            {"id": "B", "title": "Section B — Structured", "questions": 23,
             "marks": cfg["structured_marks"],
             "instructions": "Show your working. Every part carries its own marks, its own "
                             "answer box and its own two hints."},
        ],
    }
    statements = [f"""insert into platform_settings (key, value)
values ('exam_pass_threshold',
        {quoted(json.dumps({"default_percent": PASS_DEFAULT, "organization_overrides": {}},
                           separators=(",", ":")))}::jsonb)
on conflict (key) do nothing;""",
                  f"""insert into quizzes (id, organization_id, title, description, status, settings, created_by)
values ({quoted(quiz_id)}, {quoted(ORG)}, {quoted(exam['title'])}, {quoted(exam['description'])},
        'published', {quoted(json.dumps(settings, ensure_ascii=False, separators=(",", ":")))}::jsonb,
        {quoted(AUTHOR)})
on conflict (id) do nothing;"""]

    for path in parts(paper):
        statements.append(f"""insert into questions (id, organization_id, type, prompt, prompt_doc,
                       explanation, explanation_doc, points, difficulty, topic, subtopic, tags,
                       status, config, created_by, curriculum, curriculum_course, subject_id,
                       review_status, creation_method, class_id)
select ({quoted(cfg['prefix'])} || lpad((100 + (x->>'n')::int)::text, 12, '0'))::uuid,
       {quoted(ORG)}, x->>'t', x->>'p', x->'d', x->>'e', null,
       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',
       array[{quoted(exam['curriculum'])}, 'Mathematics', 'mock', 'mock-examination', {quoted(exam['code'])}],
       'published', x->'cfg', {quoted(AUTHOR)},
       'MYP', {quoted(exam['curriculum'] + ' Mathematics')}, {quoted(SUBJECT)},
       'approved', 'manual', {quoted(CLASS_ID)}
  from public.mock_migration_stage s
  cross join lateral jsonb_array_elements(
         -- The original migration is a SQL string literal, so PostgreSQL turns a
         -- doubled apostrophe into one while parsing it. Reading the file as
         -- text skips that step, so it has to be applied here — otherwise every
         -- apostrophe the paper prints (student's, 'only') arrives doubled.
         replace((regexp_match(s.content, $j$jsonb_array_elements\('(.*?)'::jsonb\)$j$))[1],
                 chr(39) || chr(39), chr(39))::jsonb) as x
 where s.file = {quoted(path.name)}
on conflict (id) do nothing;""")

    return "\n\n".join(statements)


def rowhashes_sql(paper):
    source = f"myp-mock-{paper}-mock"
    return f"""select string_agg((config->>'question_number') || ':' || md5(prompt), ' '
                 order by ((config->>'question_number')::int)) as prompts,
       string_agg((config->>'question_number') || ':' || md5(explanation), ' '
                 order by ((config->>'question_number')::int)) as explanations
  from public.questions where config->>'source' = '{source}';"""


def assembly_sql(paper):
    """Run the paper's assembly file from the staged text, statement by statement.

    The file is ordered (options, accepted variants, paper items, the
    examination row, hints, self-check) and every statement ends with a fixed
    marker, so each one can be located with plain string positions rather than
    regular expressions. What executes is the authored text, so the cover-page
    prose and the hint bodies are character-exact.

    Two details are load-bearing:
      * the outer block uses a $asm$ tag, because a bare $$ inside the body
        (even inside a string literal) would end the block early;
      * the self-check's own "do $$ ... end $$;" markers are therefore built
        with chr(36), never written literally.
    """
    assembly = parts(paper)[-1].name
    literal_blocks = [
        ("insert into question_options", "on conflict (id) do nothing;"),
        ("insert into quiz_questions", "on conflict (quiz_id, question_id) do nothing;"),
        ("insert into exams", "on conflict (id) do nothing;"),
        ("insert into question_hints", "on conflict (id) do nothing;"),
    ]
    steps = []
    for head, tail in literal_blocks:
        steps.append(f"""  -- every {head} statement, executed as written
  loop
    v_at := position({quoted(head)} in v_sql);
    exit when v_at = 0;
    v_sql := substr(v_sql, v_at);
    v_len := position({quoted(tail)} in v_sql);
    if v_len = 0 then
      raise exception 'unterminated statement starting with %', {quoted(head)};
    end if;
    v_len := v_len + {len(tail)} - 1;
    execute substr(v_sql, 1, v_len);
    v_sql := substr(v_sql, v_len + 1);
  end loop;""")

    # The paper's own self-check, delimited by "do $$" / "end $$;".
    steps.append("""  -- the paper's own self-check, which aborts if the paper is incomplete
  loop
    v_at := position(v_do_head in v_sql);
    exit when v_at = 0;
    v_sql := substr(v_sql, v_at);
    v_len := position(v_do_tail in v_sql);
    if v_len = 0 then
      raise exception 'unterminated self-check block in the assembly text';
    end if;
    v_len := v_len + length(v_do_tail) - 1;
    execute substr(v_sql, 1, v_len);
    v_sql := substr(v_sql, v_len + 1);
  end loop;""")

    body = "\n\n".join(steps)
    return f"""-- Run {assembly} verbatim from the staged text.
do $asm$
declare
  v_sql text;
  v_at int;
  v_len int;
  v_do_head text := 'do ' || chr(36) || chr(36);
  v_do_tail text := 'end ' || chr(36) || chr(36) || ';';
begin
  select content into v_sql from public.mock_migration_stage where file = {quoted(assembly)};
  if v_sql is null then
    raise exception 'assembly staged text missing for {assembly}';
  end if;

{body}
end $asm$;"""


def verify_sql():
    return """select config->>'mock_exam_key' as paper,
       count(*)::int as questions,
       md5(string_agg(prompt, '' order by (config->>'question_number')::int)) as prompts,
       md5(string_agg(explanation, '' order by (config->>'question_number')::int)) as explanations
  from public.questions
 where config->>'source' like 'myp-mock-%'
 group by 1 order by 1;"""


def main():
    if "--stage" in sys.argv:
        print(stage_sql(commit()))
    elif "--apply" in sys.argv:
        print(apply_sql(sys.argv[sys.argv.index("--apply") + 1]))
    elif "--verify" in sys.argv:
        print(verify_sql())
    elif "--assembly" in sys.argv:
        print(assembly_sql(sys.argv[sys.argv.index("--assembly") + 1]))
    elif "--rowhashes" in sys.argv:
        print(rowhashes_sql(sys.argv[sys.argv.index("--rowhashes") + 1]))
    elif "--expected" in sys.argv:
        for paper in PAPERS:
            rows = sorted((r for path in parts(paper) for r in payload_rows(path.read_text())),
                          key=lambda r: r["n"])
            values = fingerprint(rows)
            print(f"{paper}-mock  {values['questions']} questions  "
                  f"prompts {values['prompts']}  explanations {values['explanations']}")
    elif "--done" in sys.argv:
        print("""drop table if exists public.mock_migration_stage;
drop extension if exists http;
drop extension if exists dblink;""")
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
