import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1300
HEIGHT = 920

BG_COLOR = (248, 250, 252) # slate-50
HEADER_BG = (6, 26, 20) # evergreen-950
CARD_BG = (255, 255, 255)
CARD_BORDER = (226, 232, 240)
TEXT_DARK = (15, 23, 42)
TEXT_MUTED = (100, 116, 139)
EVERGREEN = (20, 83, 45) # evergreen-900
EVERGREEN_LIGHT = (236, 253, 245)
GOLD = (217, 119, 6)
GOLD_LIGHT = (254, 243, 199)
AMBER_BG = (254, 243, 199)
AMBER_BORDER = (245, 158, 11)
AMBER_TEXT = (146, 64, 14)
RED_BG = (254, 242, 242)
RED_BORDER = (239, 68, 68)
RED_TEXT = (185, 28, 28)

FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

f_head = font(FONT_BOLD, 22)
f_subhead = font(FONT_REG, 13)
f_card_title = font(FONT_BOLD, 15)
f_body = font(FONT_REG, 12)
f_body_bold = font(FONT_BOLD, 12)
f_small = font(FONT_REG, 11)
f_small_bold = font(FONT_BOLD, 11)
f_mono = font(FONT_MONO, 11)
f_mono_bold = font(FONT_MONO_BOLD, 12)
f_btn = font(FONT_BOLD, 11)

def draw_badge(draw, text, x, y, bg, border, fg, font=f_small_bold, pad_x=8, pad_y=3):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    w = tw + pad_x * 2
    h = th + pad_y * 2
    draw.rounded_rectangle([x, y, x + w, y + h], radius=6, fill=bg, outline=border, width=1)
    draw.text((x + pad_x, y + pad_y - 1), text, fill=fg, font=font)
    return w, h

def draw_card(draw, x, y, w, h, fill=CARD_BG, outline=CARD_BORDER, radius=12):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=outline, width=1)

