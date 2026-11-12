"""Helpers for the Criteria A–D formative papers (Formative Assessment 2).

Every question and every part carries its MYP criterion AND strand
(e.g. strand "B(ii)"), stored in questions.config and shown to candidates.
Answers are typed only: numeric / text / expression parts, keyword-marked
short justifications, or open_ended responses flagged for teacher review.
"""
from collections import Counter

CRITERIA = {
    "A": "Knowing and understanding",
    "B": "Investigating patterns",
    "C": "Communicating",
    "D": "Applying mathematics in real-life contexts",
}

def P(pid, label, prompt, kind, points, hints, strand, answer=None, tol=0,
      accepted=None, unit=None, placeholder=None, keywords=None, min_kw=None):
    d = {"id": pid, "label": label, "prompt": prompt, "kind": kind,
         "points": points, "hints": list(hints), "strand": strand}
    if kind == "numeric":
        d["answer"] = answer; d["tolerance"] = tol
    else:
        d["accepted"] = list(accepted or [])
    if keywords:
        d["keywords"] = keywords
        d["minKeywordGroups"] = min_kw or len(keywords)
    if unit: d["unit"] = unit
    if placeholder: d["placeholder"] = placeholder
    return d

def Q(n, topic, diff, crit, strand, prompt, explanation, parts=None, single=None,
      diagram=None, nxt="", subtopic="", hints=None):
    q = {"n": n, "topic": topic, "subtopic": subtopic or topic, "difficulty": diff,
         "criterion": crit, "strand": strand, "prompt": prompt,
         "explanation": explanation, "diagram": diagram, "next": nxt}
    if parts is not None:
        q["type"] = "assess_parts"; q["parts"] = parts
        q["points"] = sum(p["points"] for p in parts)
    else:
        q["hints"] = list(hints or [])
        kind, payload, points = single
        q["type"] = {"numeric": "numeric", "text": "short_answer",
                     "expr": "short_answer", "open": "open_ended"}[kind]
        q["kind"] = kind; q["points"] = points
        if kind == "numeric":
            q["answer"], q["tolerance"] = payload
        elif kind in ("text", "expr"):
            q["accepted"] = list(payload)
        else:
            q["criteria"] = payload
    return q

def check_exam2(name, questions, crit_split, banned_topics=()):
    assert len(questions) == 25, (name, len(questions))
    assert [q["n"] for q in questions] == list(range(1, 26)), name
    marks = sum(q["points"] for q in questions)
    assert 50 <= marks <= 58, (name, marks)  # "about 50 marks"
    crits = Counter(q["criterion"] for q in questions)
    assert crits == Counter(crit_split), (name, crits, crit_split)
    visuals = sum(1 for q in questions if q["diagram"])
    assert visuals >= 20, (name, "visuals", visuals)
    for q in questions:
        assert q["type"] in ("assess_parts", "numeric", "short_answer", "open_ended"), q["type"]
        assert q["topic"] not in banned_topics, (name, q["n"], q["topic"])
        assert q["strand"].startswith(q["criterion"] + "("), (name, q["n"], q["strand"])
        assert len(q["explanation"]) > 20
        if q["criterion"] in ("B", "D"):
            assert q["type"] == "assess_parts" and len(q["parts"]) >= 3, (name, q["n"], "B/D must be multi-part")
        if q["type"] == "assess_parts":
            assert len(q["parts"]) <= 6
            for p in q["parts"]:
                assert p["strand"].startswith(q["criterion"] + "("), (name, q["n"], p["id"], p["strand"])
                assert len(p["hints"]) == 2 and all(len(h) >= 8 for h in p["hints"]), (name, q["n"], p["id"])
                assert p["points"] >= 0.5
        else:
            assert len(q["hints"]) == 2 and all(len(h) >= 8 for h in q["hints"]), (name, q["n"])
    return marks, visuals
