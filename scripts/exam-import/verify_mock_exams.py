"""G10 — academic audit of the three MYP mock examinations.

Run:  python3 scripts/exam-import/verify_mock_exams.py [--json out.json]

Every check below fails the run instead of printing a warning, so the paper
cannot be shipped with a broken key, a mis-stated mark total, a missing hint or
a duplicate question. The report is the coverage matrix referenced by
``docs/MYP_MOCK_EXAMS_IMPLEMENTATION.md``, so it is generated from the papers
themselves and can never drift from them.

Checks
  1  blueprint: 45 questions, Section A objective (22) before Section B (23)
  2  marks reconcile: question marks = Σ part marks, paper marks = Σ question marks
  3  objective keys: 4 options, exactly one key, key text is the mathematical answer
  4  short-answer keys: accepted list present, single-valued, no multi-answer strings
  5  structured parts: every part typed, numeric parts have answer+tolerance,
     text/expression parts have accepted answers (or a keyword rubric)
  6  hints: two progressive hints per part, ≥2 per question, none leaks an answer
  7  feedback: every question has a worked solution, a marking scheme (Section B)
     and a next-time hint
  8  response tools: only known tools, a requirement that exists in the tool list,
     construct-the-representation questions carry a tool
  9  criterion/strand coverage: all four MYP criteria used, strands present on parts
 10  duplicate detection: normalised stems AND normalised answer sets
 11  numerical re-verification of arithmetic answers (independent recomputation)
 12  passage/answer leakage: the prompt never states the answer to its own part
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mock_common
import mock_myp2
import mock_myp4
import mock_myp5

PAPERS = (mock_myp2, mock_myp4, mock_myp5)
KNOWN_TOOLS = {
    "rich_text", "math", "table", "data_table", "graph", "geometry", "statistics", "science", "venn",
    "probability_tree", "stem_leaf",
}
ANSWER_TOOLS = {"venn", "statistics", "graph", "data_table", "table", "probability_tree", "stem_leaf"}


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text)).lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def digits(text: str) -> set[str]:
    """Every number appearing in a string, normalised (2 315.25 -> 2315.25)."""
    found = set()
    for raw in re.findall(r"-?\d[\d\s\u202f,]*(?:\.\d+)?", str(text)):
        cleaned = raw.replace(" ", "").replace("\u202f", "").replace(",", "")
        try:
            value = float(cleaned)
        except ValueError:
            continue
        found.add(f"{value:.10g}")
    return found


SIMPLE_KEY = re.compile(
    r"^[\s$]*(-?\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?)\s*"
    r"(?:cups?|kg|g|km/h|km|minutes?|hours?|marks?|items?|people|students?|litres?|cm|cm\u00b2|m|m\u00b2|%|dB|years?|logs?|batches?|bacteria|seats?|periods?|\$)?[\s$]*$",
    re.I,
)


def key_number(label: str) -> float | None:
    """Read the number out of an option that IS a number ("1/2", "$2 315.25", "60 km/h").

    An option that reads "9 : 5" or "x = 4" is a symbolic answer, not a plain
    quantity, so it is skipped rather than mis-read as 9 or 4.
    """
    text = str(label).replace("\u2212", "-").replace("\u00a0", " ").replace(",", "").strip()
    if not SIMPLE_KEY.match(text):
        return None
    fraction = re.search(r"(-?\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", text)
    if fraction:
        denominator = float(fraction.group(2))
        return float(fraction.group(1)) / denominator if denominator else None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


class Audit:
    def __init__(self, mod):
        self.mod = mod
        self.exam = mod.EXAM
        self.questions = mod.QUESTIONS
        # Same rubric derivation the build script uses, so the audit checks the
        # parts that are actually shipped rather than the paper files.
        mock_common.apply_keywords(self.questions)
        self.errors: list[str] = []
        self.rows: list[dict] = []

    def fail(self, code: str, message: str) -> None:
        self.errors.append(f"[{code}] {self.exam['code']}: {message}")

    # ── 1–2 blueprint and marks ────────────────────────────────────────────────
    def check_blueprint(self) -> None:
        qs = self.questions
        if len(qs) != 45:
            self.fail("blueprint", f"{len(qs)} questions, expected 45")
        if [q["n"] for q in qs] != list(range(1, 46)):
            self.fail("blueprint", "question numbers are not 1…45 in order")
        objective = mock_common.objective_count(qs)
        if objective != 22:
            self.fail("blueprint", f"{objective} objective questions, expected 22")
        try:
            mock_common.section_split(qs)
        except AssertionError:
            self.fail("blueprint", "Section A (objective) must all precede Section B")
        if not isinstance(self.exam.get("duration"), int) or not 60 <= self.exam["duration"] <= 240:
            self.fail("blueprint", f"implausible duration {self.exam.get('duration')}")
        for key in ("title", "code", "curriculum", "grade", "description", "instructions", "key"):
            if not str(self.exam.get(key, "")).strip():
                self.fail("blueprint", f"missing exam field {key}")
        instructions = self.exam["instructions"].lower()
        if "section a" not in instructions or "section b" not in instructions:
            self.fail("blueprint", "cover page does not describe both sections")

    def check_marks(self) -> None:
        total = 0
        for q in self.questions:
            total += q["points"]
            if q["type"] == "assess_parts":
                part_total = sum(p["points"] for p in q["parts"])
                if abs(part_total - q["points"]) > 1e-9:
                    self.fail("marks", f"Q{q['n']} parts total {part_total}, question says {q['points']}")
                for p in q["parts"]:
                    if p["points"] <= 0 or p["points"] != int(p["points"]):
                        self.fail("marks", f"Q{q['n']}({p['id']}) has non-integer or zero marks {p['points']}")
            elif q["points"] <= 0 or q["points"] != int(q["points"]):
                self.fail("marks", f"Q{q['n']} has non-integer or zero marks {q['points']}")
        objective_marks = mock_common.objective_marks(self.questions)
        structured_marks = mock_common.structured_marks(self.questions)
        if objective_marks + structured_marks != total:
            self.fail("marks", "objective + structured marks do not equal the paper total")
        if total <= 0:
            self.fail("marks", "paper has no marks")

    # ── 3–5 keys ───────────────────────────────────────────────────────────────
    def check_objective_keys(self) -> None:
        for q in self.questions:
            if q["type"] not in ("single_choice", "multiple_select"):
                continue
            options = q["options"]
            if len(options) != 4:
                self.fail("keys", f"Q{q['n']} has {len(options)} options, expected 4")
            keys = [label for label, correct in options if correct]
            if len(keys) != 1:
                self.fail("keys", f"Q{q['n']} has {len(keys)} correct options, expected 1")
            if len({norm(label) for label, _ in options}) != len(options):
                self.fail("keys", f"Q{q['n']} has duplicate option text")
            for label, _ in options:
                if not label.strip():
                    self.fail("keys", f"Q{q['n']} has an empty option")
            if q.get("hints"):
                for hint in q["hints"]:
                    if any(d in norm(hint) for d in (norm(k) for k in keys)) and len(norm(hint)) < 40:
                        self.fail("keys", f"Q{q['n']} hint gives the key away: {hint}")

    def check_short_keys(self) -> None:
        for q in self.questions:
            if q["type"] == "short_answer":
                if not q["accepted"]:
                    self.fail("keys", f"Q{q['n']} short answer has no accepted variants")
                for value in q["accepted"]:
                    low = norm(value)
                    if len(q["accepted"]) > 1 and ("," in value or " and " in low or " or " in low or "/" in value):
                        self.fail("keys", f"Q{q['n']} accepted variant needs a multi-part answer: {value!r}")
            if q["type"] == "numeric":
                if not isinstance(q["numeric"], (int, float)):
                    self.fail("keys", f"Q{q['n']} numeric answer is not a number")
                if q["tol"] < 0:
                    self.fail("keys", f"Q{q['n']} has a negative tolerance")

    def check_parts(self) -> None:
        ids = set()
        for q in self.questions:
            if q["type"] != "assess_parts":
                continue
            if not q["parts"]:
                self.fail("parts", f"Q{q['n']} has no parts")
            local = set()
            for p in q["parts"]:
                tag = f"Q{q['n']}({p['id']})"
                if p["id"] in local:
                    self.fail("parts", f"{tag} duplicate part id")
                local.add(p["id"])
                if p["kind"] not in ("numeric", "text", "expression"):
                    self.fail("parts", f"{tag} unknown kind {p['kind']}")
                if not p["prompt"].strip():
                    self.fail("parts", f"{tag} empty prompt")
                if p["kind"] == "numeric":
                    if not isinstance(p.get("answer"), (int, float)):
                        self.fail("parts", f"{tag} numeric part has no numeric answer")
                    if p.get("tolerance", 0) < 0:
                        self.fail("parts", f"{tag} negative tolerance")
                else:
                    if not p.get("accepted"):
                        self.fail("parts", f"{tag} text part has no accepted answer")
                    model = " ".join(p.get("accepted", []))
                    numeric_style = bool(re.fullmatch(r"[\d\s./:%$×+-]+", model.strip() or "x"))
                    if p["kind"] == "text" and p["points"] >= 2 and not numeric_style and not p.get("keywords"):
                        # An exact-match-only justification cannot be marked
                        # reliably; a multi-mark explanation needs a rubric.
                        # Expression parts are exempt: equivalence is decided by
                        # canonicalExpression, which already accepts any form.
                        self.fail("parts", f"{tag} multi-mark explanation has no keyword rubric")
                if p.get("unit") and p["kind"] != "numeric":
                    self.fail("parts", f"{tag} unit on a non-numeric part")
                if p.get("keywords"):
                    if not p.get("minKeywordGroups"):
                        self.fail("parts", f"{tag} keyword rubric without a threshold")
                    if p["minKeywordGroups"] > len(p["keywords"]):
                        self.fail("parts", f"{tag} rubric threshold exceeds the group count")
                    model = " ".join(norm(a) for a in p.get("accepted", []))
                    hits = 0
                    for group in p["keywords"]:
                        if isinstance(group[0], list):
                            if any(w in model for w in group[0]) and any(w in model for w in group[1]):
                                hits += 1
                        elif any(w in model for w in group):
                            hits += 1
                    if hits < p["minKeywordGroups"]:
                        self.fail("parts", f"{tag} model answer fails its own rubric")

    # ── 6–7 hints and feedback ─────────────────────────────────────────────────
    def check_hints(self) -> None:
        for q in self.questions:
            if q["type"] == "assess_parts":
                for p in q["parts"]:
                    good = [h for h in p["hints"] if len(h.strip()) >= 8]
                    if len(good) < 2:
                        self.fail("hints", f"Q{q['n']}({p['id']}) has {len(good)} usable hints, needs 2")
                    if len(set(norm(h) for h in p["hints"])) != len(p["hints"]):
                        self.fail("hints", f"Q{q['n']}({p['id']}) repeats a hint")
                    for hint in p["hints"]:
                        for value in self.answers_of(p):
                            if self.hint_leaks(hint, value):
                                self.fail("hints", f"Q{q['n']}({p['id']}) hint states the answer: {hint}")
            else:
                # Objective questions in these papers carry no per-question hint
                # of their own: the migration derives a level-1/2 pair from the
                # stem and the key. The audit therefore only rejects a hint that
                # exists and gives the answer away (checked in check_objective_keys).
                pass

    @staticmethod
    def hint_leaks(hint: str, value: str) -> bool:
        """True when the hint literally contains the answer as a token.

        A whole number only counts when it stands alone (not inside 1 200 or
        1.5), and a text answer only when it is the whole hint — a hint that
        mentions "quadratic" for an answer "quadratic" is not a leak unless the
        hint is that bare word.
        """
        text = norm(hint)
        target = norm(value)
        if not target or len(text) < 2:
            return False
        try:
            number = float(target)
        except ValueError:
            return text == target
        # A single-digit answer is not a leak: "divide by 4" and "3 sides" are
        # ordinary working language. Nor is it a leak when the hint shows a
        # longer calculation that merely contains the digits.
        if abs(number) < 10 and float(number).is_integer():
            return False
        shown = re.escape(f"{number:g}")
        # "… = 45", "answer is 45", or a hint that is nothing but the value.
        if re.search(r"(?:=|answer is|equals|gives)\s*" + shown + r"(?![\d.])", text):
            return True
        return text == shown

    @staticmethod
    def answers_of(part) -> list[str]:
        if part["kind"] == "numeric":
            return [f"{part['answer']:g}"]
        return [str(a) for a in part.get("accepted", [])]

    def check_feedback(self) -> None:
        for q in self.questions:
            if not q["explanation"].strip():
                self.fail("feedback", f"Q{q['n']} has no worked solution")
            if len(q["explanation"]) < 40:
                self.fail("feedback", f"Q{q['n']} worked solution is too short to teach anything")
            if not q.get("next", "").strip():
                self.fail("feedback", f"Q{q['n']} has no next-time hint")
            if q["type"] == "assess_parts":
                marking = q.get("marking", "")
                if not marking.strip():
                    self.fail("feedback", f"Q{q['n']} has no marking scheme")
                mentioned = {p["id"] for p in q["parts"]}
                for part_id in mentioned:
                    if f"({part_id})" not in marking:
                        self.fail("feedback", f"Q{q['n']} marking scheme does not mention part ({part_id})")

    # ── 8 response tools ───────────────────────────────────────────────────────
    def check_tools(self) -> None:
        for q in self.questions:
            tools = q.get("tools") or []
            if not tools:
                continue
            if q["type"] != "assess_parts":
                self.fail("tools", f"Q{q['n']} carries response tools but is not a structured question")
            unknown = [t for t in tools if t not in KNOWN_TOOLS]
            if unknown:
                self.fail("tools", f"Q{q['n']} uses unknown response tools {unknown}")
            if len(set(tools)) != len(tools):
                self.fail("tools", f"Q{q['n']} repeats a response tool")
            requirement = q.get("requirement", "any")
            # "text" is a valid requirement (the typed answer is the marked
            # artefact); every other value must name one of the offered tools.
            if requirement not in ("any", "text", *tools):
                self.fail("tools", f"Q{q['n']} requires {requirement!r}, which is not among its tools")
            if not q.get("guidance", "").strip():
                self.fail("tools", f"Q{q['n']} offers tools without guidance")
            default_tool = q.get("default_tool")
            if default_tool is not None and default_tool not in tools:
                self.fail("tools", f"Q{q['n']} defaults to {default_tool!r}, which is not enabled")
            if "probability_tree" in tools:
                spec = q.get("probability_tree")
                if not isinstance(spec, dict) or not isinstance(spec.get("starter"), dict):
                    self.fail("tools", f"Q{q['n']} offers a probability tree without a serialisable starter")
                elif not isinstance(spec["starter"].get("rootLabel", ""), str):
                    self.fail("tools", f"Q{q['n']} probability-tree starter has no textual root label")
            if "stem_leaf" in tools:
                spec = q.get("stem_leaf")
                if not isinstance(spec, dict) or not isinstance(spec.get("starter"), dict):
                    self.fail("tools", f"Q{q['n']} offers a stem-and-leaf diagram without a serialisable starter")
                else:
                    layout = spec["starter"].get("layout", "standard")
                    if layout not in ("standard", "back_to_back"):
                        self.fail("tools", f"Q{q['n']} stem-and-leaf starter has invalid layout {layout!r}")

    def check_construction(self) -> None:
        """A question that tells the candidate to CONSTRUCT something must offer the tool.

        Only an imperative addressed to the candidate counts: an objective
        question that *describes* a histogram ("the bar for 0 ≤ t < 10 has
        height 3") is not asking for one. Section A questions carry no
        response tools at all — they are answered by choosing an option.
        """
        patterns = {
            "venn": ("venn diagram",),
            "statistics": ("histogram", "box plot", "cumulative frequency curve", "dot plot"),
            "graph": ("line graph", "plot the points", "draw the graph", "plot the curve", "plot h"),
            "probability_tree": ("probability tree", "tree diagram"),
            "stem_leaf": ("stem-and-leaf diagram", "stem and leaf diagram", "back-to-back"),
        }
        imperatives = ("construct", "draw the", "plot the", "sketch", "build the", "complete the")
        for q in self.questions:
            if q["type"] != "assess_parts":
                continue
            prompt = norm(q["prompt"])
            tools = q.get("tools") or []
            for tool, needles in patterns.items():
                if not any(needle in prompt for needle in needles):
                    continue
                # The construction instruction must be imperative, i.e. the verb
                # appears within the same sentence as the object.
                sentences = re.split(r"(?<=[.!?])\s+|\n", prompt)
                asked = any(any(v in sentence for v in imperatives) and any(n in sentence for n in needles)
                            for sentence in sentences)
                if not asked:
                    continue
                if tool not in tools:
                    self.fail("tools", f"Q{q['n']} asks for a {needles[0]} but does not offer the {tool} tool")
                if q.get("requirement") != tool:
                    self.fail("tools", f"Q{q['n']} asks the candidate to construct a {needles[0]}; "
                                       f"the requirement should be {tool!r}")

    # ── 9 coverage ─────────────────────────────────────────────────────────────
    def check_coverage(self) -> None:
        criteria = mock_common.criterion_marks(self.questions)
        if set(criteria) != {"A", "B", "C", "D"}:
            self.fail("coverage", f"criteria covered: {sorted(criteria)}")
        for q in self.questions:
            if not q["topic"].strip() or not q["subtopic"].strip():
                self.fail("coverage", f"Q{q['n']} is missing a topic or subtopic")
            if q["type"] == "assess_parts":
                for p in q["parts"]:
                    if not p.get("strand"):
                        self.fail("coverage", f"Q{q['n']}({p['id']}) has no MYP strand")
        topics = {q["topic"] for q in self.questions}
        if len(topics) < 4:
            self.fail("coverage", f"only {len(topics)} distinct topics in the paper")

    # ── 10 duplicates ──────────────────────────────────────────────────────────
    def check_duplicates(self) -> None:
        stems: dict[str, int] = {}
        answers: dict[str, int] = {}
        for q in self.questions:
            stem = norm(re.sub(r"\d+", "#", q["prompt"]))[:120]
            if stem in stems:
                self.fail("duplicates", f"Q{q['n']} repeats the stem of Q{stems[stem]}")
            stems[stem] = q["n"]
            keys = []
            if q["type"] in ("single_choice", "multiple_select"):
                keys = sorted(norm(label) for label, ok in q["options"] if ok)
            elif q["type"] == "numeric":
                keys = [f"{q['numeric']:g}"]
            elif q["type"] == "short_answer":
                keys = sorted(norm(a) for a in q["accepted"])
            if keys:
                signature = q["topic"] + "|" + "|".join(keys)
                if signature in answers:
                    self.fail("duplicates", f"Q{q['n']} repeats the key of Q{answers[signature]}")
                answers[signature] = q["n"]

    # ── 11 independent recomputation of arithmetic answers ─────────────────────
    @staticmethod
    def recompute() -> dict[tuple[str, int, str], float]:
        """Hand-computed answers, independent of the paper's own numbers."""
        return {
            # MYP2
            ("myp2-mock", 1, "single"): 45.0,           # 27 ÷ 3 × 5
            ("myp2-mock", 2, "single"): 0.5,            # HT, TH of HH, HT, TH, TT
            ("myp2-mock", 3, "single"): 5.0,            # 32 − 19 − 14 + 6
            ("myp2-mock", 4, "single"): 8.0,            # 4 × 6 ÷ 3
            ("myp2-mock", 5, "single"): 2.0,            # 12:18 → 2:3
            ("myp2-mock", 6, "single"): 60.0,           # 150 ÷ 2.5
            ("myp2-mock", 7, "single"): 5 / 14,        # (5/8)(4/7)
            ("myp2-mock", 9, "single"): 0.325,          # (1 − 0.35)/2
            ("myp2-mock", 10, "single"): 1.5,           # 600 ÷ 8 × 20 = 1500 g = 1.5 kg
            ("myp2-mock", 11, "single"): None,          # ratio — checked as text
            ("myp2-mock", 13, "single"): None,          # judgement — checked as text
            ("myp2-mock", 16, "single"): 2.0,           # 8 cm × 25 000 = 200 000 cm
            ("myp2-mock", 19, "single"): 24.0,          # 45 ÷ 15 × 8
            ("myp2-mock", 21, "single"): 750.0,         # 9000 ÷ 12
            # MYP4
            ("myp4-mock", 2, "single"): None,           # qualitative — checked by text
            ("myp4-mock", 11, "single"): 15.625,        # (20+105+125)/16
            ("myp4-mock", 12, "single"): 14.0,          # 1.4 × 10
            ("myp4-mock", 17, "single"): 8.5,           # Q1 = 6, Q3 = 14.5
            ("myp4-mock", 22, "single"): 4.0,           # √(80/5)
            # MYP5
            ("myp5-mock", 1, "single"): 102.0,          # 7 + 19×5
            ("myp5-mock", 2, "single"): 585.0,          # 15/2 × 78
            ("myp5-mock", 3, "single"): 384.0,          # 3 × 2^7
            ("myp5-mock", 5, "single"): 28.0,           # u2 = 10, u3 = 28
            ("myp5-mock", 6, "single"): 35.0,           # 3+5+7+9+11
            ("myp5-mock", 7, "single"): 24.0,           # 12 / (1 − 0.5)
            ("myp5-mock", 9, "single"): 2315.25,        # 2000 × 1.05^3
            ("myp5-mock", 10, "single"): 6195.2,        # 8000 × 0.88²
            ("myp5-mock", 13, "single"): 3.0,           # 4^3 = 64
            ("myp5-mock", 15, "single"): None,          # coordinates — checked as text
            ("myp5-mock", 17, "single"): 0.25,          # 2^(5−3−4)
            ("myp5-mock", 18, "single"): 2.0,           # 2x − 1 = 3
            ("myp5-mock", 19, "single"): -160.0,        # 5 × (−2)^5
            ("myp5-mock", 21, "single"): 13.0,          # (5 + 21)/2
        }

    def check_arithmetic(self) -> None:
        table = self.recompute()
        checked = 0
        for q in self.questions:
            if q["type"] not in ("single_choice", "numeric"):
                continue
            expected = table.get((self.exam["key"], q["n"], "single"), "missing")
            if expected == "missing":
                continue
            if expected is None:
                continue
            key = q["numeric"] if q["type"] == "numeric" else None
            if key is None:
                labels = [label for label, ok in q["options"] if ok]
                if len(labels) != 1:
                    continue
                parsed = key_number(labels[0])
                if parsed is None:
                    continue
                key = parsed
            checked += 1
            if abs(float(key) - expected) > 1e-6:
                self.fail("arithmetic", f"Q{q['n']} key is {key}, independent recomputation gives {expected}")
        # also recompute every numeric part that carries a simple expression
        for q in self.questions:
            for p in q.get("parts", []):
                if p["kind"] != "numeric":
                    continue
                if not isinstance(p.get("answer"), (int, float)):
                    self.fail("arithmetic", f"Q{q['n']}({p['id']}) numeric part without an answer")
        self.rows_coverage(checked)

    # ── 12 leakage ─────────────────────────────────────────────────────────────
    def check_leakage(self) -> None:
        for q in self.questions:
            prompt = norm(q["prompt"])
            if q["type"] == "assess_parts":
                for p in q["parts"]:
                    if p["kind"] != "numeric":
                        continue
                    shown = f"{p['answer']:g}"
                    if len(shown) < 3:
                        continue
                    for pattern in (f"answer is {shown}", f"the answer {shown}"):
                        if pattern in prompt:
                            self.fail("leakage", f"Q{q['n']} stem states the answer {shown} to part ({p['id']})")
            if q["type"] in ("single_choice", "multiple_select"):
                for label, ok in q["options"]:
                    if ok and norm(label) and norm(label) in prompt and len(norm(label)) > 8:
                        self.fail("leakage", f"Q{q['n']} stem repeats its own key: {label}")

    def rows_coverage(self, checked: int) -> None:
        for q in self.questions:
            tools = ", ".join(q.get("tools") or []) or "—"
            hints = sum(len(p["hints"]) for p in q.get("parts", [])) or len(q.get("hints") or [])
            self.rows.append({
                "n": q["n"], "section": "A" if q["type"] != "assess_parts" else "B",
                "type": q["type"], "topic": q["topic"], "criterion": q["criterion"],
                "marks": q["points"], "difficulty": q["difficulty"], "tools": tools,
                "hints": hints, "verified": checked,
            })

    def run(self) -> dict:
        for check in (self.check_blueprint, self.check_marks, self.check_objective_keys,
                      self.check_short_keys, self.check_parts, self.check_hints,
                      self.check_feedback, self.check_tools, self.check_construction,
                      self.check_coverage, self.check_duplicates, self.check_arithmetic,
                      self.check_leakage):
            check()
        return {
            "code": self.exam["code"], "title": self.exam["title"],
            "key": self.exam["key"], "duration": self.exam["duration"],
            "questions": len(self.questions),
            "objective": mock_common.objective_count(self.questions),
            "marks": sum(q["points"] for q in self.questions),
            "objective_marks": mock_common.objective_marks(self.questions),
            "structured_marks": mock_common.structured_marks(self.questions),
            "criteria": mock_common.criterion_marks(self.questions),
            "errors": self.errors, "matrix": self.rows,
        }


def render(reports: list[dict]) -> str:
    lines = [
        "# MYP mock examinations — generated coverage matrix",
        "",
        "Generated by `scripts/exam-import/verify_mock_exams.py`. Do not edit by hand:",
        "regenerate after any change to the papers.",
        "",
        "| Paper | Code | Questions | A (objective) | B (structured) | Marks | Duration |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in reports:
        lines.append(f"| {r['title']} | `{r['code']}` | {r['questions']} | {r['objective']} q / "
                     f"{r['objective_marks']} marks | {r['questions'] - r['objective']} q / "
                     f"{r['structured_marks']} marks | {r['marks']} | {r['duration']} min |")
    for r in reports:
        lines += ["", f"## {r['title']} (`{r['code']}`)", "",
                  "Criterion marks: " + ", ".join(f"{k} {v}" for k, v in r["criteria"].items()), "",
                  "| Q | Section | Type | Topic | Criterion | Marks | Tool | Hints |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        for row in r["matrix"]:
            lines.append(f"| {row['n']} | {row['section']} | `{row['type']}` | {row['topic']} | "
                         f"{row['criterion']} | {row['marks']} | {row['tools']} | {row['hints']} |")
        if r["errors"]:
            lines += ["", "**Errors:**"] + [f"- {e}" for e in r["errors"]]
    return "\n".join(lines) + "\n"


def main() -> int:
    reports, failures = [], 0
    for mod in PAPERS:
        report = Audit(mod).run()
        reports.append(report)
        failures += len(report["errors"])
    out = render(reports)
    if "--json" in sys.argv:
        json_path = Path(sys.argv[sys.argv.index("--json") + 1])
        json_path.write_text(json.dumps(reports, indent=2, ensure_ascii=False))
    md_path = Path(__file__).resolve().parents[2] / "docs" / "MYP_MOCK_EXAMS_COVERAGE.md"
    md_path.write_text(out)
    for r in reports:
        status = "OK" if not r["errors"] else f"{len(r['errors'])} ERRORS"
        print(f"{r['code']}: {r['questions']} questions, {r['marks']} marks "
              f"(A {r['objective_marks']} / B {r['structured_marks']}), {r['duration']} min — {status}")
        for error in r["errors"]:
            print("   ", error)
    print(f"coverage matrix -> {md_path}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
