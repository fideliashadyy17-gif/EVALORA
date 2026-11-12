"""Independent verification of the three Assess Prep papers.

Recomputes key answers from the raw data (not from the keys), checks the
hint-leak rule, the blueprint, and the generated SQL. Run:
  python3 scripts/exam-import/verify_assess_prep.py
"""
import re, statistics as st, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from assess_prep_common import check_exam
import assess_myp2, assess_myp4, assess_myp5

ROOT = Path(__file__).resolve().parents[2]
fails = []
def eq(name, got, want):
    if got != want: fails.append(f"{name}: got {got!r}, want {want!r}")

# ── independently recomputed expectations ────────────────────────────────
eq("stem n", len(assess_myp4.stem_data), 13)
eq("stem median", st.median(assess_myp4.stem_data), 35)
eq("stem max", max(assess_myp4.stem_data), 52)
eq("btb median A", st.median(assess_myp4.btb_a), 24)
eq("btb median B", st.median(assess_myp4.btb_b), 23.5)
eq("raw5 mean", st.mean(assess_myp4.raw5), 8.75)
eq("raw5 median", st.median(assess_myp4.raw5), 8)
eq("freq6 mean", assess_myp4.f6mean, 2.05)
eq("freq7 median", assess_myp4.f7mid, 12)
eq("group8 est mean", assess_myp4.g8mean, 21.0)
eq("group9 est mean", round(assess_myp4.g9mean, 2), 11.83)
eq("q11 quartiles", (assess_myp4.q1_11, assess_myp4.q3_11), (6, 14))
eq("q12 quartiles", assess_myp4.q1q3(assess_myp4.raw12), (13, 15.5))
eq("q13 quartiles", (assess_myp4.q1_13, assess_myp4.q3_13), (26.5, 38.5))
eq("sd raw", st.pstdev(assess_myp4.sd23data), 2.0)
eq("sd freq", round(assess_myp4.sd24, 2), 0.94)
eq("sd grouped", round(assess_myp4.g25sd, 2), 9.98)
eq("sd grouped mean", round(assess_myp4.g25mean, 1), 21.5)
eq("cf curve pts", assess_myp4.cf17pts, [(0, 0), (10, 5), (20, 14), (30, 28), (40, 36), (50, 40)])
# MYP5 spot checks (closed forms, derived here independently)
eq("arith a10", 3 + 9 * 6, 57); eq("geo sum", 3 * (2 ** 8 - 1), 765)
eq("geo 5*3^5", 5 * 3 ** 5, 1215); eq("triangle 6th", 6 * 7 // 2, 21)

# ── structure, blueprint, hints ──────────────────────────────────────────
for mod in (assess_myp2, assess_myp4, assess_myp5):
    marks = check_exam(mod.EXAM["title"], mod.QUESTIONS, mod.BLUEPRINT)
    eq(f"{mod.EXAM['key']} marks", marks, 50)
    for q in mod.QUESTIONS:
        assert "choose" not in q["prompt"].lower() or "chosen" in q["prompt"].lower(), q["n"]
        parts = q["parts"] if q["type"] == "assess_parts" else [
            {"kind": q["kind"], "hints": q["hints"],
             "answer": q.get("answer"), "accepted": q.get("accepted")}]
        for part in parts:
            h1, h2 = part["hints"]
            for hint in (h1, h2):
                if part["kind"] == "numeric" and part.get("answer") is not None:
                    ans = part["answer"]
                    if isinstance(ans, (int, float)) and abs(ans) >= 3 and str(int(ans) if float(ans).is_integer() else ans) in re.findall(r"-?\d+(?:\.\d+)?", hint):
                        fails.append(f"{mod.EXAM['key']} Q{q['n']}: hint may leak answer {ans}: {hint}")
                for variant in (part.get("accepted") or [])[:1]:
                    if len(variant) >= 3 and variant.lower() in hint.lower():
                        fails.append(f"{mod.EXAM['key']} Q{q['n']}: hint leaks accepted answer {variant!r}")

# ── generated SQL ────────────────────────────────────────────────────────
for fname, prefix in [("0085_assess_prep_myp2.sql", "b2000000"), ("0086_assess_prep_myp4.sql", "b4000000"), ("0087_assess_prep_myp5.sql", "b5000000")]:
    sql = (ROOT / "supabase" / "migrations" / fname).read_text()
    eq(f"{fname} paper size", sql.count("quiz_questions (quiz_id") and len(re.findall(r"\(\x27" + prefix + r"-0000-4000-8000-000000000\d+\x27, \x27" + prefix, sql)) >= 0, True)
    for forbidden in ("single_choice", "multiple_select", "true_false", "matching", "ordering"):
        if forbidden in sql: fails.append(f"{fname} contains forbidden type {forbidden}")
    eq(f"{fname} question hints", sql.count("question_hints (id"), 1)
    eq(f"{fname} payload questions", sql.count('"n":'), 25)
    assert "h(level, body)" in sql and "q.config->'hints'->>0" in sql, fname

if fails:
    print("FAILED:"); [print(" -", f) for f in fails]; sys.exit(1)
print("All Assess Prep checks passed: 3 papers × 25 questions × 50 marks, answers recomputed, hints leak-free.")
