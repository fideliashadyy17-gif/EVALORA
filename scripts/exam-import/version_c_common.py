"""Shared authoring helpers for the two Version C mathematics papers.

Sources (page-by-page transcription of the supplied PDFs):

  · "GRADE 9 version C.pdf" (2 pages) and
    "Marking scheme of grade 9 version C.pdf" (2 pages).
  · "GRade 10 version C.pdf" (2 pages) and
    "Marking scheme of grade 10 version C.pdf" (2 pages).

These modules create NEW quizzes/examinations. They never update or delete an
existing paper. Every question, mark, criterion, option and answer key below is
transcribed from those four documents; the official marking scheme is the only
source of the answer and the mark allocation.
"""
from __future__ import annotations

import re

from summative_b_common import (
    CRITERIA,
    DIFFICULTY_FOR_LEVEL,
    LEVELS,
    graph_figure,
    q as base_q,
    stats_figure,
    stats_spec,
    table_block,
    doc,
    display,
    heading,
)

ORG_ID = "0a400000-0000-4000-8000-000000000001"
SUBJECT_ID = "0a400000-0000-4000-8000-000000000030"
CREATED_BY = "3c3ed712-f409-4aa1-a645-816418e22ec4"

_MATH = re.compile(r"(\$[^$]+\$)")
_BOLD = re.compile(r"(\*\*[^*]+\*\*)")


def _inline(text: str):
    out = []
    for chunk in _MATH.split(text):
        if not chunk:
            continue
        if chunk.startswith("$") and chunk.endswith("$") and len(chunk) > 2:
            out.append({"type": "mathInline", "attrs": {"latex": chunk[1:-1]}})
            continue
        for bit in _BOLD.split(chunk):
            if not bit:
                continue
            if bit.startswith("**") and bit.endswith("**") and len(bit) > 4:
                out.append({"type": "text", "text": bit[2:-2], "marks": [{"type": "bold"}]})
            else:
                out.append({"type": "text", "text": bit})
    return out or [{"type": "text", "text": ""}]


def para(text: str):
    """Paragraph with $math$ and **bold command terms**."""
    return {"type": "paragraph", "content": _inline(text)}


def doc_of(*blocks):
    content = []
    for block in blocks:
        if block is None:
            continue
        content.append(para(block) if isinstance(block, str) else block)
    return {"type": "doc", "content": content or [{"type": "paragraph"}]}


def part(
    pid: str,
    label: str,
    prompt: str,
    points: int,
    *,
    kind: str = "numeric",
    answer: float | None = None,
    tolerance: float = 0,
    accepted: list[str] | None = None,
    unit: str | None = None,
    keywords: list[list[str]] | None = None,
    min_groups: int | None = None,
    hints: tuple[str, str] | None = None,
    strand: str | None = None,
    placeholder: str | None = None,
):
    spec = {
        "id": pid,
        "label": label,
        "prompt": prompt,
        "kind": kind,
        "points": points,
        "hints": list(hints or (
            f"Re-read what {label} is asking you to find.",
            f"Use the data and method named in the question for {label}.",
        )),
    }
    if strand:
        spec["strand"] = strand
    if unit:
        spec["unit"] = unit
    if placeholder:
        spec["placeholder"] = placeholder
    if kind == "numeric":
        if answer is None:
            raise ValueError(f"numeric part {pid} needs an answer")
        spec["answer"] = answer
        spec["tolerance"] = tolerance
    else:
        if not accepted:
            raise ValueError(f"{kind} part {pid} needs accepted answers")
        spec["accepted"] = accepted
        if keywords:
            spec["keywords"] = keywords
            spec["minKeywordGroups"] = min_groups if min_groups is not None else len(keywords)
    return spec


def structured(
    sid: str,
    label: str,
    tool: str,
    points: int,
    expected: dict,
    *,
    mode: str | None = None,
    tolerance: float = 0.01,
    part_id: str | None = None,
):
    rule = {
        "id": sid,
        "label": label,
        "tool": tool,
        "points": points,
        "mode": mode or ("graph_points" if tool == "graph" else tool),
        "expected": expected,
        "tolerance": tolerance,
    }
    if part_id:
        rule["part"] = part_id
    return rule


