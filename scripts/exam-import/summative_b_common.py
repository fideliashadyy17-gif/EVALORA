"""Shared helpers for the four MYP Mathematics SUMMATIVE assessments (Version B).

Source documents (supplied PDFs, transcribed page by page):

  · MYP 2 (Grade 7)  "MYP2 1st Term examination B" — 2 pages, 45 questions.
  · MYP 3 (Grade 8)  "Grade_8_MYP_3_Mathematics_Marking_Scheme_Version_B" —
                     official teacher marking scheme & blueprint, 5 pages.
  · MYP 4 (Grade 9)  "Grade_9_MYP_4_Mathematics_Summative_Assessment_Version_B".
  · MYP 5 (Grade 10) "Grade_10_MYP_5_Mathematics_Summative_Assessment".

Every question carries, in ``questions.config``:

  myp_criterion      "A" | "B" | "C" | "D" — the criterion the SOURCE paper
                     prints next to that question number. Never inferred.
  criterion_label    the human caption shown to the candidate and the marker.
  question_number    the source paper's own question number.
  paper_section      "A" (objective) or "B" (theory / constructed response).
  difficulty_level   the source paper's own level word (basic / intermediate /
                     challenge / advanced).
  marks              the marks the source paper prints for the question.
  calculator         True on EVERY question of all four papers (mandatory).
  response_tools     the construction tools a constructed-response question
                     offers, chosen from what the question actually asks for.

Nothing here invents a question, rewords a stem or redistributes a criterion:
a value that is not printed in the source document is left out.
"""
import json
import re

ORG_ID = "0a400000-0000-4000-8000-000000000001"          # Oak International School
SUBJECT_ID = "0a400000-0000-4000-8000-000000000030"      # Mathematics
CREATED_BY = "3c3ed712-f409-4aa1-a645-816418e22ec4"

CRITERIA = {
    "A": "Knowing and understanding",
    "B": "Investigating patterns",
    "C": "Communicating",
    "D": "Applying mathematics in real-life contexts",
}

# Levels as the source papers print them.
LEVELS = ("basic", "intermediate", "challenge", "advanced")

DIFFICULTY_FOR_LEVEL = {
    "basic": "easy",
    "intermediate": "medium",
    "challenge": "hard",
    "advanced": "hard",
}

# ---------------------------------------------------------------- prompt docs

_MATH_SPLIT = re.compile(r"(\$[^$]+\$)")


def _inline(text: str):
    """Split a paragraph into text / $math$ inline nodes."""
    out = []
    for part in _MATH_SPLIT.split(text):
        if not part:
            continue
        if part.startswith("$") and part.endswith("$") and len(part) > 2:
            out.append({"type": "mathInline", "attrs": {"latex": part[1:-1]}})
        else:
            out.append({"type": "text", "text": part})
    return out or [{"type": "text", "text": ""}]


def para(text: str):
    return {"type": "paragraph", "content": _inline(text)}


def display(latex: str):
    return {"type": "mathBlock", "attrs": {"latex": latex}}


def heading(text: str, level: int = 3):
    return {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}


def bullets(items):
    return {
        "type": "bulletList",
        "content": [
            {"type": "listItem", "content": [para(item)]} for item in items
        ],
    }


def table_block(columns, rows):
    """A real Tiptap table (rendered by RichContent)."""
    content = [
        {
            "type": "tableRow",
            "content": [
                {"type": "tableHeader", "content": [para(str(c))]} for c in columns
            ],
        }
    ]
    for row in rows:
        content.append(
            {
                "type": "tableRow",
                "content": [{"type": "tableCell", "content": [para(str(c))]} for c in row],
            }
        )
    return {"type": "table", "content": content}


def diagram(spec):
    """A native Assess Prep SVG diagram (never a bitmap)."""
    return {"type": "assessDiagramBlock", "attrs": {"spec": dict(spec, version=1)}}


def stats_figure(spec):
    """A statistics figure drawn from the data it represents."""
    return {"type": "statsBlock", "attrs": {"spec": spec}}


def graph_figure(spec):
    """A coordinate-graph figure drawn from functions / segments."""
    return {"type": "graphBlock", "attrs": {"spec": spec}}


def line_graph(expression, *, title="", x_max=6, y_max=12, colour="#0a5c36", label=""):
    """One function on a small shared window, so options can be compared.

    Every graph in a set of options must use the SAME window: the question
    asks which SHAPE shows direct proportion, and a different scale on each
    option would let a candidate read the axes instead of the graph.
    """
    return graph_figure({
        "version": 1,
        "domain": {"xMin": 0, "xMax": x_max, "yMin": 0, "yMax": y_max, "gridStep": None,
                   "showGrid": True, "showAxes": True, "showCoordinates": False,
                   "showLegend": False, "showIntersections": False, "equalScale": False},
        "functions": [
            {"id": "f", "expression": expression, "color": colour, "style": "solid",
             "width": 2, "label": label or expression, "from": 0, "to": x_max, "visible": True},
        ],
        "points": [], "segments": [], "annotations": [], "strokes": [], "regions": [],
        "xLabel": "x", "yLabel": "y", "title": title,
    })


