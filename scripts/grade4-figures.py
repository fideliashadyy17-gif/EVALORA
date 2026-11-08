#!/usr/bin/env python3
"""Extract the printed diagrams of the OAK Grade 4 second-marking-period papers.

The Grade 4 PDF is fully vector: it contains no raster images at all, so every
diagram (box-method grids, bar models, the soil profile, the Venn diagram, the
bar graph, the map, the reading passages) has to be cropped out of the rendered
page. Each question that carries a diagram is printed inside a rounded "card"
panel; the card's number badge tells us which question it belongs to.

A diagram is drawn *and* labelled: "Total = 175", "P: Salt (solid)", the bar
chart's axis numbers and zone names, the soil-layer captions. The labels are
text, not shapes, and some sit outside the drawn box, so the crop is grown to
the diagram's own text band (words whose vertical centre is level with the
shapes) and then widened to the card's inner width. That keeps a label printed
beside the drawing while excluding the question title above (printed on a
filled header strip) and the answer prompts below.

Run:  python3 scripts/grade4-figures.py
Out:  public/exam-figures/grade4/<subject>/q<NN>.png + manifest.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pymupdf

PDF = "/tmp/arena-coding-uploads/OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf"
OUT = Path("public/exam-figures/grade4")
URL_BASE = "/exam-figures/grade4"

DPI = 300
MARGIN = 3  # points of breathing room around each crop

# Questions whose printed diagram must be cropped, per subject page range.
SUBJECTS = [
    ("mathematics", (2, 4)),
    ("science", (5, 7)),
    ("language-arts", (8, 10)),
    ("social-science", (11, 13)),
]
EXPECTED = {
    "mathematics": [19, 21, 22, 24, 26, 30],
    "science": [22, 24, 26, 29],
    "language-arts": [29, 30],
    "social-science": [22, 23, 25, 26],
}


def is_card(r: pymupdf.Rect) -> bool:
    """A question card: a wide, tall rounded panel that holds one question."""
    return (
        255 <= r.width <= 275
        and 55 <= r.height <= 250
        and r.x0 < 480
    )


def card_number(page: pymupdf.Page, card: pymupdf.Rect) -> int | None:
    """The number printed in the card's top-left badge."""
    best = None
    for w in page.get_text("words"):
        if not re.fullmatch(r"\d{1,2}", w[4]):
            continue
        if not (card.x0 - 2 <= w[0] <= card.x0 + 34):
            continue
        if not (card.y0 - 3 <= w[1] <= card.y0 + 20):
            continue
        dist = (w[0] - card.x0) ** 2 + (w[1] - card.y0) ** 2
        if best is None or dist < best[0]:
            best = (dist, int(w[4]))
    return None if best is None else best[1]


def header_strip(page: pymupdf.Page, card: pymupdf.Rect) -> float | None:
    """Bottom edge of the filled strip carrying the question title, if printed."""
    found = None
    for d in page.get_drawings():
        r = d["rect"]
        if not (card.x0 <= r.x0 <= card.x0 + 4 and card.y0 <= r.y0 <= card.y0 + 6):
            continue
        if r.width > card.width - 12 and 12 < r.height < 44:
            found = r.y1 if found is None else max(found, r.y1)
    return found


def text_lines(page: pymupdf.Page) -> list[pymupdf.Rect]:
    """Bounding boxes of the page's printed text lines."""
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            r = pymupdf.Rect(line["bbox"])
            if line.get("spans"):
                lines.append(r)
    return lines


def snap_edge(page: pymupdf.Page, edge: float, top: bool, keep: float,
              card: pymupdf.Rect) -> float:
    """Move a crop edge out of a line of text instead of slicing through it.

    The edge is derived from drawings, so it can land inside the question title
    (above the diagram) or an answer prompt (below it). Slicing there leaves a
    half-cut word at the border, so the edge is pushed past the line: to the far
    side when the crop was already mostly past it, back to the near side when
    the line is mostly inside the crop.
    """
    for line in text_lines(page):
        if not line.intersects(card):
            continue
        if not (line.y0 + 0.4 < edge < line.y1 - 0.4):
            continue
        height = max(line.height, 1.0)
        if top:
            past = (edge - line.y0) / height
            edge = line.y1 + 0.5 if past > 0.6 else min(edge, line.y0 - 0.5)
        else:
            past = (line.y1 - edge) / height
            edge = line.y0 - 0.5 if past > 0.6 else max(edge, line.y1 + 0.5)
        edge = max(edge, keep)
    return edge


def diagram_box(page: pymupdf.Page, card: pymupdf.Rect) -> pymupdf.Rect | None:
    """Union of the card's drawn shapes, ignoring the card and title strip."""
    strip = header_strip(page, card)
    box = None
    for d in page.get_drawings():
        r = d["rect"]
        if not card.contains(r):
            continue
        if r.width >= card.width - 8 and r.height >= card.height - 8:
            continue  # the card panel itself
        if strip is not None and r.y1 <= strip + 1:
            continue  # the title strip and the number / marks badges on it
        if r.width < 18 or r.height < 1.5:
            continue  # tick marks, dots, thin rules
        box = r if box is None else (box | r)
    if box is None:
        return None
    # Small pieces of a drawing (the soil profile's sprout leaves are 5pt wide)
    # are not big enough to define a diagram but do belong to one, so a second
    # pass picks up anything touching the shapes already found.
    near = pymupdf.Rect(box.x0 - 10, box.y0 - 10, box.x1 + 10, box.y1 + 10)
    for d in page.get_drawings():
        r = d["rect"]
        if not card.contains(r) or not near.intersects(r):
            continue
        if strip is not None and r.y1 <= strip + 1:
            continue
        if r.width >= card.width - 8 and r.height >= card.height - 8:
            continue
        box |= r
    return box


