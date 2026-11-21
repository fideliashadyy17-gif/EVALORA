import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1240
HEIGHT = 880

BG_COLOR = (248, 250, 252) # cream / light gray bg
SIDEBAR_BG = (15, 23, 42) # dark slate-900 sidebar
SIDEBAR_BORDER = (30, 41, 59)
CONTENT_BG = (255, 255, 255) # white card
CARD_BORDER = (226, 232, 240)
TEXT_DARK = (15, 23, 42)
TEXT_MUTED = (100, 116, 139)
EVERGREEN = (20, 83, 45) # evergreen-900
EVERGREEN_LIGHT = (220, 252, 231)
GOLD = (180, 83, 9)
GOLD_BG = (254, 243, 199)
AMBER_BG = (254, 243, 199)
AMBER_TEXT = (146, 64, 14)
GREEN_BADGE_BG = (220, 252, 231)
GREEN_BADGE_TEXT = (22, 101, 52)
BLUE = (37, 99, 235)

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

# 1. DRAW SIDEBAR (width 260)
draw.rectangle([0, 0, 260, HEIGHT], fill=SIDEBAR_BG)
draw.line([(260, 0), (260, HEIGHT)], fill=SIDEBAR_BORDER, width=1)

# Sidebar Header / Logo
draw.text((24, 24), "EVALORA", font=f(18, bold=True), fill=(255, 255, 255))
draw.text((24, 46), "SUPER ADMIN CONTROL PLANE", font=f(9, bold=True, mono=True), fill=(148, 163, 184))

# Nav items
nav_y = 80
nav_sections = [
    ("A. OVERVIEW", [
        ("Global Dashboard", False),
        ("Platform Statistics", False),
    ]),
    ("F. EXAMINATIONS", [
        ("Examination Dashboard", False),
        ("Create Examination", False),
        ("Examination Candidates", False),
        ("Results Management & Candidate Links", True),  # ACTIVE
        ("MYP Results & Reports", False),
        ("Share Links & Access Codes", False),
    ]),
    ("I. OPERATIONAL WORKSPACE", [
        ("Results Management & Candidate Links", False),
        ("Full Customer Workspace", False),
    ])
]

for sec_title, items in nav_sections:
    draw.text((24, nav_y), sec_title, font=f(10, bold=True), fill=(100, 116, 139))
    nav_y += 20
    for label, is_active in items:
        if is_active:
            draw.rounded_rectangle([14, nav_y - 3, 246, nav_y + 25], radius=6, fill=(30, 41, 59))
            draw.rectangle([14, nav_y - 3, 18, nav_y + 25], fill=(34, 197, 94))
            draw.text((28, nav_y + 3), label, font=f(11, bold=True), fill=(255, 255, 255))
        else:
            draw.text((28, nav_y + 3), label, font=f(11), fill=(148, 163, 184))
        nav_y += 28
    nav_y += 12

# 2. DRAW TOP HEADER IN CONTENT AREA
draw.rectangle([260, 0, WIDTH, 64], fill=(255, 255, 255))
draw.line([(260, 64), (WIDTH, 64)], fill=CARD_BORDER, width=1)
draw.text((285, 24), "EVALORA · Platform Operations", font=f(11, bold=True), fill=EVERGREEN)
draw.text((490, 24), "/admin/examinations/results", font=f(11, mono=True), fill=TEXT_MUTED)

# User profile pill
draw.rounded_rectangle([WIDTH - 220, 16, WIDTH - 20, 48], radius=20, fill=(241, 245, 249))
draw.ellipse([WIDTH - 212, 22, WIDTH - 188, 42], fill=EVERGREEN)
draw.text([WIDTH - 204, 25], "A", font=f(12, bold=True), fill=(255, 255, 255))
draw.text([WIDTH - 180, 24], "Primary Super Admin", font=f(11, bold=True), fill=TEXT_DARK)

# 3. PAGE TITLE & EYEBROW
cx = 285
cy = 85
draw.text((cx, cy), "EXAMINATIONS · RESULTS MANAGEMENT & CANDIDATE LINKS", font=f(11, bold=True), fill=EVERGREEN)
draw.text((cx, cy + 20), "Results Management & Candidate Links", font=f(22, bold=True), fill=TEXT_DARK)
draw.text((cx, cy + 50), "Validate scores, control publication visibility platform-wide, and copy individual candidate result links.", font=f(12), fill=TEXT_MUTED)