def venn(left_label, right_label, left_only, both, right_only, outside,
         universal="ξ", title=""):
    return diagram({
        "kind": "venn2",
        "title": title,
        "venn": {
            "leftLabel": left_label,
            "rightLabel": right_label,
            "leftOnly": str(left_only),
            "both": str(both),
            "rightOnly": str(right_only),
            "outside": str(outside),
            "universalLabel": universal,
        },
    })


def data_table(columns, rows, title=""):
    return diagram({"kind": "table", "title": title, "columns": columns, "rows": rows})


def double_number_line(top_label, bottom_label, top_ticks, bottom_ticks, top_max, title=""):
    """top_ticks / bottom_ticks: list of (position, printed label)."""
    return diagram({
        "kind": "double_number_line",
        "title": title,
        "lines": [
            {"label": top_label, "unit": "", "ticks": [{"at": a, "label": str(b)} for a, b in top_ticks], "max": top_max},
            {"label": bottom_label, "unit": "", "ticks": [{"at": a, "label": str(b)} for a, b in bottom_ticks], "max": top_max},
        ],
    })


def shape_patterns(items, title=""):
    """items: list of (label, squares, dots)."""
    return diagram({
        "kind": "shape_pattern",
        "title": title,
        "patterns": [{"label": lb, "squares": sq, "dots": dt} for lb, sq, dt in items],
    })


def stats_spec(chart, *, title="", x_label="", y_label="", values=None,
               categories=None, groups=None, data_mode="raw", five=None):
    spec = {
        "version": 1,
        "chart": chart,
        "title": title,
        "xLabel": x_label,
        "yLabel": y_label,
        "values": values or [],
        "categories": [{"id": f"c{i}", "label": lb, "value": v} for i, (lb, v) in enumerate(categories or [])],
        "binWidth": None,
        "showSummary": False,
        "dataMode": data_mode,
    }
    if groups is not None:
        spec["groups"] = [
            {"id": f"g{i}", "from": a, "to": b, "frequency": f} for i, (a, b, f) in enumerate(groups)
        ]
    if five is not None:
        spec["fiveNumberSummary"] = {
            "min": five[0], "q1": five[1], "median": five[2], "q3": five[3], "max": five[4],
        }
    return spec


def doc(*blocks):
    """Build the prompt document from paragraph strings and figure dicts."""
    content = []
    for block in blocks:
        if block is None:
            continue
        if isinstance(block, str):
            content.append(para(block))
        elif isinstance(block, dict):
            content.append(block)
        else:
            raise TypeError(f"unsupported block: {block!r}")
    return {"type": "doc", "content": content or [{"type": "paragraph"}]}


def plain(doc_obj):
    """Legacy plain-text mirror of a document ($…$ maths preserved)."""
    parts = []

    def walk(node):
        kind = node.get("type")
        if kind == "text":
            parts.append(node.get("text", ""))
        elif kind == "mathInline":
            parts.append("$" + str(node.get("attrs", {}).get("latex", "")) + "$")
        elif kind == "mathBlock":
            parts.append("\n$$" + str(node.get("attrs", {}).get("latex", "")) + "$$\n")
        elif kind == "hardBreak":
            parts.append("\n")
        elif kind == "table":
            for row in node.get("content", []):
                cells = []
                for cell in row.get("content", []):
                    buf = []
                    save = parts[:]
                    del parts[:]
                    for child in cell.get("content", []):
                        walk(child)
                    cells.append("".join(parts))
                    del parts[:]
                    parts.extend(save)
                parts.append(" | ".join(cells) + "\n")
            parts.append("\n")
        elif kind in ("assessDiagramBlock", "statsBlock", "graphBlock", "dataTableBlock"):
            attrs = node.get("attrs", {}) or {}
            spec = attrs.get("spec", {}) or {}
            label = (
                spec.get("title")
                or attrs.get("title")
                or (spec.get("kind") or kind).replace("assessDiagramBlock", "diagram")
            )
            parts.append(f"\n[Figure: {label}]\n")
        elif kind in ("paragraph", "heading", "listItem"):
            for child in node.get("content", []):
                walk(child)
            parts.append("\n")
        else:
            for child in node.get("content", []):
                walk(child)

    for node in doc_obj.get("content", []):
        walk(node)
    text = "".join(parts)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# ------------------------------------------------------------------ question

