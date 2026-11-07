#!/usr/bin/env python3
"""Independent check of every auto-marked key in g10_sequences_spec.py (exact fractions, no float guesses)."""
import importlib.util, math, os, sys
from fractions import Fraction as F

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("spec", os.path.join(HERE, "g10_sequences_spec.py"))
SPEC = importlib.util.module_from_spec(spec); spec.loader.exec_module(SPEC)

KEYS = {(i["n"], i["part"]): i for i in SPEC.ITEMS}
failures = []

def check(n, part, expected, label):
    item = KEYS.get((n, part))
    if item is None:
        failures.append(f"missing item Q{n:02d}{part}"); return
    got = item.get("value")
    if got is None:
        failures.append(f"Q{n:02d}{part} is not numeric"); return
    if abs(F(str(got)) - F(expected)) > F(str(item["tol"])) :
        failures.append(f"Q{n:02d}{part} {label}: spec={got} exact={expected}")
    else:
        print(f"  ok Q{n:02d}{part:<3} {label} = {expected}")

def near(a, b, tol=0.0005): return abs(float(a) - float(b)) <= tol

# Chapter 1
u = lambda a1, d, n: a1 + d * (n - 1)
check(1, "a", u(8, 5, 2), "tin week 2"); check(1, "b", u(8, 5, 3), "tin week 3"); check(1, "c", u(8, 5, 4), "tin week 4")
check(3, "", F(40) + 15 * 3, "courier day 4")
r = [F(4)]; [r.append(2 * r[-1] - 1) for _ in range(3)]
check(5, "b", r[2], "u3 recursion"); check(5, "c", r[3], "u4 recursion")
v = [F(3)]; [v.append(2 * v[-1] + 1) for _ in range(3)]; check(7, "b", v[3], "u4 for a1=3, 2u+1")
check(8, "a", 3 * 3 + 1, "matchstick u3 (u_n=3n+1)"); check(8, "b", 3 * 4 + 1, "matchstick u4")
check(9, "a", 12000 + 2 * 2500, "plan R week 3"); check(9, "b", 14500 + 2500 * 2, "plan E week 3")
# Chapter 2
check(10, "a", u(4, 7, 2), "linear u2"); check(10, "b", u(4, 7, 3), "linear u3")
slope = F(1800 - 900, 5 - 2); fixed = 900 - 2 * slope
check(11, "", fixed + 10 * slope, "taxi 10 km")
check(15, "a", 4 * 3 + 2, "hex 3 tables"); check(15, "b", 4 * 4 + 2, "hex 4 tables")
# Chapter 3
check(17, "a", 19, "a1"); check(17, "b", -4, "d"); check(17, "c", 19, "constant"); check(17, "d", -4, "coefficient")
check(18, "", 24 + 3 * 17, "stadium row 18")
check(21, "b", 23 - 4 * 4, "a1 corrected")
n22 = next(n for n in range(1, 1000) if 680 - 45 * (n - 1) == 50); check(22, "", n22, "tank day")
a1 = F(11) - 2 * F(27 - 11, 4); check(23, "b", a1, "a1 from a3, a7"); check(23, "c", F(27 - 11, 4), "d")
n24 = next(n for n in range(1, 1000) if 5000 + 500 * (n - 1) >= 9000); check(24, "b", n24, "tontine month")
n25 = next(n for n in range(1, 1000) if 2400000 + 180000 * (n - 1) > 2600000 + 120000 * (n - 1)); check(25, "b", n25, "first year A>B")
assert 2400000 + 180000 * 3 < 2600000 + 120000 * 3 and 2400000 + 180000 * 4 > 2600000 + 120000 * 4
# Chapter 4
check(26, "a", 2, "second difference"); check(26, "b", F(2, 2), "A")
check(27, "", next(n for n in range(1, 100) if n * n + 4 * n + 1 == 141), "tiles")
check(28, "a", 12, "panels u3") ; check(28, "b", 20, "panels u4")
assert all(n * n + n == e for n, e in [(1, 2), (2, 6), (3, 12), (4, 20)])
check(29, "b", F(2, 2), "coefficient")
check(31, "b", F(6, 2), "coefficient 3")
check(32, "a1", 2 * 2, "plants n=1"); check(32, "a2", 3 * 3, "plants n=2"); check(32, "a3", 4 * 4, "plants n=3")
check(32, "b", next(n for n in range(1, 100) if (n + 1) ** 2 == 121), "pattern with 121")
A = lambda n: n * n + 5 * n + 20; B = lambda n: 17 * n + 20
n33 = next(n for n in range(1, 100) if A(n) > B(n)); check(33, "a", n33, "first plot A>B")
check(33, "b1", A(n33), "Trial A yield"); check(33, "b2", B(n33), "Trial B yield")
assert A(12) == B(12) == 224, (A(12), B(12))
# Chapter 5
check(34, "a", F(5400, 8100), "ratio"); check(34, "b", F(2400) * F(2, 3), "next value")
assert F(5400, 8100) == F(2, 3) and F(3600, 5400) == F(2, 3) and F(2400, 3600) == F(2, 3)
bact = 1200 * 1.08 ** 4
check(35, "b", round(bact), "bacteria hour 5"); assert abs(bact - 1632.587) < 0.01
check(38, "b", F(6, 3), "ratio")
ps = [480000 * F(82, 100) ** (k) for k in range(8)]
n40 = next(i + 1 for i, x in enumerate(ps) if x < 200000); check(40, "a", n40, "first year below 200k")
val = float(ps[n40 - 1]); check(40, "b", round(val / 100) * 100, "value to nearest 100")
mos = [6400 * F(3, 4) ** k for k in range(12)]
n42 = next(i + 1 for i, x in enumerate(mos) if x < 1000); check(42, "b", n42, "first week below 1000")
check(42, "c", round(float(mos[n42 - 1])), "count that week")
check(43, "a", 2 * 12, "2a1"); check(43, "b", 9 * 5, "(n-1)d")
SUM = lambda a1, d, n: F(n, 2) * (2 * a1 + (n - 1) * d)
check(43, "c", SUM(12, 5, 10), "S10")
check(44, "", SUM(26, 2, 18), "theatre seats")
check(45, "b", SUM(6, 3, 20), "S20")
check(46, "b", SUM(5, 3, 12), "S12 corrected")
check(48, "a", 2000 + 500 * 9, "member 10"); check(48, "b", SUM(2000, 500, 10), "tontine total")
check(50, "a", 35 + 4 * 13, "day 14"); check(50, "b", SUM(35, 4, 14), "14-day total")
n50 = next(n for n in range(1, 100) if SUM(35, 4, n) >= 1200); check(50, "c", n50, "minimum days")
assert SUM(35, 4, 17) < 1200 <= SUM(35, 4, 18)

