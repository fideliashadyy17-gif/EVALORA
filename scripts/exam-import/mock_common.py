"""Shared helpers for the three MYP Mathematics mock examinations.

The papers reuse the platform's existing question model:

* ``assess_parts``  — one numbered question, typed parts (a), (b), … each with its
  own marks, its own accepted answers and two progressive hints. This is what
  makes a structured examination question markable while still requiring the
  candidate to produce the mathematics.
* ``single_choice`` / ``multiple_select`` / ``numeric`` / ``short_answer`` — the
  objective section. Distractors are written as *named misconceptions* so the
  wrong option a candidate picks tells their teacher which error they made.
* ``config.response_tools`` — the composition surface the candidate needs
  (table, graph, statistics, Venn). Marks always come from the typed parts; the
  workspace is where the candidate builds the representation the question asks
  for.

Nothing here writes an answer into a candidate payload: keys live in
``questions.config`` and never leave the server until a result is released.
"""
from collections import Counter

CRITERIA = {
    "A": "Knowing and understanding",
    "B": "Investigating patterns",
    "C": "Communicating",
    "D": "Applying mathematics in real-life contexts",
}


# Concept groups used to mark a short justification in the candidate's own
# words. ``scoreAssessParts`` credits an exact accepted variant, or enough of
# these groups, so a correct explanation written differently still scores. Each
# group holds interchangeable phrasings of ONE idea; a part needs every group.
CONCEPT_GROUPS = {
    "not_replaced": (["not replaced", "no replacement", "without replacement", "isn't put back", "not put back"],
                     ["second draw", "second counter", "9 counters", "nine counters", "denominator", "changes", "depend"]),
    "different_base": (["different base", "higher price", "new price", "on the raised", "on $300", "from $300"],
                       ["does not cancel", "do not cancel", "not cancel", "removes more", "adds less", "exceeds", "more than", "only once"]),
    "outlier": (["outlier", "extreme", "far from", "unusually"],
                ["mean", "average", "pulled", "raised", "inflated", "distorted", "not typical", "median"]),
    "density": (["frequency density", "density", "height", "area"],
                ["width", "widths", "unequal", "different", "twice"]),
    "cumulative": (["cumulative", "running total"],
                   ["read across", "read up", "horizontal axis", "curve", "n/2", "half"]),
    "spread": (["standard deviation", "spread", "variation", "variability", "consisten"],
               ["smaller", "larger", "closer", "more", "less", "compare", "mean"]),
    "sample_size": (["sample", "small", "few", "20 spins", "20 seeds", "200 spins", "variation", "chance"],
                    ["too small", "random", "not enough", "larger", "more trials", "expected", "difference"]),
    "converge": (["converge", "converges", "ratio", "r", "less than 1", "|r|"],
                 ["shrink", "smaller", "finite", "tends", "approaches", "sum"]),
    "midpoint": (["midpoint", "mid-point", "middle of the class"],
                 ["assumes", "estimate", "ignore", "spread", "approximate"]),
    "interest_on_interest": (["interest on the interest", "compound", "compounds", "compounding"],
                            ["grows", "balance", "already", "previous", "larger"]),
    "fixed_charge": (["fixed charge", "base charge", "charged per parcel", "pay twice", "each parcel"],
                     ["twice", "more", "cheaper", "splitting", "single"]),
    "units": (["units", "marks", "minutes", "range", "scale"],
              ["suit", "suitable", "too wide", "too coarse", "detail", "class width"]),
}

# After the concept groups: a bare keyword such as "density" must not earn a
# mark on its own, so a group only counts when its partner vocabulary for the
# REASON appears as well. These are the reason/effect words shared by many
# justification parts.
CONCEPT_GROUPS["waste"] = (["waste", "spoils", "spoiled", "damp", "unused", "goes off"],
                           ["small household", "slowly", "not used", "3 kg", "wasteful", "outweigh"])