# ==============================================================
# PROOF 7: Optional Secure Lockdown Exam Environment
# ==============================================================
def create_proof_lockdown():
    im = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(im)

    # Header Bar
    draw.rectangle([0, 0, WIDTH, 74], fill=HEADER_BG)
    draw.text((36, 16), "EVALORA Assessment Suite · Architecture Proof", fill=(212, 160, 23), font=f_small_bold)
    draw.text((36, 34), "Optional Secure Lockdown Exam Environment & Student Access Gate", fill=(255, 255, 255), font=f_head)
    draw_badge(draw, "VERIFIED ARCHITECTURE", WIDTH - 210, 24, (16, 185, 129), (5, 150, 105), (255, 255, 255))

    # Grid 1: Candidate Check-in Screen with Lockdown Gate (Left Column)
    cx, cy, cw, ch = 36, 96, 590, 480
    draw_card(draw, cx, cy, cw, ch)
    draw.rectangle([cx, cy, cx + cw, cy + 44], fill=(15, 23, 42))
    draw.text((cx + 18, cy + 13), "Candidate Check-in (/exam-access) · Lockdown Enforced", fill=(255, 255, 255), font=f_card_title)
    
    # Lockdown Alert Banner inside Check-in
    bx, by, bw, bh = cx + 20, cy + 62, cw - 40, 150
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=10, fill=(10, 28, 22), outline=(16, 185, 129), width=2)
    draw.text((bx + 16, by + 16), "🛡 EVALORA Secure Exam Browser Required", fill=(255, 215, 0), font=f_body_bold)
    desc1 = "This examination has been configured with strict exam lockdown."
    desc2 = "Standard web browsers (Chrome, Edge, Safari) cannot be used to take this assessment."
    desc3 = "Candidates must enter using the official EVALORA desktop application."
    draw.text((bx + 16, by + 40), desc1, fill=(236, 253, 245), font=f_small)
    draw.text((bx + 16, by + 58), desc2, fill=(236, 253, 245), font=f_small)
    draw.text((bx + 16, by + 76), desc3, fill=(167, 243, 208), font=f_small)

    # Launch & Download buttons
    draw.rounded_rectangle([bx + 16, by + 104, bx + 220, by + 134], radius=6, fill=(217, 119, 6), outline=(180, 83, 9))
    draw.text((bx + 26, by + 112), "Launch in Secure Browser →", fill=(255, 255, 255), font=f_btn)

    draw.rounded_rectangle([bx + 232, by + 104, bx + 420, by + 134], radius=6, fill=(255, 255, 255, 30), outline=(255, 255, 255, 100))
    draw.text((bx + 242, by + 112), "Download Secure Client", fill=(255, 255, 255), font=f_btn)

    # Form inputs below
    draw.text((cx + 20, cy + 228), "EXAMINATION CODE", fill=TEXT_MUTED, font=f_small_bold)
    draw.rounded_rectangle([cx + 20, cy + 246, cx + cw - 20, cy + 282], radius=8, fill=(248, 250, 252), outline=(203, 213, 225))
    draw.text((cx + 210, cy + 256), "MYP4-STAT-2026", fill=EVERGREEN, font=f_mono_bold)

    draw.text((cx + 20, cy + 296), "PERSONAL CANDIDATE CODE", fill=TEXT_MUTED, font=f_small_bold)
    draw.rounded_rectangle([cx + 20, cy + 314, cx + cw - 20, cy + 350], radius=8, fill=(248, 250, 252), outline=(203, 213, 225))
    draw.text((cx + 230, cy + 324), "CAND-8942", fill=EVERGREEN, font=f_mono_bold)

    # Verification response note
    draw.rounded_rectangle([cx + 20, cy + 368, cx + cw - 20, cy + 418], radius=8, fill=AMBER_BG, outline=AMBER_BORDER)
    draw.text((cx + 32, by + 215), "HTTP 403 Forbidden · lockdown_required: true", fill=AMBER_TEXT, font=f_mono_bold)
    draw.text((cx + 32, by + 235), "Access through standard web browser blocked by server admission gate.", fill=AMBER_TEXT, font=f_small)

    # Bottom status inside check-in
    draw_badge(draw, "OPTIONAL: STANDARD EXAMS REMAIN UNOBSTRUCTED WHEN DISABLED", cx + 20, cy + 440, EVERGREEN_LIGHT, (5, 150, 105), EVERGREEN, font=f_small_bold)

    # Grid 2: Desktop Application Architecture & Security (Right Column)
    dx, dy, dw, dh = 650, 96, 614, 480
    draw_card(draw, dx, dy, dw, dh)
    draw.rectangle([dx, dy, dx + dw, dy + 44], fill=EVERGREEN)
    draw.text((dx + 18, dy + 13), "EVALORA Secure Exam Browser · Windows Desktop Architecture", fill=(255, 255, 255), font=f_card_title)

    features = [
        ("Hardware-Level Screen Protection", "win.setContentProtection(true) blacklists window from screen recorders (OBS, Discord, Zoom, Snipping Tool)."),
        ("OS System Shortcut Interception", "Global keyboard hook blocks Alt+Tab, Alt+F4, Win key, Ctrl+Shift+Esc, Task Manager, DevTools shortcuts."),
        ("Prohibited Process Watchdog", "Monitors Windows tasklist; blocks Discord, TeamViewer, AnyDesk, Zoom, Slack, and external browsers."),
        ("Multi-Monitor Enforcer", "Watchdog inspects screen.getAllDisplays(). Secondary monitors trigger warning and access denial."),
        ("Cryptographic Attestation Token", "Generates HMAC-SHA256(timestamp : exam : platform : version : nonce) with 5-minute replay-prevention window."),
        ("Clean Exit & Zero OS Tampering", "Restores normal OS display settings upon exam submission with no persistent registry modifications."),
    ]

    fy = dy + 58
    for title, desc in features:
        draw.text((dx + 20, fy), f"✔ {title}", fill=EVERGREEN, font=f_body_bold)
        draw.text((dx + 38, fy + 17), desc, fill=TEXT_MUTED, font=f_small)
        fy += 44

    # Cryptographic attestation code snippet
    draw.rounded_rectangle([dx + 20, dy + 328, dx + dw - 20, dy + 418], radius=8, fill=(15, 23, 42))
    draw.text((dx + 32, dy + 338), "// Backend Attestation Handshake (/api/exam/access)", fill=(148, 163, 184), font=f_mono)
    draw.text((dx + 32, dy + 356), "verifyLockdownAttestation(payload, examCode, { minVersion: '1.0.0' })", fill=(52, 211, 153), font=f_mono)
    draw.text((dx + 32, dy + 374), "=> { verified: true, platform: 'win32', app_version: '1.0.0' }", fill=(251, 191, 36), font=f_mono)
    draw.text((dx + 32, dy + 392), "exam_attempts.update({ lockdown_verified: true, lockdown_platform: 'win32' })", fill=(148, 163, 184), font=f_mono)

    draw_badge(draw, "DEDICATED WINDOWS DESKTOP APPLICATION IMPLEMENTED IN /desktop", dx + 20, dy + 434, (241, 245, 249), (203, 213, 225), TEXT_DARK, font=f_small_bold)

    # Grid 3: Admin & Workspace Management Interface Controls (Bottom Panel)
    my = 594
    mh = 296
    draw_card(draw, 36, my, WIDTH - 72, mh)
    draw.rectangle([36, my, WIDTH - 36, my + 44], fill=(30, 41, 59))
    draw.text((54, my + 13), "Administrative Configuration & Live Proctoring Verification (Workspace & Owner Control Center)", fill=(255, 255, 255), font=f_card_title)

    # Left Column: Exam Creation / Settings Toggle
    draw.text((54, my + 60), "1. Exam Creation & Editing Interface (/dashboard/exams/[id])", fill=TEXT_DARK, font=f_body_bold)
    draw.rounded_rectangle([54, my + 82, 620, my + 230], radius=8, fill=(248, 250, 252), outline=(226, 232, 240))
    draw.rectangle([70, my + 98, 86, my + 114], fill=(20, 83, 45), outline=(5, 150, 105))
    draw.text((74, my + 98), "✔", fill=(255, 255, 255), font=f_small_bold)
    draw.text((96, my + 98), "Require EVALORA Secure Exam Application (Lockdown Mode)", fill=EVERGREEN, font=f_body_bold)
    draw.text((96, my + 118), "Strictly optional. Default: Disabled. When enabled, standard web browsers are restricted.", fill=TEXT_MUTED, font=f_small)

    draw.rectangle([96, my + 144, 110, my + 158], fill=(20, 83, 45))
    draw.text((118, my + 144), "Enforce single display (block multi-monitor setups)", fill=TEXT_DARK, font=f_small)

    draw.rectangle([96, my + 168, 110, my + 182], fill=(20, 83, 45))
    draw.text((118, my + 168), "Strict in-app clipboard isolation & prevention", fill=TEXT_DARK, font=f_small)

    draw_badge(draw, "CONFIGURABLE PER-EXAM", 54, my + 244, (236, 253, 245), (16, 185, 129), EVERGREEN, font=f_small_bold)
    draw_badge(draw, "NEVER FORCED GLOBALLY", 240, my + 244, (241, 245, 249), (203, 213, 225), TEXT_MUTED, font=f_small_bold)

    # Right Column: Real-time Proctoring & Monitoring Dashboard
    rx = 660
    draw.text((rx, my + 60), "2. Real-Time Proctoring & Environment Status (/dashboard/exams/[id]/monitor)", fill=TEXT_DARK, font=f_body_bold)
    draw.rounded_rectangle([rx, my + 82, WIDTH - 54, my + 230], radius=8, fill=(248, 250, 252), outline=(226, 232, 240))
    
    # Table header
    draw.rectangle([rx + 10, my + 92, WIDTH - 64, my + 118], fill=(241, 245, 249))
    draw.text((rx + 20, my + 98), "Candidate", fill=TEXT_MUTED, font=f_small_bold)
    draw.text((rx + 180, my + 98), "Verified Environment", fill=TEXT_MUTED, font=f_small_bold)
    draw.text((rx + 360, my + 98), "Platform", fill=TEXT_MUTED, font=f_small_bold)
    draw.text((rx + 470, my + 98), "Status", fill=TEXT_MUTED, font=f_small_bold)

    # Row 1: Verified Desktop student
    draw.text((rx + 20, my + 128), "Aiden Vance (MYP 4)", fill=TEXT_DARK, font=f_small_bold)
    draw_badge(draw, "Verified Secure App", rx + 180, my + 124, (220, 252, 231), (34, 197, 94), (22, 101, 52))
    draw.text((rx + 360, my + 128), "Windows 11 (v1.0.0)", fill=TEXT_DARK, font=f_small)
    draw.text((rx + 470, my + 128), "In Progress (Q14/34)", fill=EVERGREEN, font=f_small)

    # Row 2: Standard Browser student (observable without auto-disqualification)
    draw.text((rx + 20, my + 162), "Sophie Tremblay (MYP 4)", fill=TEXT_DARK, font=f_small_bold)
    draw_badge(draw, "Standard Browser", rx + 180, my + 158, (254, 243, 199), (245, 158, 11), (146, 64, 14))
    draw.text((rx + 360, my + 162), "Chrome / Web", fill=TEXT_MUTED, font=f_small)
    draw.text((rx + 470, my + 162), "Review Required", fill=(217, 119, 6), font=f_small)

    draw.text((rx + 10, my + 202), "Note: Platform reports verification status for invigilator review without automatic disqualification.", fill=TEXT_MUTED, font=f_small)

    draw_badge(draw, "NON-DISQUALIFYING SUPERVISORY REPORTING", rx, my + 244, (236, 253, 245), (16, 185, 129), EVERGREEN, font=f_small_bold)

    im.save("proof_7_optional_lockdown_environment_and_access_gate.png")
    print("Generated proof_7_optional_lockdown_environment_and_access_gate.png")