def label_band(page: pymupdf.Page, card: pymupdf.Rect, box: pymupdf.Rect,
               strip: float | None) -> pymupdf.Rect:
    """Grow the box to the words printed level with the diagram.

    Words inside the title strip are the question's own heading, not diagram
    labels, so they are never pulled in.
    """
    for w in page.get_text("words"):
        wr = pymupdf.Rect(w[:4])
        centre = (wr.y0 + wr.y1) / 2
        if not (box.y0 - 10 <= centre <= box.y1 + 10):
            continue
        if wr.x1 < card.x0 + 4 or wr.x0 > card.x1 - 4:
            continue
        if strip is not None and wr.y1 <= strip + 1:
            continue
        box |= wr
    return box


def crop(page: pymupdf.Page, box: pymupdf.Rect, card: pymupdf.Rect, dest: Path) -> tuple[int, int]:
    # Start below the filled title strip: cutting through it leaves half a
    # heading line in the picture.
    strip = header_strip(page, card)
    top = max(box.y0, card.y0 + 22)
    # A diagram that starts below the strip (the usual case) should not include
    # it; one that runs up into it, such as the soil-profile's sprout, keeps its
    # own top edge so the drawing is not cut.
    if strip is not None and box.y0 > strip + 1:
        top = max(top, strip + 2)
    bottom = min(box.y1 + 2, card.y1 - 2)
    top = snap_edge(page, top - MARGIN, True, card.y0 + 2, card)
    # Snapping must never clip the drawing: a shape that runs up to (or past)
    # the title strip, like the soil-profile sprout, always keeps its top edge.
    top = min(top, box.y0 - 1)
    # If that lands inside a line, take the whole line rather than its lower half.
    for line in text_lines(page):
        if line.intersects(card) and line.y0 + 0.4 < top < line.y1:
            top = line.y0 - 0.5
    bottom = snap_edge(page, bottom + MARGIN, False, card.y1 - 2, card)
    box = pymupdf.Rect(card.x0 - MARGIN, top, card.x1 + MARGIN, bottom)
    dest.parent.mkdir(parents=True, exist_ok=True)
    pix = page.get_pixmap(clip=box, dpi=DPI)
    pix.save(dest)
    return pix.width, pix.height


def passage_panels(page: pymupdf.Page) -> list[tuple[str, pymupdf.Rect]]:
    """The two leaf illustrations printed beside Passages 1 and 2.

    Each passage is a full-width card whose text runs down the left and whose
    drawing ("Open (Day)" / "Folded (Touched)") sits in a box on the right, so
    the drawings are the narrow right-hand panels of page 8.
    """
    panels = []
    for d in page.get_drawings():
        r = d["rect"]
        if 100 < r.width < 200 and r.x0 > 400 and r.height > 40:
            panels.append(r)
    panels.sort(key=lambda r: r.y0)
    return [(f"passage-{i + 1}", r) for i, r in enumerate(panels)]


def main() -> int:
    doc = pymupdf.open(PDF)
    manifest: dict[str, dict[str, dict[str, object]]] = {}
    total = 0

    for subject, (first, last) in SUBJECTS:
        found: dict[int, tuple[pymupdf.Page, pymupdf.Rect]] = {}
        for number in range(first, last + 1):
            page = doc[number - 1]
            for d in page.get_drawings():
                card = d["rect"]
                if not is_card(card):
                    continue
                q = card_number(page, card)
                if q is not None and q not in found:
                    found[q] = (page, card)

        subject_out = OUT / subject
        entries: dict[str, dict[str, object]] = {}
        for q in EXPECTED[subject]:
            if q not in found:
                raise SystemExit(f"{subject}: no card found for Q{q}")
            page, card = found[q]
            box = diagram_box(page, card)
            if box is None:
                raise SystemExit(f"{subject}: Q{q} card has no diagram shapes")
            box = label_band(page, card, box, header_strip(page, card))
            key = f"q{q}"
            dest = subject_out / f"{key}.png"
            width, height = crop(page, box, card, dest)
            entries[key] = {
                "src": f"{URL_BASE}/{subject}/{key}.png",
                "alt": f"{subject.replace('-', ' ').title()} question {q} diagram, reproduced from the examination paper",
                "page": page.number + 1,
            }
            print(f"{subject:15} Q{q:<3} page {page.number + 1:<3} {width}x{height}px")
            total += 1

        if subject == "language-arts":
            for name, rect in passage_panels(doc[7]):
                dest = subject_out / f"{name}.png"
                box = label_band(doc[7], rect, pymupdf.Rect(rect), None)
                box = pymupdf.Rect(box.x0 - MARGIN, box.y0 - MARGIN,
                                   box.x1 + MARGIN, box.y1 + MARGIN)
                pix = doc[7].get_pixmap(clip=box, dpi=DPI)
                dest.parent.mkdir(parents=True, exist_ok=True)
                pix.save(dest)
                entries[name] = {
                    "src": f"{URL_BASE}/{subject}/{name}.png",
                    "alt": "Reading passage, reproduced from the examination paper",
                    "page": 8,
                }
                print(f"{subject:15} {name:<10} page 8   {pix.width}x{pix.height}px")
                total += 1

        manifest[subject] = dict(sorted(entries.items(), key=lambda kv: str(kv[0])))

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"total crops: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