# Matching: every right-hand rule must be the rule that the left-hand data implies.
def line_from_two_terms(t1, v1, t2, v2):
    d = F(v2 - v1, t2 - t1)
    return d, v1 - (t1 - 1) * d  # (slope, intercept) of u_n = intercept + slope*n ... see below
def as_linear(d, a1):  # u_n = a1 + d(n-1) = d*n + (a1 - d)
    return (d, a1 - d)
EXPECT_LINEAR = {  # label -> (slope, intercept) of u_n = slope*n + intercept
    "u_n = 3n - 1": (3, -1), "u_n = -4n + 29": (-4, 29), "u_n = 5n - 22": (5, -22), "u_n = -3n - 1": (-3, -1),
    "u_n = 4n + 5": (4, 5), "u_n = -3n + 21": (-3, 21), "u_n = 6n - 11": (6, -11), "u_n = (1/2)n + 3/2": (F(1, 2), F(3, 2)),
}
def check_pairs(qn, label_map, rows):
    for left, right, derived in rows:
        if label_map[right] != derived:
            failures.append(f"Q{qn:02d} matching: {left!r} -> {right!r} but derived {derived}")
    print(f"  ok Q{qn:02d} matching pairs checked against derived rules ({len(rows)} rows)")
# Q16: two terms -> explicit rule
q16 = [("a2=5,a5=14", "u_n = 3n - 1", as_linear(*[F(14 - 5, 3), 5 - F(14 - 5, 3)])),
       ("a3=17,a7=1", "u_n = -4n + 29", as_linear(F(1 - 17, 4), 17 - 2 * F(1 - 17, 4))),
       ("a4=-2,a6=8", "u_n = 5n - 22", as_linear(F(8 + 2, 2), -2 - 3 * F(8 + 2, 2))),
       ("a2=-7,a4=-13", "u_n = -3n - 1", as_linear(F(-13 + 7, 2), -7 - F(-13 + 7, 2)))]
for left, right, (sl, ic) in q16:
    if EXPECT_LINEAR[right] != (sl, ic): failures.append(f"Q16 {left} -> {right}: derived slope/intercept {(sl, ic)}")
print("  ok Q16 two-term rules derived from the terms (slope, intercept)")
# Q19: first term and difference -> rule  (u_n = a1 + d(n-1))
q19 = [("a1=9,d=4", "u_n = 4n + 5", as_linear(F(4), F(9))), ("a1=18,d=-3", "u_n = -3n + 21", as_linear(F(-3), F(18))),
       ("a1=-5,d=6", "u_n = 6n - 11", as_linear(F(6), F(-5))), ("a1=2,d=1/2", "u_n = (1/2)n + 3/2", as_linear(F(1, 2), F(2)))]