def assess_question(
    n: int,
    *,
    sec: str,
    crit: str,
    marks: int,
    lvl: str,
    topic: str,
    blocks: list,
    parts: list,
    explanation: str,
    tools: list[str] | None = None,
    guidance: str | None = None,
    structured_marks: list | None = None,
    marking_breakdown: list | None = None,
    subtopic: str | None = None,
    number: int | None = None,
    question_label: str | None = None,
    starter_graph: dict | None = None,
    starter_stats: dict | None = None,
    starter_stem_leaf: dict | None = None,
    starter_table: dict | None = None,
    default_tool: str | None = None,
    requirement: str | None = None,
):
    typed_points = sum(p["points"] for p in parts)
    structured_points = sum(r["points"] for r in (structured_marks or []))
    if typed_points + structured_points != marks:
        raise ValueError(f"Q{n}: parts total {typed_points}+{structured_points} but question prints {marks} marks")
    record = base_q(
        n,
        sec=sec,
        crit=crit,
        marks=marks,
        lvl=lvl,
        topic=topic,
        subtopic=subtopic,
        blocks=blocks,
        qtype="assess_parts",
        expl=explanation,
        number=number,
        parts=marking_breakdown or [(p["label"], p["points"], p["prompt"]) for p in parts],
        tools=tools,
        guidance=guidance,
    )
    cfg = record["cfg"]
    cfg["parts"] = parts
    if structured_marks:
        cfg["structured_marks"] = structured_marks
    if starter_graph:
        cfg["response_graph"] = {"starter": starter_graph}
    if starter_stats:
        cfg["response_stats"] = {"starter": starter_stats, "chart": starter_stats.get("chart", "histogram")}
    if starter_stem_leaf:
        cfg["response_stem_leaf"] = {"starter": starter_stem_leaf}
    if starter_table:
        cfg["response_data_table"] = {"starter": starter_table}
    if default_tool:
        cfg["response_default_tool"] = default_tool
    if requirement:
        cfg["response_requirement"] = requirement
    return record


def choice_question(
    n: int,
    *,
    sec: str,
    crit: str,
    marks: int,
    lvl: str,
    topic: str,
    blocks: list,
    options: list[str],
    answer: str,
    explanation: str,
    subtopic: str | None = None,
    number: int | None = None,
):
    return base_q(
        n, sec=sec, crit=crit, marks=marks, lvl=lvl, topic=topic, subtopic=subtopic,
        blocks=blocks, qtype="single_choice", opts=options, ans=answer, expl=explanation,
        number=number,
    )


def true_false_question(
    n: int,
    *,
    crit: str,
    statement: str,
    answer: str,
    explanation: str,
    topic: str = "Statistical statements",
    lvl: str = "basic",
    number: int | None = None,
):
    record = base_q(
        n, sec="A", crit=crit, marks=1, lvl=lvl, topic=topic,
        blocks=[statement], qtype="true_false", ans=answer, expl=explanation, number=number,
    )
    return record


def letter_question(
    n: int,
    *,
    crit: str,
    blocks: list,
    answer: str,
    explanation: str,
    topic: str,
    subtopic: str,
    lvl: str = "basic",
):
    """A matching row: the candidate writes one letter (P–T)."""
    record = base_q(
        n, sec="A", crit=crit, marks=1, lvl=lvl, topic=topic, subtopic=subtopic,
        blocks=blocks, qtype="short_answer",
        opts=[answer], ans="A", expl=explanation,
    )
    # short_answer accepted answers are the option LABELS. One accepted label
    # containing the answer letter is enough, and no list is leaked to candidates.
    record["options"] = [{"label": answer, "body": answer, "correct": True}]
    record["cfg"]["response_guidance"] = "Write one letter, P to T, in the box."
    return record


def numbered_table(columns, rows):
    return table_block(columns, rows)


def grid_patterns(items: list[tuple[str, int, int]], *, title: str = "", style: str = "top_bottom_border"):
    """Successive tile grids: (label, columns, rows), pale rows above/below a core."""
    return {"type": "assessDiagramBlock", "attrs": {"spec": {
        "version": 1, "kind": "grid_pattern", "title": title,
        "gridPatterns": [{"label": lb, "cols": c, "rows": r, "style": style} for lb, c, r in items],
    }}}