CONCEPT_GROUPS["scale"] = (["scale factor", "same factor", "proportional", "enlargement"],
                           ["both", "shape", "stretched", "preserve", "distort", "same"])
CONCEPT_GROUPS["whole_number"] = (["whole", "complete", "cannot", "fraction of a"],
                                  ["batch", "round", "1152", "two batches", "1.56", "flapjack"])


def P(pid, label, prompt, kind, points, hints, strand=None, answer=None, tol=0,
      accepted=None, unit=None, placeholder=None, keywords=None, min_kw=None):
    """One typed part. ``kind`` is numeric | text | expression."""
    part = {"id": pid, "label": label, "prompt": prompt, "kind": kind,
            "points": points, "hints": list(hints)}
    if strand:
        part["strand"] = strand
    if kind == "numeric":
        part["answer"] = answer
        part["tolerance"] = tol
    else:
        part["accepted"] = list(accepted or [])
    if keywords:
        part["keywords"] = keywords
        part["minKeywordGroups"] = min_kw or len(keywords)
    if unit:
        part["unit"] = unit
    if placeholder:
        part["placeholder"] = placeholder
    return part


def Q(n, topic, difficulty, criterion, prompt, short_explanation=None, **kw):
    """One question.

    Exactly one of ``parts`` / ``options`` / ``numeric`` / ``accepted`` must be
    supplied. ``options`` is a list of ``(label, is_correct)`` tuples. The
    explanation may be given positionally (6th argument) or as the
    ``explanation=`` keyword; the keyword wins when both are present, which lets
    an author write the short version inline and the full solution at the end.
    """
    parts = kw.pop("parts", None)
    options = kw.pop("options", None)
    numeric = kw.pop("numeric", None)
    accepted = kw.pop("accepted", None)
    points = kw.pop("points", None)
    # The 6th positional argument is an optional one-line note; the full worked
    # solution is the `explanation=` keyword and always wins when both exist.
    explanation = kw.pop("explanation", None) or short_explanation
    assert explanation, (n, "no worked solution")
    q = {
        "n": n, "topic": topic, "subtopic": kw.pop("subtopic", "") or topic,
        "difficulty": difficulty, "criterion": criterion,
        "prompt": prompt, "explanation": explanation,
        "next": kw.pop("next_time", ""), "diagram": kw.pop("diagram", None),
    }
    if q["next"] == "" and "next" in kw:
        q["next"] = kw.pop("next")
    kw.pop("next", None)
    if parts is not None:
        q["type"] = "assess_parts"
        q["parts"] = parts
        q["points"] = sum(p["points"] for p in parts)
    elif options is not None:
        q["type"] = "multiple_select" if kw.pop("multiselect", False) else "single_choice"
        q["options"] = options
        q["points"] = points
    elif numeric is not None:
        q["type"] = "numeric"
        q["numeric"] = numeric
        q["tolerance"] = kw.pop("tol", 0)
        q["points"] = points
    else:
        q["type"] = "short_answer"
        q["accepted"] = list(accepted or [])
        q["expression"] = kw.pop("expression", False)
        q["points"] = points
    tools = kw.pop("tools", None)
    if tools:
        q["tools"] = list(tools)
        q["requirement"] = kw.pop("requirement", "any")
        q["guidance"] = kw.pop("guidance", "")
    for key in ("chart", "starter_table", "starter_graph", "venn", "marking"):
        value = kw.pop(key, None)
        if value:
            q[key] = value
    # Anything left is a typo in the paper, not a silently ignored field.
    assert not kw, (n, "unknown question fields", sorted(kw))
    return q


