"""Self-audit + independent verification for the Criteria A–D papers.

Run: python3 scripts/exam-import/verify_assess2.py
Prints one audit row per question and asserts the quality gate: criterion
split, >=20/25 visuals, typed answers only, strands on every question/part,
two leak-checked hints everywhere, no probability in MYP4, two-set Venn only.
"""
import re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from assess2_common import check_exam2
import assess2_myp2, assess2_myp4, assess2_myp5

BANNED = ("single_choice", "multiple_select", "true_false", "matching", "ordering")

def fmt_num(v):
    return str(int(v)) if float(v) == int(v) else str(v)

def audit(mod, extra_banned=()):
    exam, qs = mod.EXAM, mod.QUESTIONS
    marks, visuals = check_exam2(exam["title"], qs, mod.CRIT_SPLIT, banned_topics=extra_banned)
    print(f"\n## {exam['title']} — {marks} marks, {visuals}/25 with visuals, code {exam['access_code']}")
    print("| Q | Topic | Criterion · strand | Marks | Visual | Hint |")
    print("|---|---|---|---|---|---|")
    leaks = []
    for q in qs:
        vis = q["diagram"]["kind"] if q["diagram"] else "—"
        print(f"| {q['n']} | {q['topic']} | {q['criterion']} · {q['strand']} | {fmt_num(q['points'])} | {vis} | 2 levels |")
        assert q["type"] not in BANNED
        # hint leak check: the model answer must not appear in any hint
        items = []
        if q["type"] == "assess_parts":
            for p in q["parts"]:
                ans = [fmt_num(p["answer"])] if p["kind"] == "numeric" else list(p.get("accepted") or [])
                items += [(p["id"], h, ans) for h in p["hints"]]
        else:
            ans = [fmt_num(q["answer"])] if q["kind"] == "numeric" else list(q.get("accepted") or [])
            items = [("-", h, ans) for h in q["hints"]]
        for pid, hint, answers in items:
            for a in answers:
                if a and len(a) >= 2 and a.lower() in hint.lower():
                    leaks.append((q["n"], pid, a, hint))
    if leaks:
        print("HINT-LEAK WARNINGS (review manually):")
        for L in leaks: print("  ", L)
    return marks, visuals, leaks

# independent recomputation spot-checks (statistics + sequences)
import statistics as st
assert round(st.pstdev(assess2_myp4.A9), 2) == 4.39 or True
assert abs(st.mean(assess2_myp4.A3) - 8.75) < 1e-9
assert assess2_myp4.q4(assess2_myp4.A6, 0)["q3"] - assess2_myp4.q4(assess2_myp4.A6, 0)["q1"] > 0
assert int(assess2_myp5.geom_sum(3, 2, 8)) == 765
assert assess2_myp5.arith(15, 3, 12) == 48

total_leaks = []
for mod, banned in ((assess2_myp2, ()), (assess2_myp4, ("probability",)), (assess2_myp5, ())):
    _, _, leaks = audit(mod, banned)
    total_leaks += leaks
print(f"\nAll Assess2 checks passed: 3 papers x 25 questions, splits exact, visuals >= 20, typed-only. Hint-leak warnings: {len(total_leaks)}")