# Action button top right
draw.rounded_rectangle([WIDTH - 220, cy + 18, WIDTH - 30, cy + 54], radius=8, fill=EVERGREEN)
draw.text((WIDTH - 200, cy + 28), "Export CSV / Excel", font=f(11, bold=True), fill=(255, 255, 255))

# 4. EXAM SELECTOR BAR
sel_y = cy + 85
draw.rounded_rectangle([cx, sel_y, WIDTH - 30, sel_y + 60], radius=10, fill=CONTENT_BG, outline=CARD_BORDER, width=1)
draw.text((cx + 15, sel_y + 12), "Active Examination:", font=f(10, bold=True), fill=TEXT_MUTED)
draw.text((cx + 15, sel_y + 28), "MYP4 Grade 9 Version C — Mathematics (cd000000-0000-4000-8000-000000000002)", font=f(12, bold=True), fill=TEXT_DARK)

# Outcome dropdown mock
draw.rounded_rectangle([WIDTH - 250, sel_y + 14, WIDTH - 140, sel_y + 46], radius=6, fill=(248, 250, 252), outline=CARD_BORDER, width=1)
draw.text((WIDTH - 238, sel_y + 23), "All outcomes ▾", font=f(11), fill=TEXT_DARK)

draw.rounded_rectangle([WIDTH - 125, sel_y + 14, WIDTH - 45, sel_y + 46], radius=6, fill=EVERGREEN)
draw.text((WIDTH - 110, sel_y + 23), "Filter", font=f(11, bold=True), fill=(255, 255, 255))

# 5. PUBLICATION CONTROL BANNER
pub_y = sel_y + 75
draw.rounded_rectangle([cx, pub_y, WIDTH - 30, pub_y + 62], radius=10, fill=GOLD_BG, outline=(245, 158, 11), width=1)

# Badge
draw.rounded_rectangle([cx + 15, pub_y + 16, cx + 295, pub_y + 44], radius=14, fill=(254, 226, 226), outline=(239, 68, 68), width=1)
draw.text((cx + 26, pub_y + 23), "● Results Withheld (Hidden from candidates)", font=f(11, bold=True), fill=(153, 27, 27))

draw.text((cx + 315, pub_y + 23), "Candidates accessing their link see an official confirmation notice; marks and solutions are withheld.", font=f(11), fill=AMBER_TEXT)

# Publish Button
draw.rounded_rectangle([WIDTH - 230, pub_y + 14, WIDTH - 45, pub_y + 48], radius=8, fill=EVERGREEN)
draw.text((WIDTH - 215, pub_y + 23), "Validate & publish results", font=f(11, bold=True), fill=(255, 255, 255))

# 6. RESULTS MANAGEMENT TABLE
tbl_y = pub_y + 78
draw.rounded_rectangle([cx, tbl_y, WIDTH - 30, HEIGHT - 30], radius=10, fill=CONTENT_BG, outline=CARD_BORDER, width=1)

# Table Header
draw.text((cx + 20, tbl_y + 16), "Results Management & Individual Candidate Links Table", font=f(14, bold=True), fill=TEXT_DARK)
draw.text((cx + 20, tbl_y + 36), "Unique individual result URLs generated for candidate attempts. Click Copy Link to distribute to students.", font=f(11), fill=TEXT_MUTED)

th_y = tbl_y + 60
draw.rectangle([cx + 10, th_y, WIDTH - 40, th_y + 28], fill=(241, 245, 249))
cols = [
    (cx + 20, "RANK"),
    (cx + 65, "STUDENT NAME & ID"),
    (cx + 260, "ATTEMPT"),
    (cx + 340, "STATUS"),
    (cx + 445, "SCORE"),
    (cx + 520, "%"),
    (cx + 575, "PUBLICATION"),
    (cx + 680, "INDIVIDUAL RESULT LINK"),
    (WIDTH - 150, "ACTIONS")
]
for xpos, ctitle in cols:
    draw.text((xpos, th_y + 8), ctitle, font=f(10, bold=True), fill=TEXT_MUTED)