def check_exam(name, questions, expect=45):
    """Fail the build rather than produce an unsound paper."""
    assert len(questions) == expect, (name, len(questions), expect)
    assert [q["n"] for q in questions] == list(range(1, expect + 1)), name
    seen_prompts = Counter()
    for q in questions:
        assert q["prompt"].strip(), (name, q["n"], "empty prompt")
        assert len(q["prompt"]) > 40, (name, q["n"], "prompt too short for an examination")
        assert q["explanation"].strip(), (name, q["n"], "no worked solution")
        if q["type"] == "assess_parts":
            assert q.get("marking", "").strip(), (name, q["n"], "no marking scheme")
        assert q.get("next", "").strip(), (name, q["n"], "no next-time hint")
        assert q["points"] > 0, (name, q["n"], "no marks")
        seen_prompts[q["prompt"][:60]] += 1
        if q["type"] == "assess_parts":
            marks = sum(p["points"] for p in q["parts"])
            assert abs(marks - q["points"]) < 1e-9, (name, q["n"], marks, q["points"])
            for p in q["parts"]:
                good = [h for h in p["hints"] if len(h.strip()) >= 8]
                assert len(good) >= 2, (name, q["n"], p["id"], "needs two hints")
                if p["kind"] == "numeric":
                    assert isinstance(p["answer"], (int, float)), (name, q["n"], p["id"])
                else:
                    assert p["accepted"], (name, q["n"], p["id"], "no accepted answer")
        elif q["type"] in ("single_choice", "multiple_select"):
            correct = [o for o in q["options"] if o[1]]
            assert len(q["options"]) == 4, (name, q["n"], "objective questions need 4 options")
            assert len(correct) == (2 if q["type"] == "multiple_select" else 1), (name, q["n"], "key shape")
            for label, _ in q["options"]:
                if q["type"] == "single_choice":
                    assert 0 < len(label) <= 90, (name, q["n"], "option length")
        elif q["type"] == "numeric":
            assert isinstance(q["numeric"], (int, float)), (name, q["n"])
        else:
            assert q["accepted"], (name, q["n"], "no accepted answer")
    dupes = [text for text, count in seen_prompts.items() if count > 1]
    assert not dupes, (name, "duplicate stems", dupes)
    return sum(q["points"] for q in questions)


def objective_count(questions):
    return sum(1 for q in questions if q["type"] in
               ("single_choice", "multiple_select", "numeric", "short_answer"))


def section_split(questions):
    """Section A = objective, Section B = structured. They must be contiguous."""
    types = [q["type"] in ("single_choice", "multiple_select", "numeric", "short_answer")
             for q in questions]
    first_structured = types.index(False) if False in types else len(types)
    assert all(types[:first_structured]) and not any(types[first_structured:]), \
        "Section A (objective) must come before Section B (structured)"


def short_answer_risks(questions):
    """Multi-valued accepted answers that exact string matching would punish.

    ``scoreAnswer`` compares a short_answer response to the accepted options
    with only whitespace/case normalisation, so ``"0.05, 0.2"`` cannot match a
    candidate who writes ``"0.05 and 0.2"``. Any accepted answer containing a
    comma or the word "and" is flagged here, and the paper is built so that
    those parts are numeric or split into separate parts instead.
    """
    risky = []
    for q in questions:
        if q["type"] != "short_answer":
            continue
        for value in q["accepted"]:
            lowered = value.lower()
            if "," in value or " and " in lowered or " or " in lowered or "/" in value:
                risky.append((q["n"], value))
    return risky


def criterion_marks(questions):
    totals = Counter()
    for q in questions:
        totals[q["criterion"]] += q["points"]
    return dict(sorted(totals.items()))


def objective_marks(questions):
    return sum(q["points"] for q in questions
               if q["type"] in ("single_choice", "multiple_select", "numeric", "short_answer"))


def structured_marks(questions):
    return sum(q["points"] for q in questions
               if q["type"] == "assess_parts")


def derive_keywords(part, groups):
    """Fallback keyword rubric for a text part with no authored keywords.

    Only multi-mark text parts get one, and only from a concept group whose
    vocabulary actually appears in the part's model answer — a rubric that the
    model answer itself would fail is never emitted.
    """
    if part["kind"] == "numeric" or part["points"] < 2 or part.get("keywords"):
        return []
    model = " ".join(part.get("accepted") or []).lower()
    matched = []
    for name in groups:
        terms, partners = CONCEPT_GROUPS[name]
        if any(t in model for t in terms) and any(p in model for p in partners):
            matched.append([terms, partners])
    return matched


