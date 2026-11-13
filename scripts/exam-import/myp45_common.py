"""Shared helpers for the two full 180-minute MYP Mathematics assessments.

FILE 1 -> MYP 4 Mathematics Assessment — Statistics & Distributions (grade 9 / MYP 4 class).
FILE 2 -> MYP 5 Mathematics Assessment — Sequences & Series      (grade 10 / MYP 5 class).

Both papers keep every source question verbatim (wording, notation, numbering,
sub-questions, tables, diagrams). Figures are referenced as static assets shipped
with the app under public/exam-figures/ (they render inside rich text). Question model:

* Part I  : ``single_choice`` objective questions, 1 mark each (source marks).
* Part II : ``assess_parts`` — typed parts (a), (b) … each with its own marks,
  accepted answers, tolerance and two progressive hints. Multi-mark written
  justifications use a keyword rubric so a correct explanation in the
  candidate's own words still scores.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ORG = "0a400000-0000-4000-8000-000000000001"
SUBJECT = "0a400000-0000-4000-8000-000000000030"
AUTHOR = "3c3ed712-f409-4aa1-a645-816418e22ec4"

CRITERIA = {
    "A": "Knowing and understanding",
    "B": "Investigating patterns",
    "C": "Communicating",
    "D": "Applying mathematics in real-life contexts",
}


def esc(s):
    if s is None:
        return "null"
    return str(s).replace("\\", "\\\\").replace("'", "''")


def txt(s):
    return "'" + esc(s) + "'"


def fig_data_uri(name):
    """Relative public URL for a cropped source figure.

    Figures live in the repository under public/exam-figures/<paper>/ so the
    stored documents stay small and the images ship with the deployment.
    """
    folder = "myp4" if name.startswith("myp4_") else "myp5"
    return f"/exam-figures/{folder}/{name.split('_', 1)[1]}.jpg"


def _para(text):
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def _table_nodes(rows, header_rows=1):
    """rows: list of row lists; first `header_rows` rows render as <th>."""
    out = []
    for i, row in enumerate(rows):
        cells = []
        for cell in row:
            cell_type = "tableHeader" if i < header_rows else "tableCell"
            cells.append({"type": cell_type, "content": [{"type": "text", "text": str(cell)}]})
        out.append({"type": "tableRow", "content": cells})
    return {"type": "table", "content": out}


def build_doc(prompt, table=None, table_header_rows=1, figure=None, figure_width=96, figure_alt=""):
    blocks = [_para(p) for p in str(prompt).split("\n\n") if p.strip()]
    if table:
        blocks.append(_table_nodes(table, table_header_rows))
    if figure:
        blocks.append({
            "type": "image",
            "attrs": {
                "src": fig_data_uri(figure),
                "alt": figure_alt or "Source figure from the assessment paper",
                "width": figure_width,
            },
        })
    return {"type": "doc", "content": blocks}


def P(pid, label, prompt, kind, points, hints, answer=None, tol=0, accepted=None,
      unit=None, keywords=None, min_kw=None, placeholder=None):
    part = {"id": pid, "label": label, "prompt": prompt, "kind": kind,
            "points": points, "hints": list(hints)}
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


def MCQ(n, topic, difficulty, criterion, prompt, options, explanation,
        next_time, table=None, table_header_rows=1, figure=None, figure_width=96,
        figure_alt="", hints=None):
    """One printed single-choice question. ``options`` = [(label, is_key)]."""
    assert len(options) == 4, (n, "MCQ needs exactly 4 options")
    assert sum(1 for _, ok in options if ok) == 1, (n, "exactly one keyed option")
    hint_list = list(hints or [])
    assert len(hint_list) == 2 and all(len(h) >= 8 for h in hint_list), (n, "two hints, each >= 8 chars")
    return {
        "n": n, "type": "single_choice", "topic": topic, "difficulty": difficulty,
        "criterion": criterion, "prompt": prompt, "explanation": explanation,
        "next_time": next_time, "points": 1,
        "options": options, "table": table, "table_header_rows": table_header_rows,
        "figure": figure, "figure_width": figure_width, "figure_alt": figure_alt,
        "hints": hint_list,
    }


def WRITTEN(n, topic, difficulty, criterion, prompt, parts, explanation, marking,
            next_time, table=None, table_header_rows=1, figure=None, tools=None,
            guidance=None, figure_width=96, figure_alt=""):
    """One printed written question stored as ``assess_parts``."""
    return {
        "n": n, "type": "assess_parts", "topic": topic, "difficulty": difficulty,
        "criterion": criterion, "prompt": prompt, "explanation": explanation,
        "marking": marking, "next_time": next_time,
        "points": sum(p["points"] for p in parts),
        "parts": parts, "table": table, "table_header_rows": table_header_rows,
        "figure": figure, "figure_width": figure_width, "figure_alt": figure_alt,
        "tools": tools or ["rich_text", "math", "table", "data_table"],
        "guidance": guidance or "",
    }


def question_payload(q, source):
    doc = build_doc(q["prompt"], table=q.get("table"),
                    table_header_rows=q.get("table_header_rows", 1),
                    figure=q.get("figure"), figure_width=q.get("figure_width", 96),
                    figure_alt=q.get("figure_alt", ""))
    cfg = {
        "source": source,
        "question_number": q["n"],
        "paper_section": "A" if q["type"] == "single_choice" else "B",
        "myp_criterion": q["criterion"],
        "next_time_hint": q["next_time"],
        "assessment_style": "formal_assessment",
    }
    if q["type"] == "assess_parts":
        cfg["parts"] = q["parts"]
        cfg["marking"] = q["marking"]
        cfg["marking_criteria"] = q["marking"]
        cfg["response_tools"] = q["tools"]
        cfg["response_requirement"] = "any"
        cfg["response_guidance"] = q.get("guidance", "")
    else:
        cfg["option_labels"] = [label for label, _ in q["options"]]
        cfg["option_key"] = [i + 1 for i, (_, ok) in enumerate(q["options"]) if ok]
        cfg["hints"] = q.get("hints", [])
    row = {
        "n": q["n"], "t": q["type"], "p": q["prompt"],
        "d": doc,
        "e": q["explanation"], "m": q["points"],
        "df": q["difficulty"], "tp": q["topic"], "cfg": cfg,
        "marking": q.get("marking", ""),
    }
    return row
