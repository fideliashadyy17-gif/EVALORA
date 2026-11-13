"""Fingerprint the mock papers so a deployment can be proven byte-identical.

A migration is 100+ KB of exam prose. If anything along the way mangles a
character — a curly apostrophe, a multiplication sign, an em dash — the paper
still *looks* right in a screenshot. This prints an md5 of every prompt and
every explanation per paper, from the authored source, together with the exact
SQL that computes the same value in the database.

    python3 scripts/exam-import/mock_fingerprint.py          # expected values
    python3 scripts/exam-import/mock_fingerprint.py --sql    # SQL to run

Run the SQL after applying the migrations and compare: identical hashes mean
the deployed text is character-for-character the text that was audited.
"""
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
SOURCES = {"myp2": "myp-mock-myp2-mock", "myp4": "myp-mock-myp4-mock", "myp5": "myp-mock-myp5-mock"}


def payload(paper):
    """Every question row for one paper, read out of its migration parts."""
    rows = []
    for path in sorted(MIGRATIONS.glob(f"*_{paper}_mock_*.sql")):
        sql = path.read_text()
        for match in re.finditer(r"jsonb_array_elements\('(.*?)'::jsonb\)", sql, re.S):
            rows.extend(json.loads(match.group(1).replace("''", "'")))
    rows.sort(key=lambda row: row["n"])
    return rows


def fingerprint(rows):
    prompts = "".join(row["p"] for row in rows)
    explanations = "".join(row["e"] for row in rows)
    return {
        "questions": len(rows),
        "prompts": hashlib.md5(prompts.encode()).hexdigest(),
        "explanations": hashlib.md5(explanations.encode()).hexdigest(),
    }


def main():
    wanted = {}
    for paper, source in SOURCES.items():
        wanted[paper] = fingerprint(payload(paper))

    if "--sql" in sys.argv:
        # Concatenated in question order, which is the order the source walked.
        # Sort on the integer question number, never on the text: the database's
        # default collation does not order text the way the source does, and a
        # string_agg fed a text key concatenates in a different order than the
        # paper (that mismatch is a bug in the check, not in the data).
        print("select config->>'mock_exam_key' as paper,")
        print("       count(*)::int as questions,")
        print("       md5(string_agg(prompt, '' order by (config->>'question_number')::int)) as prompts,")
        print("       md5(string_agg(explanation, '' order by (config->>'question_number')::int)) as explanations")
        print("  from public.questions")
        print(" where config->>'source' like 'myp-mock-%'")
        print(" group by 1 order by 1;")
        return

    for paper, values in wanted.items():
        print(f"{paper}-mock  {values['questions']} questions  "
              f"prompts {values['prompts']}  explanations {values['explanations']}")


if __name__ == "__main__":
    main()