LETTERS = ["A", "B", "C", "D", "E", "F"]


def q(n, *, sec, crit, marks, lvl, topic, blocks, qtype="single_choice",
      opts=None, ans=None, expl=None, tools=None, numeric=None, tol=None,
      subtopic=None, parts=None, guidance=None, figure_note=None, labels=None,
      opt_blocks=None, **kwargs):
    """One question of the paper. `ans` is the printed correct letter."""
    assert crit in CRITERIA, f"question {n}: unknown criterion {crit!r}"
    assert lvl in LEVELS, f"question {n}: unknown level {lvl!r}"
    cfg = {
        "question_number": kwargs.get("number", n),
        "paper_question_key": n,
        "paper_section": sec,
        "myp_criterion": crit,
        "criterion_label": f"Criterion {crit} — {CRITERIA[crit]}",
        "criterion_title": CRITERIA[crit],
        "difficulty_level": lvl,
        "marks": marks,
        "calculator": True,
        "calculator_policy": "permitted",
        "assessment_style": "myp_summative",
    }
    if parts:
        cfg["marking_breakdown"] = [
            {"label": p[0], "marks": p[1], "focus": p[2] if len(p) > 2 else ""} for p in parts
        ]
    if guidance:
        cfg["response_guidance"] = guidance
    if tools:
        cfg["response_tools"] = list(tools)
        cfg["tool_labels"] = list(tools)
    if numeric is not None:
        cfg["numeric_answer"] = numeric
        cfg["tolerance"] = 0 if tol is None else tol
    if figure_note:
        cfg["figure_note"] = figure_note

    record = {
        "n": n,
        "type": qtype,
        "crit": crit,
        "sec": sec,
        "marks": marks,
        "lvl": lvl,
        "topic": topic,
        "subtopic": subtopic or topic,
        "doc": doc(*blocks),
        "cfg": cfg,
        "expl": expl or "",
    }
    if qtype in ("single_choice", "multiple_select", "matching"):
        assert opts, f"question {n}: {qtype} needs options"
        tags = labels or LETTERS
        assert len(tags) >= len(opts), f"question {n}: not enough labels"
        # `opt_blocks` gives an option its own figure — a question that asks
        # "which graph shows…" is unanswerable when the options are only words.
        figures = list(opt_blocks) if opt_blocks else [None] * len(opts)
        assert len(figures) == len(opts), f"question {n}: option figures do not match the options"
        record["options"] = [
            {"label": tags[i], "body": o, "figure": figures[i], "correct": (ans == tags[i])}
            for i, o in enumerate(opts)
        ]
        assert any(o["correct"] for o in record["options"]), f"question {n}: no correct option"
    elif qtype == "true_false":
        record["options"] = [
            {"label": "T", "body": "True", "correct": ans == "T"},
            {"label": "F", "body": "False", "correct": ans == "F"},
        ]
        assert ans in ("T", "F"), f"question {n}: true/false answer must be T or F"
    return record


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def json_sql(obj) -> str:
    return sql_escape(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


# ------------------------------------------------------------------- emitter

def build_migration(*, file_name: str, title: str, description: str,
                    quiz_id: str, exam_id: str, id_prefix: str, source: str,
                    grade: str, myp: str, myp_class_id: str | None,
                    duration_minutes: int, total_marks: int, instructions: str,
                    sections: list, criterion_totals: dict, questions: list,
                    notes: list):
    """Render one idempotent SQL migration for a complete paper."""
    for record in questions:
        record["cfg"]["source"] = source
    order = [r["n"] for r in questions]
    assert order == sorted(order), "questions must be listed in paper order"

    lines = []
    add = lines.append
    add(f"-- {title}")
    add("-- Generated by scripts/exam-import/build_summative_b_migrations.py — do not edit by hand.")
    add("--")
    for note in notes:
        add(f"-- {note}")
    add("--")
    add("-- Every statement is idempotent: replaying the migration changes nothing.")
    add("begin;")
    add("")
    add("insert into quizzes (id, organization_id, title, description, status, settings, created_by)")
    quiz_settings = {
        "randomize_questions": False,
        "randomize_options": False,
        "assessment_kind": "summative",
        "grade_level": grade,
        "curriculum": f"MYP {myp}",
        "subject": "Mathematics",
        "duration_minutes": duration_minutes,
        "total_marks": total_marks,
        "source": source,
        "summative_key": source,
        "sections": sections,
        "criterion_totals": criterion_totals,
        "calculator": True,
    }
    add(f"values ('{quiz_id}', '{ORG_ID}', '{sql_escape(title)}',")
    add(f"        '{sql_escape(description)}', 'published',")
    add(f"        '{json_sql(quiz_settings)}'::jsonb, '{CREATED_BY}')")
    add("on conflict (id) do nothing;")
    add("")

    add("insert into questions (id, organization_id, type, prompt, prompt_doc, explanation,")
    add("                       points, difficulty, topic, subtopic, tags, status, config,")
    add("                       created_by, curriculum, curriculum_course, subject_id,")
    add("                       review_status, creation_method, class_id, source_reference)")
    add("select ('" + id_prefix + "' || lpad((1000 + (x->>'n')::int)::text, 12, '0'))::uuid,")
    add(f"       '{ORG_ID}', x->>'t', x->>'p', x->'d', x->>'e',")
    add("       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',")
    # A Postgres text[] literal, not a JSON array: `questions.tags` is text[],
    # and '["a", "b"]'::text[] is rejected as a malformed array literal.
    tags = [f"MYP {myp}", "Mathematics", "summative", source, "criteria-a-d"]
    add("       array[" + ", ".join(f"'{sql_escape(tag)}'" for tag in tags) + "]::text[],")
    add("       'published', x->'cfg',")
    add(f"       '{CREATED_BY}', 'MYP', 'MYP {myp} Mathematics', '{SUBJECT_ID}',")
    add("       'approved', 'manual', " + (f"'{myp_class_id}'" if myp_class_id else "null") + ",")
    add(f"       '{sql_escape(source)}'")
    add("  from jsonb_array_elements('" + json_sql([
        {
            "n": r["n"],
            "t": r["type"],
            "p": plain(r["doc"]),
            "d": r["doc"],
            "e": r["expl"],
            "m": r["marks"],
            "df": DIFFICULTY_FOR_LEVEL[r["lvl"]],
            "tp": r["topic"],
            "st": r["subtopic"],
            "cfg": r["cfg"],
        }
        for r in questions
    ]) + "'::jsonb) as x")
    add("on conflict (id) do nothing;")
    add("")

    add("insert into question_options (question_id, label, is_correct, position, content_doc)")
    add("select ('" + id_prefix + "' || lpad((1000 + (o->>'n')::int)::text, 12, '0'))::uuid,")
    add("       o->>'l', (o->>'c')::boolean, (o->>'p')::integer, o->'doc'")
    add("  from jsonb_array_elements('" + json_sql([
        {
            "n": r["n"],
            "l": o["label"],
            "c": o["correct"],
            "p": i,
            "doc": {"type": "doc",
                    "content": [para(o["body"])] + ([o["figure"]] if o.get("figure") else [])},
        }
        for r in questions
        if r.get("options")
        for i, o in enumerate(r["options"])
    ]) + "'::jsonb) as o")
    add("where not exists (")
    add("  select 1 from question_options x")
    add("  where x.question_id = ('" + id_prefix + "' || lpad((1000 + (o->>'n')::int)::text, 12, '0'))::uuid")
    add(");")
    add("")

    add("insert into quiz_questions (quiz_id, question_id, position, points)")
    add("select '" + quiz_id + "',")
    add("       ('" + id_prefix + "' || lpad((1000 + (x->>'n')::int)::text, 12, '0'))::uuid,")
    add("       (x->>'n')::integer, (x->>'m')::numeric")
    add("  from jsonb_array_elements('" + json_sql([
        {"n": r["n"], "m": r["marks"]} for r in questions
    ]) + "'::jsonb) as x")
    add("on conflict (quiz_id, question_id) do nothing;")
    add("")

    exam_settings = {
        "proctoring": False,
        "require_screen_share": False,
        "randomize_questions": False,
        "randomize_options": False,
        "pass_mark_percent": 50,
        "results_published": False,
        "access_mode": "shared_link",
        "identity_fields": [],
        "eligible_class_ids": [myp_class_id] if myp_class_id else [],
        "attempt_policy": "single_resume",
        "attempt_mode": "limited",
        "max_attempts": 1,
        "calculator": True,
        "criterion_reporting": True,
        "sections": sections,
        "criterion_totals": criterion_totals,
        "source": source,
    }
    add("insert into exams (id, organization_id, quiz_id, title, description, instructions,")
    add("                   duration_minutes, status, settings, created_by, class_id)")
    add(f"values ('{exam_id}', '{ORG_ID}', '{quiz_id}',")
    add(f"        '{sql_escape(title)}',")
    add(f"        '{sql_escape(description)}',")
    add(f"        '{sql_escape(instructions)}',")
    add(f"        {duration_minutes}, 'draft',")
    add(f"        '{json_sql(exam_settings)}'::jsonb, '{CREATED_BY}', " + (f"'{myp_class_id}'" if myp_class_id else "null") + ")")
    add("on conflict (id) do nothing;")
    add("")
    add("commit;")
    add("")
    return "\n".join(lines)
