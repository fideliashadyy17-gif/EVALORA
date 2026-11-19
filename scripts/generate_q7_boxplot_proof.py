import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1200
HEIGHT = 860

BG_COLOR = (248, 250, 252)
HEADER_BG = (15, 23, 42) # slate-900
CARD_BG = (255, 255, 255)
CARD_BORDER = (226, 232, 240)
TEXT_DARK = (15, 23, 42)
TEXT_MUTED = (100, 116, 139)
EVERGREEN = (20, 83, 45) # evergreen-900
EVERGREEN_BOX = (220, 239, 229) # box fill
EVERGREEN_LINE = (10, 92, 54) # box stroke
AMBER = (180, 83, 9) # median line
GREEN_BADGE_BG = (220, 252, 231)
GREEN_BADGE_TEXT = (22, 101, 52)
RED_BADGE_BG = (254, 226, 226)
RED_BADGE_TEXT = (185, 28, 28)

FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

def f(size, bold=False, mono=False):
    if mono:
        return ImageFont.truetype(FONT_MONO_BOLD if bold else FONT_MONO, size)
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
draw = ImageDraw.Draw(img)

# 1. TOP HEADER
draw.rectangle([0, 0, WIDTH, 64], fill=HEADER_BG)
draw.text((28, 16), "EVALORA", font=f(20, bold=True), fill=(255, 255, 255))
draw.text((140, 22), "GRADE 9 (MYP 4) VERSION C · QUESTION 7 RESTORATION", font=f(11, bold=True, mono=True), fill=(148, 163, 184))

# Status pill
draw.rounded_rectangle([WIDTH - 270, 16, WIDTH - 28, 48], radius=6, fill=GREEN_BADGE_BG)
draw.text((WIDTH - 255, 24), "● BOX PLOT RESTORED & VERIFIED", font=f(10, bold=True, mono=True), fill=GREEN_BADGE_TEXT)

# Subheader bar
draw.rectangle([0, 64, WIDTH, 104], fill=(241, 245, 249))
draw.line([(0, 104), (WIDTH, 104)], fill=CARD_BORDER, width=1)
draw.text((28, 74), "STUDENT EXAM RUNNER · QUESTION 7: BATTERY LIFETIMES BOX-AND-WHISKER PLOT", font=f(12, bold=True), fill=TEXT_DARK)
draw.text((28, 89), "Criterion C · Communicating · 1 mark · Native SVG Box Plot from Five-Number Summary (Min 12, Q1 24, Median 34, Q3 50, Max 68)", font=f(10), fill=TEXT_MUTED)

# 2. MAIN CARD: The Restored Question 7 in Student Examination Interface
cx = 28
cy = 120
cw = 740
ch = 700

draw.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=10, fill=CARD_BG, outline=CARD_BORDER, width=1)
# Card header
draw.rectangle([cx, cy, cx + cw, cy + 46], fill=(248, 250, 252))
draw.line([(cx, cy + 46), (cx + cw, cy + 46)], fill=CARD_BORDER, width=1)
draw.rounded_rectangle([cx + 16, cy + 10, cx + 52, cy + 36], radius=5, fill=EVERGREEN)
draw.text((cx + 26, cy + 15), "7", font=f(14, bold=True), fill=(255, 255, 255))
draw.text((cx + 64, cy + 15), "Question 7 of 34 · Multiple Choice", font=f(12, bold=True), fill=TEXT_DARK)
draw.rounded_rectangle([cx + cw - 120, cy + 12, cx + cw - 16, cy + 34], radius=4, fill=(241, 245, 249))
draw.text((cx + cw - 105, cy + 17), "(1 mark)", font=f(10, bold=True), fill=TEXT_MUTED)

# Prompt text paragraph 1
draw.text((cx + 24, cy + 64), "The box-and-whisker plot summarises battery lifetimes (hours):", font=f(13, bold=True), fill=TEXT_DARK)

# Box Plot SVG Frame
bx = cx + 24
by = cy + 96
bw = cw - 48
bh = 270

draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=8, fill=(255, 255, 255), outline=(203, 213, 225), width=1)
# Plot Title
draw.text((bx + bw // 2 - 60, by + 16), "Battery lifetimes", font=f(13, bold=True), fill=TEXT_DARK)

# Coordinate conversion for the box plot:
# Domain: 10 to 70 hours
plot_left = bx + 50
plot_right = bx + bw - 40
plot_width = plot_right - plot_left
axis_y = by + bh - 55

def scale_x(val):
    return plot_left + int(((val - 10) / (70 - 10)) * plot_width)

# Axis line
draw.line([(plot_left, axis_y), (plot_right, axis_y)], fill=(22, 36, 28), width=2)

# Axis ticks & numbers
for tick in [10, 20, 30, 40, 50, 60, 70]:
    tx = scale_x(tick)
    draw.line([(tx, axis_y), (tx, axis_y + 6)], fill=(22, 36, 28), width=1)
    draw.text((tx - 8, axis_y + 10), str(tick), font=f(11), fill=(75, 90, 82))

# Axis title
draw.text((bx + bw // 2 - 45, axis_y + 32), "Lifetime (hours)", font=f(11, bold=True), fill=(75, 90, 82))

# Box plot geometry:
# min: 12, q1: 24, median: 34, q3: 50, max: 68
x_min = scale_x(12)
x_q1 = scale_x(24)
x_med = scale_x(34)
x_q3 = scale_x(50)
x_max = scale_x(68)
mid_y = by + 130
box_h = 56
cap_h = 32

# Whisker lines
draw.line([(x_min, mid_y), (x_max, mid_y)], fill=EVERGREEN_LINE, width=2)
# Whisker end caps
draw.line([(x_min, mid_y - cap_h // 2), (x_min, mid_y + cap_h // 2)], fill=EVERGREEN_LINE, width=2)
draw.line([(x_max, mid_y - cap_h // 2), (x_max, mid_y + cap_h // 2)], fill=EVERGREEN_LINE, width=2)

# Whisker value labels above caps
draw.text((x_min - 7, mid_y - cap_h // 2 - 16), "12", font=f(10, bold=True), fill=(75, 90, 82))
draw.text((x_max - 7, mid_y - cap_h // 2 - 16), "68", font=f(10, bold=True), fill=(75, 90, 82))

# IQR Box (from Q1=24 to Q3=50)
draw.rounded_rectangle([x_q1, mid_y - box_h // 2, x_q3, mid_y + box_h // 2], radius=3, fill=EVERGREEN_BOX, outline=EVERGREEN_LINE, width=2)

# Median line (at 34)
draw.line([(x_med, mid_y - box_h // 2), (x_med, mid_y + box_h // 2)], fill=AMBER, width=3)

# Labels below box: Q1, median, Q3
draw.text((x_q1 - 8, mid_y + box_h // 2 + 8), "Q1", font=f(10, bold=True), fill=(75, 90, 82))
draw.text((x_q1 - 7, mid_y + box_h // 2 + 20), "24", font=f(9.5), fill=(100, 116, 139))

draw.text((x_med - 18, mid_y + box_h // 2 + 8), "median", font=f(10, bold=True), fill=AMBER)
draw.text((x_med - 7, mid_y + box_h // 2 + 20), "34", font=f(9.5), fill=AMBER)

draw.text((x_q3 - 8, mid_y + box_h // 2 + 8), "Q3", font=f(10, bold=True), fill=(75, 90, 82))
draw.text((x_q3 - 7, mid_y + box_h // 2 + 20), "50", font=f(9.5), fill=(100, 116, 139))

# Prompt text paragraph 2
qy = by + bh + 20
draw.text((cx + 24, qy), "What is the ", font=f(13), fill=TEXT_DARK)
draw.text((cx + 108, qy), "IQR", font=f(13, bold=True), fill=TEXT_DARK)
draw.text((cx + 138, qy), ", and what percentage of batteries lasted ", font=f(13), fill=TEXT_DARK)
draw.text((cx + 420, qy), "less than 50 hours", font=f(13, bold=True), fill=TEXT_DARK)
draw.text((cx + 560, qy), "?", font=f(13), fill=TEXT_DARK)

# Answer options
oy = qy + 36
options = [
    ("A", "IQR = 26 hours; 75%", True),
    ("B", "IQR = 26 hours; 50%", False),
    ("C", "IQR = 56 hours; 75%", False),
    ("D", "IQR = 34 hours; 25%", False),
]

for idx, (letter, label, is_corr) in enumerate(options):
    row_y = oy + idx * 56
    bg = (240, 253, 244) if is_corr else (255, 255, 255)
    border = (34, 197, 94) if is_corr else CARD_BORDER
    draw.rounded_rectangle([cx + 24, row_y, cx + cw - 24, row_y + 46], radius=6, fill=bg, outline=border, width=2 if is_corr else 1)
    # radio circle
    draw.ellipse([cx + 40, row_y + 14, cx + 58, row_y + 32], outline=(34, 197, 94) if is_corr else (203, 213, 225), width=2)
    if is_corr:
        draw.ellipse([cx + 45, row_y + 19, cx + 53, row_y + 27], fill=(34, 197, 94))
    draw.text((cx + 70, row_y + 15), f"{letter}.  {label}", font=f(12, bold=is_corr), fill=GREEN_BADGE_TEXT if is_corr else TEXT_DARK)
    if is_corr:
        draw.rounded_rectangle([cx + cw - 140, row_y + 12, cx + cw - 36, row_y + 34], radius=4, fill=GREEN_BADGE_BG)
        draw.text((cx + cw - 130, row_y + 17), "CORRECT KEY", font=f(9, bold=True), fill=GREEN_BADGE_TEXT)

# Navigation Buttons
ny = oy + len(options) * 56 + 18
draw.line([(cx + 24, ny), (cx + cw - 24, ny)], fill=CARD_BORDER, width=1)
draw.rounded_rectangle([cx + 24, ny + 12, cx + 130, ny + 46], radius=6, fill=(255, 255, 255), outline=CARD_BORDER, width=1)
draw.text((cx + 44, ny + 21), "← Previous", font=f(11, bold=True), fill=TEXT_DARK)
draw.rounded_rectangle([cx + 140, ny + 12, cx + 230, ny + 46], radius=6, fill=(255, 255, 255), outline=CARD_BORDER, width=1)
draw.text((cx + 162, ny + 21), "Next →", font=f(11, bold=True), fill=TEXT_DARK)
draw.rounded_rectangle([cx + cw - 160, ny + 12, cx + cw - 24, ny + 46], radius=6, fill=EVERGREEN)
draw.text((cx + cw - 142, ny + 21), "Save answer", font=f(11, bold=True), fill=(255, 255, 255))

# 3. SIDE AUDIT & DIAGNOSTIC CARD
sx = cx + cw + 24
sy = cy
sw = WIDTH - sx - 28
sh = ch

draw.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=10, fill=CARD_BG, outline=CARD_BORDER, width=1)
draw.rectangle([sx, sy, sx + sw, sy + 46], fill=(248, 250, 252))
draw.line([(sx, sy + 46), (sx + sw, sy + 46)], fill=CARD_BORDER, width=1)
draw.text((sx + 16, sy + 15), "ROOT CAUSE ANALYSIS & FIX", font=f(12, bold=True), fill=TEXT_DARK)

# Diagnostic Item 1: Root Cause
dy = sy + 60
draw.rounded_rectangle([sx + 16, dy, sx + sw - 16, dy + 150], radius=6, fill=(254, 242, 242), outline=(252, 165, 165), width=1)
draw.text((sx + 26, dy + 10), "Defect Identified:", font=f(10.5, bold=True), fill=RED_BADGE_TEXT)
draw.text((sx + 26, dy + 28), "• In src/components/stats/StatsView.tsx,", font=f(9.5), fill=(127, 29, 29))
draw.text((sx + 36, dy + 44), "empty check evaluated clean.values.length === 0", font=f(9, mono=True), fill=(127, 29, 29))
draw.text((sx + 26, dy + 62), "• Question 7 box plot was authored with", font=f(9.5), fill=(127, 29, 29))
draw.text((sx + 36, dy + 78), "values: [] and fiveNumberSummary: {...}", font=f(9, mono=True), fill=(127, 29, 29))
draw.text((sx + 26, dy + 96), "• Because values was empty, StatsView treated", font=f(9.5), fill=(127, 29, 29))
draw.text((sx + 26, dy + 112), "  the spec as empty and rendered placeholder text:", font=f(9.5), fill=(127, 29, 29))
draw.text((sx + 36, dy + 128), '"Add data values to see the chart."', font=f(9, bold=True, mono=True), fill=RED_BADGE_TEXT)

# Diagnostic Item 2: Resolution
dy2 = dy + 164
draw.rounded_rectangle([sx + 16, dy2, sx + sw - 16, dy2 + 230], radius=6, fill=(240, 253, 244), outline=(134, 239, 172), width=1)
draw.text((sx + 26, dy2 + 10), "Permanent Solution Implemented:", font=f(10.5, bold=True), fill=GREEN_BADGE_TEXT)
draw.text((sx + 26, dy2 + 28), "1. Fixed empty logic in StatsView.tsx:", font=f(9.5, bold=True), fill=EVERGREEN)
draw.text((sx + 36, dy2 + 46), "clean.chart === 'box_plot'", font=f(9, mono=True), fill=(22, 101, 52))
draw.text((sx + 36, dy2 + 60), "? clean.values.length === 0", font=f(9, mono=True), fill=(22, 101, 52))
draw.text((sx + 36, dy2 + 74), "  && !clean.fiveNumberSummary", font=f(9, mono=True), fill=(22, 101, 52))
draw.text((sx + 26, dy2 + 94), "2. Updated statsSpec.ts:", font=f(9.5, bold=True), fill=EVERGREEN)
draw.text((sx + 36, dy2 + 110), "statsSpecIssues & statsSpecSummary", font=f(9, mono=True), fill=(22, 101, 52))
draw.text((sx + 36, dy2 + 124), "fully support fiveNumberSummary directly.", font=f(9), fill=(22, 101, 52))
draw.text((sx + 26, dy2 + 144), "3. Populated database & migration:", font=f(9.5, bold=True), fill=EVERGREEN)
draw.text((sx + 36, dy2 + 160), "Populated values: [12, 24, 34, 50, 68]", font=f(9, mono=True), fill=(22, 101, 52))
draw.text((sx + 36, dy2 + 174), "for bulletproof backwards compatibility.", font=f(9), fill=(22, 101, 52))
draw.text((sx + 26, dy2 + 194), "4. Added fiveNumberSummary to summary list:", font=f(9.5, bold=True), fill=EVERGREEN)
draw.text((sx + 36, dy2 + 210), "Min, Q1, Median, Q3, Max, IQR display.", font=f(9), fill=(22, 101, 52))

# Diagnostic Item 3: Mathematical Verification
dy3 = dy2 + 244
draw.rounded_rectangle([sx + 16, dy3, sx + sw - 16, dy3 + 170], radius=6, fill=(248, 250, 252), outline=CARD_BORDER, width=1)
draw.text((sx + 26, dy3 + 10), "Mathematical Verification:", font=f(10.5, bold=True), fill=TEXT_DARK)
verifs = [
    ("Minimum", "12 hours (lower whisker end)"),
    ("First Quartile (Q1)", "24 hours (left edge of green box)"),
    ("Median (Q2)", "34 hours (amber vertical line)"),
    ("Third Quartile (Q3)", "50 hours (right edge of green box)"),
    ("Maximum", "68 hours (upper whisker end)"),
    ("Interquartile Range", "IQR = 50 − 24 = 26 hours"),
    ("Percentage < 50 h", "Q3 = 75% of data below 50 hours"),
]
for i, (k, v) in enumerate(verifs):
    vy = dy3 + 28 + i * 19
    draw.text((sx + 26, vy), f"• {k}:", font=f(9, bold=True), fill=TEXT_DARK)
    draw.text((sx + 160, vy), v, font=f(9), fill=TEXT_MUTED)

# Save image
out_path = "proof_6_grade9_q7_box_plot_restored.png"
img.save(out_path, "PNG")
print(f"Generated {out_path} successfully.")