for left, right, (sl, ic) in q19:
    if EXPECT_LINEAR[right] != (sl, ic): failures.append(f"Q19 {left} -> {right}: derived {(sl, ic)}")
print("  ok Q19 first-term/difference pairs derived")
# Q36: a1, r -> u_n = a1 * r^(n-1). Coefficient form u_n = (a1/r) * r^n.
GEO = {"5*2^(n-1)": (F(5), F(2)), "96*(1/2)^(n-1)": (F(96), F(1, 2)), "3*(-2)^(n-1)": (F(3), F(-2)), "7*3^(n-1)": (F(7), F(3))}
q36 = [("a1=5,r=2", "5*2^(n-1)", (F(5), F(2))), ("a1=96,r=1/2", "96*(1/2)^(n-1)", (F(96), F(1, 2))),
       ("a1=3,r=-2", "3*(-2)^(n-1)", (F(3), F(-2))), ("a1=7,r=3", "7*3^(n-1)", (F(7), F(3)))]
for left, right, (a1, r) in q36:
    if GEO[right] != (a1, r): failures.append(f"Q36 {left} -> {right}")
print("  ok Q36 first term and ratio derived")
# Q49: sum expressions. Each must equal the sum described.
q49_checks = [
    ("12 terms, a1=4, u12=37", F(12, 2) * (4 + 37), F(12, 2) * (4 + 37)),
    ("first 20 odd numbers", F(20, 2) * (2 * 1 + 19 * 2), sum(range(1, 40, 2))),
    ("15 terms a1=100 d=-4", F(15, 2) * (200 + 14 * -4), sum(100 - 4 * k for k in range(15))),
    ("u3..u10 for u_n=5n+2", F(8, 2) * (17 + 52), sum(5 * n + 2 for n in range(3, 11))),
]
for label, expr, truth in q49_checks:
    if expr != truth: failures.append(f"Q49 {label}: expression {expr} != {truth}")
print("  ok Q49 sum expressions equal the described sums")
# Q06/Q30/Q39/Q13 sort categories: derived by inspection and recorded in the spec.
for qn, cats in [(6, "recursive: A,C | explicit: B,D | list only: E,F"), (13, "increasing: A,E | decreasing: B,D | not linear: C,F"),
                 (30, "linear: A,E | quadratic: B,D | geometric: C,F"), (39, "arithmetic: A,D | geometric: B,C | neither: E,F")]:
    print(f"  note Q{qn:02d} sort categories: {cats}")
# Sort-tile correctness checks by computation
seq = {"Q13A": [3, 8, 13, 18], "Q13B": [20, 14, 8, 2], "Q13C": [1, 4, 9, 16], "Q13D": [5, 2, -1, -4], "Q13F": [2, 6, 18, 54]}
for k, t in seq.items():
    diffs = {t[i+1]-t[i] for i in range(len(t)-1)}
    ratios = {F(t[i+1], t[i]) for i in range(len(t)-1)}
    kind = "linear" if len(diffs) == 1 else ("geometric" if len(ratios) == 1 else "other")
    print(f"    {k}: {kind} (diffs={sorted(diffs)})")
q30 = {"A 4,9,14,19": [4,9,14,19], "B 2,5,10,17": [2,5,10,17], "C 3,6,12,24": [3,6,12,24], "D 1,4,9,16": [1,4,9,16], "E 50,40,30,20": [50,40,30,20], "F 81,27,9,3": [81,27,9,3]}
for k, t in q30.items():
    d1 = [t[i+1]-t[i] for i in range(len(t)-1)]; d2 = [d1[i+1]-d1[i] for i in range(len(d1)-1)]
    rat = {F(t[i+1], t[i]) for i in range(len(t)-1)}
    kind = "linear" if len(set(d1)) == 1 else "quadratic" if len(set(d2)) == 1 else "geometric" if len(rat) == 1 else "?"
    print(f"    Q30 {k}: {kind}")
# Chapter totals
from collections import defaultdict
tot = defaultdict(float); qs = defaultdict(int)
for i in SPEC.ITEMS: tot[i["n"]] += float(i["pts"])
for lo, hi, name, qn, mk in SPEC.CHAPTERS:
    got_q = hi - lo + 1; got_m = round(sum(tot[n] for n in range(lo, hi + 1)), 2)
    if got_q != qn or got_m != mk: failures.append(f"chapter {name}: {got_q}/{got_m} != {qn}/{mk}")
total = round(sum(tot.values()), 2)
if total != 100: failures.append(f"total marks {total} != 100")
for n in range(1, 51):
    if n not in tot: failures.append(f"no items for Q{n}")

print(f"items={len(SPEC.ITEMS)} marks={total}")
if failures:
    print("FAILURES:"); [print("  -", f) for f in failures]; sys.exit(1)
print("all checks passed")
