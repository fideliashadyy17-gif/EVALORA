#!/usr/bin/env python3
"""Dump every Grade 1 / CI question card as structured JSON, for review.

This is a transcription aid, not a generator: it prints the printed prompt
lines and the printed option labels in reading order so the authored question
data can be checked line by line against the source. Nothing here invents
wording.
"""
from __future__ import annotations

import json
import re
import sys
import warnings
from pathlib import Path

import pymupdf

warnings.filterwarnings("ignore")

PDF = Path("/tmp/arena-coding-uploads/OAK_Grade1_Second_Marking_Period_Exam_Papers_2026_2027.pdf")
PAPERS = {
    "mathematics": (1, 4),
    "science": (5, 8),
    "language-arts": (9, 12),
    "social-science": (13, 16),
}


def is_card(r):
    return 235 < r.width < 275 and 100 < r.height < 175


def is_shared(r):
    return 400 < r.width < 545 and 80 < r.height < 180


def cards(page):
    return sorted((d["rect"] for d in page.get_drawings() if is_card(d["rect"]) or is_shared(d["rect"])),
                  key=lambda r: (round(r.y0), r.x0))


def main():
    doc = pymupdf.open(PDF)
    out = {}
    for subject, (first, last) in PAPERS.items():
        cards_out = []
        for pno in range(first, last + 1):
            page = doc[pno]
            for card in cards(page):
                lines = []
                for block in page.get_text("dict")["blocks"]:
                    if block.get("type") != 0:
                        continue
                    for line in block["lines"]:
                        text = "".join(s["text"] for s in line["spans"]).strip()
                        if not text:
                            continue
                        x0, y0 = line["bbox"][0], line["bbox"][1]
                        if (card.x0 - 4 <= x0 <= card.x1 and card.y0 - 2 <= y0 <= card.y1):
                            lines.append({"x": round(x0), "y": round(y0), "text": text})
                lines.sort(key=lambda l: (l["y"], l["x"]))
                if lines:
                    cards_out.append({"page": pno + 1,
                                      "card": [round(v) for v in card],
                                      "lines": lines})
        out[subject] = cards_out
    Path("/tmp/grade1-cards.json").write_text(json.dumps(out, indent=1))
    for subject, cards_out in out.items():
        print(f"\n{'='*78}\n{subject.upper()}  ({len(cards_out)} cards)\n{'='*78}")
        for c in cards_out:
            print(f"\n-- page {c['page']} card {c['card']} --")
            for l in c["lines"]:
                print(f"   y={l['y']:4d} x={l['x']:3d}  {l['text']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
