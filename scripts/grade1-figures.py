#!/usr/bin/env python3
"""Crop the printed illustration band of every Grade 1 / CI question.

The source PDF has no raster images: every picture (flower, leaf, tree, goat,
shapes, number line, YES/NO faces) is vector artwork drawn on the page. The text
layer therefore carries the prompt but not the picture, and the marking scheme
keys answers by picture letter ("A (tree)", "B (Carrot)"). Rendering the band of
the printed page that holds a question's own pictures is the only faithful way
to put those pictures in front of a pupil.

Each crop is derived from page geometry, never from a typed coordinate:
  * a card is an outlined panel roughly 258 x 154 pt;
  * the question number sits in the card's top-left corner;
  * the pictures sit in a row of white 56 x 56 pt tiles below the prompt; the
    crop spans the union of those tiles plus a small margin.
A card with no tiles (matching columns, number lines, drawing frames) falls back
to the body of the card below its header, so the pupil still sees the item.

Run: python3 scripts/grade1-figures.py
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
OUT = Path(__file__).resolve().parent.parent / "public" / "exam-figures" / "grade1-ci"

# Subject -> (first page index, last page index) of the printed paper, 0-based.
PAPERS = {
    "mathematics": (1, 4),
    "science": (5, 8),
    "language-arts": (9, 12),
    "social-science": (13, 16),
}

DPI = 300
MARGIN = 4.0


def is_card(rect) -> bool:
    """An outlined question panel. Height varies per paper (114-154 pt)."""
    return 235 < rect.width < 275 and 100 < rect.height < 175


def is_shared_card(rect) -> bool:
    """A single full-width panel holding two questions (e.g. "21 & 22")."""
    return 400 < rect.width < 545 and 80 < rect.height < 180


def is_tile(rect) -> bool:
    return 50 < rect.width < 62 and 50 < rect.height < 62


def cards_on(page):
    return sorted((d["rect"] for d in page.get_drawings()
                   if is_card(d["rect"]) or is_shared_card(d["rect"])),
                  key=lambda r: (round(r.y0), r.x0))


def numbers_of(page, card) -> list[int]:
    """Every question number printed in this card's header strip.

    Usually one. A card can carry two ("19 Write the missing word:" beside
    "20 Write the missing word:") or announce a shared item ("21 & 22 Label
    the 4 plant parts"), in which case both numbers get the same picture.
    """
    found: list[int] = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            text = "".join(span["text"] for span in line["spans"]).strip()
            x0, y0 = line["bbox"][0], line["bbox"][1]
            in_header = card.x0 - 4 <= x0 <= card.x1 and card.y0 <= y0 <= card.y0 + 34
            if not in_header:
                continue
            # "19 Write the missing word:" or "21 & 22 Label the 4 plant parts".
            match = re.match(r"^(\d{1,2})(?:\s*&\s*(\d{1,2}))?\b", text)
            if not match:
                continue
            for number in match.groups():
                if number is None:
                    continue
                value = int(number)
                if 1 <= value <= 30 and value not in found:
                    found.append(value)
    return found


def band(page, card):
    """The rectangle that holds this card's own pictures."""
    cx = (card.x0 + card.x1) / 2
    tiles = [d["rect"] for d in page.get_drawings()
             if is_tile(d["rect"]) and card.x0 <= (d["rect"].x0 + d["rect"].x1) / 2 <= card.x1
             and card.y0 <= (d["rect"].y0 + d["rect"].y1) / 2 <= card.y1]
    has_tiles = bool(tiles)
    if tiles:
        box = pymupdf.Rect(min(t.x0 for t in tiles), min(t.y0 for t in tiles),
                           max(t.x1 for t in tiles), max(t.y1 for t in tiles))
        # The A/B/C/D caption sits just below its tile and the marking scheme
        # keys answers by that letter, so the caption is part of the picture.
        for word in page.get_text("words"):
            text, x0, y0, x1, y1 = word[4], word[0], word[1], word[2], word[3]
            if text not in ("A", "B", "C", "D") or (x1 - x0) > 14:
                continue
            centred = box.x0 - 6 <= (x0 + x1) / 2 <= box.x1 + 6
            below = box.y1 - 3 <= y0 <= box.y1 + 24
            if centred and below:
                box.y1 = max(box.y1, y1 + 2)
    else:
        # No picture tiles (matching columns, number lines, drawing frames):
        # keep the whole body of the card, starting below its header strip.
        header_bottom = card.y0 + 32
        for drawing in page.get_drawings():
            r = drawing["rect"]
            if (card.x0 <= r.x0 <= card.x0 + 4 and card.y0 <= r.y0 <= card.y0 + 8
                    and r.width > 200 and 20 < r.height < 50):
                header_bottom = max(header_bottom, r.y1 + 2)
        box = pymupdf.Rect(card.x0 + 6, header_bottom, card.x1 - 6, card.y1 - 6)
    box = pymupdf.Rect(box.x0 - MARGIN, box.y0 - MARGIN, box.x1 + MARGIN, box.y1 + MARGIN)
    # Never bleed outside the card, and never left of the card's own column.
    box = pymupdf.Rect(max(box.x0, card.x0), max(box.y0, card.y0),
                       min(box.x1, card.x1), min(box.y1, card.y1))
    return box, has_tiles


def main() -> int:
    doc = pymupdf.open(PDF)
    manifest = {}
    for subject, (first, last) in PAPERS.items():
        (OUT / subject).mkdir(parents=True, exist_ok=True)
        seen = {}
        for pno in range(first, last + 1):
            page = doc[pno]
            panels = cards_on(page)
            for card in panels:
                numbers = [n for n in numbers_of(page, card) if n not in seen]
                if not numbers:
                    continue
                box, has_tiles = band(page, card)
                if box.width < 20 or box.height < 20:
                    print(f"  ! {subject} Q{numbers}: band too small, skipped", file=sys.stderr)
                    continue
                pix = page.get_pixmap(clip=box, dpi=DPI)
                for n in numbers:
                    name = f"q{n:02d}.png"
                    pix.save(OUT / subject / name)
                    seen[n] = name
                    manifest.setdefault(subject, {})[n] = {
                        "file": f"/exam-figures/grade1-ci/{subject}/{name}",
                        "page": pno + 1,
                        "band": [round(v, 1) for v in box],
                        "px": [pix.width, pix.height],
                        "has_pictures": has_tiles,
                        "shared_with": [m for m in numbers if m != n],
                    }
        missing = [n for n in range(1, 31) if n not in seen]
        print(f"{subject:16s} cropped {len(seen):2d}/30 questions"
              + (f"  MISSING {missing}" if missing else ""))
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    total = sum(len(v) for v in manifest.values())
    print(f"total crops: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
