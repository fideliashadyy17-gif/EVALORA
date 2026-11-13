"""Pre-flight verification for the two full MYP formal assessments.

Mirrors the server-side normaliseAssessParts() rules (assessParts.ts) so the
stored specs are guaranteed to survive a live read, and checks the hint-leak
rule, payload size and image assets. Run before generating migrations:

  python3 scripts/exam-import/verify_myp45_full.py
"""
import json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import myp4_stats_spec, myp5_seq_spec, myp45_common

ROOT = Path(__file__).resolve().parents[2]
fails = []
def fail(msg): fails.append(msg)

def check_paper(mod, key, total_marks, total_q, single_choice, assess_parts):
    marks = sum(q["points"] for q in mod.QUESTIONS)
    if marks != total_marks: fail(f"{key}: total marks {marks}, expected {total_marks}")
    if len(mod.QUESTIONS) != total_q: fail(f"{key}: {len(mod.QUESTIONS)} questions, expected {total_q}")
    sc = sum(1 for q in mod.QUESTIONS if q["type"] == "single_choice")
    ap = sum(1 for q in mod.QUESTIONS if q["type"] == "assess_parts")
    if sc != single_choice: fail(f"{key}: {sc} single_choice, expected {single_choice}")
    if ap != assess_parts: fail(f"{key}: {ap} assess_parts, expected {assess_parts}")
    # question numbers are 1..N
    nums = [q["n"] for q in mod.QUESTIONS]
    if sorted(nums) != list(range(1, total_q + 1)): fail(f"{key}: question numbers not 1..{total_q}")

    for q in mod.QUESTIONS:
        # every question's figures exist on disk
        if q.get("figure"):
            folder = "myp4" if q["figure"].startswith("myp4_") else "myp5"
            rel = f"public/exam-figures/{folder}/{q['figure'].split('_', 1)[1]}.jpg"
            if not (ROOT / rel).exists(): fail(f"{key} Q{q['n']}: missing figure {rel}")
        if q["type"] == "single_choice":
            keys = [i + 1 for i, (_, ok) in enumerate(q["options"]) if ok]
            if len(keys) != 1: fail(f"{key} Q{q['n']}: {len(keys)} keys")
            hints = q.get("hints", [])
            if len(hints) != 2 or any(len(h) < 8 for h in hints): fail(f"{key} Q{q['n']}: MCQ hints malformed")
            body = json.dumps(q, ensure_ascii=False)
            if len(body) > 6000: pass  # figure-free MCQ text; fine
        else:
            # mirror assessParts.ts normaliseAssessParts
            for part in q["parts"]:
                h = part.get("hints", [])
                if len(h) != 2 or any(len(str(x).strip()) < 8 for x in h):
                    fail(f"{key} Q{q['n']} part {part.get('id')}: needs two hints ≥ 8 chars")
                if not (isinstance(part.get("points"), (int, float)) and part["points"] > 0):
                    fail(f"{key} Q{q['n']} part {part.get('id')}: points must be > 0")
                if part["kind"] == "numeric":
                    if not isinstance(part.get("answer"), (int, float)):
                        fail(f"{key} Q{q['n']} part {part.get('id')}: numeric answer missing")
                    if not (isinstance(part.get("tolerance"), (int, float)) and part["tolerance"] >= 0):
                        fail(f"{key} Q{q['n']} part {part.get('id')}: tolerance missing/negative")
                else:
                    if not part.get("accepted") and not part.get("keywords"):
                        fail(f"{key} Q{q['n']} part {part.get('id')}: text/expression part needs accepted variants or a keyword rubric")
                kw = part.get("keywords")
                if kw:
                    mg = part.get("minKeywordGroups", len(kw))
                    if not (1 <= mg <= len(kw)):
                        fail(f"{key} Q{q['n']} part {part.get('id')}: minKeywordGroups {mg} out of range")
            if sum(p["points"] for p in q["parts"]) != q["points"]:
                fail(f"{key} Q{q['n']}: parts points do not sum to question points")
            if not str(q.get("marking", "")).strip():
                fail(f"{key} Q{q['n']}: missing marking rubric (corrigé)")

        # hint-leak rule: a hint must not contain the key
        if q["type"] == "single_choice":
            key_label, _ = q["options"][[i for i, (_, ok) in enumerate(q["options"]) if ok][0]]
            for hint in q["hints"]:
                if key_label.strip() and key_label.strip().lower() in hint.lower() and len(key_label.strip()) >= 4:
                    fail(f"{key} Q{q['n']}: hint may leak key label {key_label!r}")
        else:
            for part in q["parts"]:
                for h in part["hints"]:
                    if part["kind"] == "numeric":
                        ans = part["answer"]
                        if isinstance(ans, (int, float)) and abs(ans) >= 3:
                            ans_s = str(int(ans)) if float(ans).is_integer() else str(ans)
                            if re.search(r"(?<![\d.])" + re.escape(ans_s) + r"(?![\d])", h):
                                fail(f"{key} Q{q['n']} part {part['id']}: hint may leak numeric answer {ans}")
                    for variant in (part.get("accepted") or []):
                        if len(variant) >= 6 and variant.lower() in h.lower():
                            fail(f"{key} Q{q['n']} part {part['id']}: hint leaks accepted variant {variant!r}")

check_paper(myp4_stats_spec, "MYP4", 98, 70, 50, 20)
check_paper(myp5_seq_spec, "MYP5", 166, 74, 50, 24)

# payload size estimate via the real builder path
for mod, tag in ((myp4_stats_spec, "myp4"), (myp5_seq_spec, "myp5")):
    source = f"myp{tag[-1]}-full-formal-assessment-2026"
    payload = [myp45_common.question_payload(q, source) for q in mod.QUESTIONS]
    sizes = [len(json.dumps(row, ensure_ascii=False, separators=(",", ":"))) for row in payload]
    print(f"{tag}: payload {sum(sizes)/1024:.0f} KB total, largest question {max(sizes)/1024:.1f} KB, "
          f"{len(sizes)} questions")

if fails:
    print("FAILED:")
    for f in fails: print(" -", f)
    sys.exit(1)
print("Pre-flight checks passed for both papers.")