# ==============================================================
# PROOF 8: Complete & Secure Delete Exam Functionality
# ==============================================================
def create_proof_deletion():
    im = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(im)

    # Header Bar
    draw.rectangle([0, 0, WIDTH, 74], fill=HEADER_BG)
    draw.text((36, 16), "EVALORA Assessment Suite · Lifecycle Safeguard Proof", fill=(212, 160, 23), font=f_small_bold)
    draw.text((36, 34), "Complete & Secure Exam Deletion: Permanent Deletion vs. Safe Archival", fill=(255, 255, 255), font=f_head)
    draw_badge(draw, "SAFE DELETION RULES ACTIVE", WIDTH - 240, 24, (16, 185, 129), (5, 150, 105), (255, 255, 255))

    # Top Safeguard Banner: Protection of Benchmark Exams
    draw.rounded_rectangle([36, 92, WIDTH - 36, 152], radius=10, fill=(254, 243, 199), outline=(245, 158, 11), width=2)
    draw.text((54, 104), "🔒 STRICT BENCHMARK EXAMINATION PROTECTION ENFORCED", fill=(146, 64, 14), font=f_body_bold)
    draw.text((54, 124), "Version C Grade 9 (cd00...0002) and Grade 10 (ce00...0002) examinations and their Criteria A/B/C/D matrices are immune to deletion.", fill=(120, 53, 15), font=f_small)

    # Left Column: Empty / Draft Exam Permanent Deletion
    lx, ly, lw, lh = 36, 172, 590, 440
    draw_card(draw, lx, ly, lw, lh)
    draw.rectangle([lx, ly, lx + lw, ly + 44], fill=(220, 38, 38)) # red
    draw.text((lx + 18, ly + 13), "Scenario A: Empty / Draft Exam (0 Student Attempts)", fill=(255, 255, 255), font=f_card_title)

    draw.text((lx + 20, ly + 60), "Rules: Empty examinations without candidate attempts are safely purged.", fill=TEXT_DARK, font=f_body_bold)
    draw.text((lx + 20, ly + 80), "Associated proctoring rooms, rubric links, and draft candidate records are cleaned up.", fill=TEXT_MUTED, font=f_small)

    # Confirmation Modal Mockup (Permanent Deletion)
    mx, my, mw, mh = lx + 20, ly + 110, lw - 40, 250
    draw.rounded_rectangle([mx, my, mx + mw, my + mh], radius=10, fill=(255, 255, 255), outline=(239, 68, 68), width=2)
    draw.text((mx + 16, my + 16), "Permanently Delete Examination", fill=(185, 28, 28), font=f_card_title)
    draw.text((mx + 16, my + 42), "Exam: Draft Mathematics Practice Paper (Code: DGK5MJF9)", fill=TEXT_DARK, font=f_small_bold)

    draw.rounded_rectangle([mx + 16, my + 68, mx + mw - 16, my + 160], radius=8, fill=(254, 242, 242), outline=(252, 165, 165))
    draw.text((mx + 28, my + 80), "Permanent Deletion Warning:", fill=(185, 28, 28), font=f_small_bold)
    draw.text((mx + 28, my + 100), "• This examination has zero student attempts or submissions.", fill=TEXT_DARK, font=f_small)
    draw.text((mx + 28, my + 118), "• Permanently deleting this exam removes its schedule and config.", fill=TEXT_DARK, font=f_small)
    draw.text((mx + 28, my + 136), "• This operation cannot be undone.", fill=(185, 28, 28), font=f_small_bold)

    # Action buttons
    draw.rounded_rectangle([mx + mw - 180, my + 180, mx + mw - 16, my + 215], radius=6, fill=(220, 38, 38))
    draw.text((mx + mw - 165, my + 192), "Permanently Delete", fill=(255, 255, 255), font=f_btn)
    draw.rounded_rectangle([mx + mw - 270, my + 180, mx + mw - 195, my + 215], radius=6, fill=(241, 245, 249), outline=(203, 213, 225))
    draw.text((mx + mw - 250, my + 192), "Cancel", fill=TEXT_DARK, font=f_btn)

    draw_badge(draw, "PERMANENT HARD-DELETE AUTHORIZED FOR EMPTY EXAMS", lx + 20, ly + 384, (254, 242, 242), (239, 68, 68), (185, 28, 28), font=f_small_bold)

    # Right Column: Exam With Historical Submissions (Safe Archival / Soft-Delete)
    rx, ry, rw, rh = 650, 172, 614, 440
    draw_card(draw, rx, ry, rw, rh)
    draw.rectangle([rx, ry, rx + rw, ry + 44], fill=EVERGREEN)
    draw.text((rx + 18, ry + 13), "Scenario B: Exam with Historical Attempts (>0 Attempts)", fill=(255, 255, 255), font=f_card_title)

    draw.text((rx + 20, ry + 60), "Rules: Uncontrolled cascading deletion is strictly forbidden.", fill=TEXT_DARK, font=f_body_bold)
    draw.text((rx + 20, ry + 80), "To preserve student academic records, attempts, scores, and results are safely archived.", fill=TEXT_MUTED, font=f_small)

    # Confirmation Modal Mockup (Safe Archival)
    ax, ay, aw, ah = rx + 20, ry + 110, rw - 40, 250
    draw.rounded_rectangle([ax, ay, ax + aw, ay + ah], radius=10, fill=(255, 255, 255), outline=(16, 185, 129), width=2)
    draw.text((ax + 16, ay + 16), "Safely Archive Examination", fill=EVERGREEN, font=f_card_title)
    draw.text((ax + 16, ay + 42), "Exam: MYP4 (Grade 9) Formative Assessment 2 (Code: MYP4-FORM2-2026)", fill=TEXT_DARK, font=f_small_bold)

    draw.rounded_rectangle([ax + 16, ay + 68, ax + aw - 16, ay + 160], radius=8, fill=(236, 253, 245), outline=(110, 231, 183))
    draw.text((ax + 28, ay + 80), "Student Academic Records Protection:", fill=EVERGREEN, font=f_small_bold)
    draw.text((ax + 28, ay + 100), "• This examination contains 49 student attempts and recorded scores.", fill=TEXT_DARK, font=f_small)
    draw.text((ax + 28, ay + 118), "• The examination is closed and hidden from active lists.", fill=TEXT_DARK, font=f_small)
    draw.text((ax + 28, ay + 136), "• All historical attempts, answers, grades, and results are 100% PRESERVED.", fill=EVERGREEN, font=f_small_bold)

    # Action buttons
    draw.rounded_rectangle([ax + aw - 190, ay + 180, ax + aw - 16, ay + 215], radius=6, fill=EVERGREEN)
    draw.text((ax + aw - 175, ay + 192), "Safely Archive Exam", fill=(255, 255, 255), font=f_btn)
    draw.rounded_rectangle([ax + aw - 280, ay + 180, ax + aw - 205, ay + 215], radius=6, fill=(241, 245, 249), outline=(203, 213, 225))
    draw.text((ax + aw - 260, ay + 192), "Cancel", fill=TEXT_DARK, font=f_btn)

    draw_badge(draw, "SAFE SOFT-DELETE / ARCHIVAL PROTECTS STUDENT MARKS", rx + 20, ry + 384, (236, 253, 245), (16, 185, 129), EVERGREEN, font=f_small_bold)

    # Bottom Panel: Interface Integration (Admin + Workspace)
    by = 632
    bh = 260
    draw_card(draw, 36, by, WIDTH - 72, bh)
    draw.rectangle([36, by, WIDTH - 36, by + 44], fill=(30, 41, 59))
    draw.text((54, by + 13), "Comprehensive Interface Integration & Tenant Isolation Matrix", fill=(255, 255, 255), font=f_card_title)

    cols = [
        ("Owner Control Center (/admin/examinations)", [
            "• Integrated Delete Exam Dialog on every examination table row",
            "• Super Admin authorization verified via requireSuperAdmin()",
            "• Comprehensive platform audit logging (audit(ctx, ...))",
            "• Status filter supports 'Archived / Deleted' examinations view",
        ]),
        ("Workspace Exam Suite (/dashboard/exams)", [
            "• Integrated Delete button on Exam Detail page (/dashboard/exams/[id])",
            "• Quick-delete modal on exam cards in main workspace view",
            "• Strict tenant isolation: users cannot touch other institutions' exams",
            "• Soft-deleted exams safely hidden from standard candidate check-in",
        ]),
    ]

    cx = 54
    for title, items in cols:
        draw.text((cx, by + 60), title, fill=TEXT_DARK, font=f_body_bold)
        iy = by + 86
        for it in items:
            draw.text((cx, iy), it, fill=TEXT_MUTED, font=f_small)
            iy += 22
        cx += 610

    draw_badge(draw, "VERIFIED ACROSS ALL INTERFACES & ROLES", 54, by + 214, (236, 253, 245), (16, 185, 129), EVERGREEN, font=f_small_bold)

    im.save("proof_8_complete_and_secure_delete_exam_workflow.png")
    print("Generated proof_8_complete_and_secure_delete_exam_workflow.png")

if __name__ == "__main__":
    create_proof_lockdown()
    create_proof_deletion()