def graph_points(points: list[tuple[float, float]], *, title: str, x_label: str = "n", y_label: str = "",
                 x_min: float = 0, x_max: float | None = None, y_min: float = 0, y_max: float | None = None,
                 connect: bool = False, dashed: bool = False, show_coordinates: bool = True):
    xs = [p[0] for p in points] or [0, 1]
    ys = [p[1] for p in points] or [0, 1]
    domain = {
        "xMin": x_min, "xMax": x_max if x_max is not None else max(xs) + 1,
        "yMin": y_min, "yMax": y_max if y_max is not None else max(ys) + max(1, (max(ys) - min(ys)) * 0.15),
        "gridStep": None, "showGrid": True, "showAxes": True,
        "showCoordinates": show_coordinates, "showLegend": False,
        "showIntersections": False, "equalScale": False,
    }
    spec = {
        "version": 1, "title": title, "domain": domain,
        "points": [
            {"id": f"p{i}", "x": x, "y": y, "label": "", "color": "#0a5c36",
             "showCoordinates": show_coordinates, "open": False, "visible": True}
            for i, (x, y) in enumerate(points)
        ],
        "functions": [], "segments": [], "annotations": [], "strokes": [], "regions": [],
    }
    if connect and len(points) > 1:
        spec["segments"] = [
            {"id": f"s{i}", "x1": points[i][0], "y1": points[i][1],
             "x2": points[i + 1][0], "y2": points[i + 1][1], "color": "#0a5c36",
             "style": "dashed" if dashed else "solid", "width": 1.6, "label": "", "visible": True}
            for i in range(len(points) - 1)
        ]
    return graph_figure(spec)


def graph_functions(functions: list[dict], *, title: str, x_min: float = 0, x_max: float = 5,
                    y_min: float = 0, y_max: float = 25, points: list[tuple[float, float]] | None = None,
                    x_label: str = "n", y_label: str = ""):
    spec = {
        "version": 1, "title": title,
        "domain": {
            "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max,
            "gridStep": None, "showGrid": True, "showAxes": True, "showCoordinates": False,
            "showLegend": len(functions) > 1, "showIntersections": False, "equalScale": False,
        },
        "functions": [
            {"id": f"f{i}", "expression": fn["expression"], "color": fn.get("color", "#0a5c36"),
             "style": fn.get("style", "solid"), "width": 2, "label": fn.get("label", ""),
             "from": fn.get("from", x_min), "to": fn.get("to", x_max), "visible": True}
            for i, fn in enumerate(functions)
        ],
        "points": [
            {"id": f"p{i}", "x": x, "y": y, "label": "", "color": "#0a5c36",
             "showCoordinates": True, "open": False, "visible": True}
            for i, (x, y) in enumerate(points or [])
        ],
        "segments": [], "annotations": [], "strokes": [], "regions": [],
    }
    return graph_figure(spec)


def grouped_histogram(groups: list[tuple[float, float, int]], *, title: str, x_label: str, y_label: str = ""):
    return stats_figure(stats_spec(
        "histogram", title=title, x_label=x_label, y_label=y_label,
        groups=groups, data_mode="grouped",
    ))


def box_figure(five: tuple[float, float, float, float, float], *, title: str, x_label: str):
    return stats_figure(stats_spec("box_plot", title=title, x_label=x_label, five=five))


def cumulative_figure(groups: list[tuple[float, float, int]], *, title: str, x_label: str, y_label: str = "Cumulative frequency"):
    return stats_figure(stats_spec(
        "cumulative_frequency", title=title, x_label=x_label, y_label=y_label,
        groups=groups, data_mode="grouped",
    ))


def bar_figure(categories: list[tuple[str, int]], *, title: str, x_label: str, y_label: str = "Frequency"):
    return stats_figure(stats_spec("bar_chart", title=title, x_label=x_label, y_label=y_label, categories=categories))


def starter_axes(*, title: str, x_min: float, x_max: float, y_min: float, y_max: float, step: float | None = None):
    return {
        "version": 1, "title": title,
        "domain": {
            "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max, "gridStep": step,
            "showGrid": True, "showAxes": True, "showCoordinates": True,
            "showLegend": False, "showIntersections": False, "equalScale": False,
        },
        "points": [], "functions": [], "segments": [], "annotations": [], "strokes": [], "regions": [],
    }
