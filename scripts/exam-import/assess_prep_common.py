"""Shared helpers for the Assess Prep formative papers (MYP2/4/5).

Every question is typed-answer only. Kinds:
  parts   -> assess_parts (separate input + marks + 2 hints per part)
  numeric -> numeric (tolerance)
  text    -> short_answer with accepted variants
  expr    -> short_answer with expression normalisation + variants
  open    -> open_ended, marked against a rubric (teacher review)
"""

def P(pid, label, prompt, kind, points, hints, answer=None, tol=0, accepted=None, unit=None, placeholder=None):
    d = {"id": pid, "label": label, "prompt": prompt, "kind": kind, "points": points, "hints": list(hints)}
    if kind == "numeric":
        d["answer"] = answer; d["tolerance"] = tol
    else:
        d["accepted"] = list(accepted or [])
    if unit: d["unit"] = unit
    if placeholder: d["placeholder"] = placeholder
    return d

def Q(n, topic, diff, crit, prompt, explanation, parts=None, single=None, diagram=None, nxt="", subtopic="", hints=None):
    q = {"n": n, "topic": topic, "subtopic": subtopic or topic, "difficulty": diff,
         "criterion": crit, "prompt": prompt, "explanation": explanation,
         "diagram": diagram, "next": nxt}
    if parts is not None:
        q["type"] = "assess_parts"; q["parts"] = parts
        q["points"] = sum(p["points"] for p in parts)
    else:
        q["hints"] = list(hints or [])
        kind, payload, points = single
        q["type"] = {"numeric": "numeric", "text": "short_answer", "expr": "short_answer", "open": "open_ended"}[kind]
        q["kind"] = kind; q["points"] = points
        if kind == "numeric":
            q["answer"], q["tolerance"] = payload
        elif kind in ("text", "expr"):
            q["accepted"] = list(payload)
        else:
            q["criteria"] = payload
    return q

def check_exam(name, questions, blueprint):
    assert len(questions) == 25, (name, len(questions))
    assert [q["n"] for q in questions] == list(range(1, 26)), name
    marks = sum(q["points"] for q in questions)
    assert 48 <= marks <= 52, (name, marks)
    from collections import Counter
    diffs = Counter(q["difficulty"] for q in questions)
    assert diffs == {"easy": 8, "medium": 11, "hard": 6}, (name, diffs)
    topics = Counter(q["topic"] for q in questions)
    assert topics == Counter(blueprint), (name, topics, blueprint)
    for q in questions:
        assert q["type"] in ("assess_parts", "numeric", "short_answer", "open_ended"), q
        assert 1 <= q["points"] <= 4, (name, q["n"], q["points"])
        assert q["criterion"] in "ABCD"
        assert len(q["explanation"]) > 20
        if q["type"] == "assess_parts":
            for p in q["parts"]:
                assert len(p["hints"]) == 2 and all(len(h) >= 8 for h in p["hints"]), (name, q["n"], p)
        else:
            assert len(q["hints"]) == 2 and all(len(h) >= 8 for h in q["hints"]), (name, q["n"])
    return marks