def _needs(groups):
    return max(1, (len(groups) + 1) // 2)


def rubric_holds(groups, text):
    """Would this rubric credit ``text``? Mirrors scoreAssessParts' rule."""
    got = " ".join(str(text).strip().lower().split())
    hits = sum(1 for terms, partners in groups
               if any(t in got for t in terms) and any(p in got for p in partners))
    return hits >= _needs(groups)


# Words that carry no marking weight on their own.
STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "it", "its", "so", "than", "that",
    "this", "with", "for", "as", "at", "by", "from", "not", "no", "but", "if", "then", "because",
    "which", "when", "where", "how", "what", "why", "be", "been", "was", "were", "has", "have",
    "had", "does", "do", "did", "can", "cannot", "could", "would", "should", "must", "may", "might",
    "only", "also", "more", "most", "less", "least", "very", "same", "each", "every", "one", "two",
    "three", "some", "any", "all", "both", "other", "into", "over", "under", "about", "after",
    "before", "between", "their", "there", "they", "them", "you", "your", "we", "our", "he", "she",
    "his", "her", "will", "just", "even", "still", "much", "many", "such", "make", "makes", "made",
}


def norm_variant(text):
    return " ".join(str(text).strip().lower().split())


def _content_words(text, limit=6):
    words, seen = [], set()
    for raw in str(text).lower().replace("’", "'").split():
        word = "".join(ch for ch in raw if ch.isalnum() or ch in "-'")
        if len(word) < 4 or word in STOPWORDS or word in seen:
            continue
        if word.replace("-", "").isdigit():
            continue
        seen.add(word)
        words.append(word)
        if len(words) == limit:
            break
    return words


def canonicalise_text_part(part):
    """Give a multi-mark justification a markable key instead of a word-for-word one.

    ``scoreAssessParts`` credits a text part when the answer matches an accepted
    variant exactly (case/whitespace folded only), so a paragraph-long "explain
    why" answer could never be marked. For parts worth 2+ marks we therefore:

    * keep ONE canonical model answer (the first variant) — alternatives in the
      paper became prose variants of the same sentence and are what a keyword
      rubric replaces; and
    * attach a vocabulary rubric built from that sentence's own content words,
      so an answer that carries the mathematics in different words is credited.

    The model answer always satisfies its own rubric by construction, and a
    one-word answer cannot reach the threshold. Short numeric-style answers
    ("7/8", "47/100") keep exact matching because they yield no vocabulary.
    """
    if part["kind"] == "numeric" or part.get("keywords"):
        return
    variants = [a for a in (part.get("accepted") or []) if str(a).strip()]
    if not variants:
        return
    part["accepted"] = [variants[0]]
    words = _content_words(norm_variant(variants[0]), limit=6)
    if len(words) < 3:
        return
    part["keywords"] = [[w] for w in words]
    part["minKeywordGroups"] = max(3, -(-(len(words) * 3) // 5))


def fallback_rubric(part):
    """Kept for papers that author several prose variants: shared vocabulary only."""
    return canonicalise_text_part(part)


def apply_keywords(questions):
    """Attach a rubric only when EVERY model answer already satisfies it.

    A rubric that the model answer itself fails would fail a correct candidate
    who phrased the idea like the model answer, so it is dropped rather than
    shipped. When at least two distinct concept groups are present and all
    accepted variants cover them, half the groups are required — enough to
    credit a rephrasing, not enough to credit a bare keyword.
    """
    for q in questions:
        for part in q.get("parts", []):
            groups = derive_keywords(part, CONCEPT_GROUPS)
            if len(groups) >= 2 and all(rubric_holds(groups, a) for a in part.get("accepted") or []):
                part["keywords"] = groups
                part["minKeywordGroups"] = _needs(groups)
                continue
            canonicalise_text_part(part)
    return questions