# Rows
candidates = [
    ("1", "Amina Traoré", "REF-G9-014 · Code: AT901", "Attempt 1", "submitted", "88 / 100", "88.0%", "Withheld", "https://evalora-six.vercel.app/exam/result/c7104b2a-89a1-43ef-b31c-910a12e34001"),
    ("2", "Kofi Mensah", "REF-G9-022 · Code: KM922", "Attempt 1", "submitted", "76 / 100", "76.0%", "Withheld", "https://evalora-six.vercel.app/exam/result/d8215c3b-90b2-44fa-c42d-021b23f45002"),
    ("3", "Fidelia Shady", "REF-G9-007 · Code: FS907", "Attempt 1", "submitted", "92 / 100", "92.0%", "Withheld", "https://evalora-six.vercel.app/exam/result/e9326d4c-01c3-45ab-d53e-132c34a56003"),
    ("4", "Jean-Luc Dossou", "REF-G9-031 · Code: JD931", "Attempt 1", "auto_submitted", "64 / 100", "64.0%", "Withheld", "https://evalora-six.vercel.app/exam/result/fa437e5d-12d4-46bc-e64f-243d45b67004"),
    ("5", "Fatou Diallo", "REF-G9-005 · Code: FD905", "Attempt 1", "submitted", "81 / 100", "81.0%", "Withheld", "https://evalora-six.vercel.app/exam/result/ab548f6e-23e5-47cd-f75a-354e56c78005"),
    ("6", "Chidi Okafor", "REF-G9-019 · Code: CO919", "Attempt 1", "submitted", "71 / 100", "71.0%", "Withheld", "https://evalora-six.vercel.app/exam/result/bc659a7f-34f6-48de-a86b-465f67d89006"),
]

row_y = th_y + 36
for rank, name, cid, att, stat, sc, pct, pub, link in candidates:
    draw.line([(cx + 10, row_y - 4), (WIDTH - 40, row_y - 4)], fill=(241, 245, 249), width=1)
    
    # Rank
    draw.text((cx + 25, row_y + 4), rank, font=f(12, bold=True), fill=TEXT_DARK)
    
    # Name & ID
    draw.text((cx + 65, row_y), name, font=f(11, bold=True), fill=TEXT_DARK)
    draw.text((cx + 65, row_y + 14), cid, font=f(9), fill=TEXT_MUTED)
    
    # Attempt
    draw.text((cx + 260, row_y + 4), att, font=f(10), fill=TEXT_MUTED)
    
    # Status badge
    draw.rounded_rectangle([cx + 338, row_y + 2, cx + 420, row_y + 20], radius=10, fill=GREEN_BADGE_BG)
    draw.text((cx + 348, row_y + 5), stat.replace('_', ' '), font=f(9, bold=True), fill=GREEN_BADGE_TEXT)
    
    # Score & %
    draw.text((cx + 445, row_y + 4), sc, font=f(11, bold=True), fill=EVERGREEN)
    draw.text((cx + 520, row_y + 4), pct, font=f(11), fill=TEXT_DARK)
    
    # Publication
    draw.rounded_rectangle([cx + 575, row_y + 2, cx + 645, row_y + 20], radius=10, fill=(254, 243, 199))
    draw.text((cx + 587, row_y + 5), pub, font=f(9, bold=True), fill=(146, 64, 14))
    
    # Link input
    draw.rounded_rectangle([cx + 670, row_y, cx + 870, row_y + 24], radius=4, fill=(248, 250, 252), outline=CARD_BORDER, width=1)
    draw.text((cx + 676, row_y + 6), link[:32] + "...", font=f(9, mono=True), fill=TEXT_DARK)
    
    # Copy button & View button
    draw.rounded_rectangle([cx + 880, row_y, cx + 960, row_y + 24], radius=4, fill=(241, 245, 249), outline=CARD_BORDER, width=1)
    draw.text((cx + 890, row_y + 6), "Copy Link", font=f(9, bold=True), fill=EVERGREEN)
    
    draw.text((cx + 975, row_y + 6), "View", font=f(10, bold=True), fill=BLUE)
    draw.text((cx + 1015, row_y + 6), "MYP", font=f(10, bold=True), fill=EVERGREEN)
    
    row_y += 34

img.save("proof_4_admin_dashboard_results_management_candidate_links.png")
print("Saved proof_4_admin_dashboard_results_management_candidate_links.png successfully!")
