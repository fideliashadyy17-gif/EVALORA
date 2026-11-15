import pymupdf, sys
key, page_no = sys.argv[1], int(sys.argv[2])
x0f,y0f,x1f,y1f = [float(v) for v in sys.argv[3:7]]
paths = {"myp2":"/tmp/arena-coding-uploads/MYP2 1st Term examination B.pdf",
         "myp3":"/tmp/arena-coding-uploads/Grade_8_MYP_3_Mathematics_Marking_Scheme_Version_B.pdf",
         "myp4":"/tmp/arena-coding-uploads/Grade_9_MYP_4_Mathematics_Summative_Assessment_Version_B.pdf",
         "myp5":"/tmp/arena-coding-uploads/Grade_10_MYP_5_Mathematics_Summative_Assessment.pdf"}
doc = pymupdf.open(paths[key]); page = doc[page_no-1]
def p(pt):
    try: return (round(float(pt[0]),1), round(float(pt[1]),1))
    except Exception: return pt
for i,d in enumerate(page.get_drawings()):
    r = d["rect"]
    if r.x1 < x0f or r.x0 > x1f or r.y1 < y0f or r.y0 > y1f: continue
    print(f"#{i} type={d.get('type')} fill={d.get('fill')} color={d.get('color')} rect=({r.x0:.0f},{r.y0:.0f},{r.x1:.0f},{r.y1:.0f})")
    for it in d["items"]:
        k = it[0]
        try:
            if k == "l": print("    l", p(it[1]), "->", p(it[2]))
            elif k == "re": print("    re", p(it[1]), "->", p(it[2]))
            elif k == "c": print("    c", [p(x) for x in it[1:]])
            else: print("   ", k, it[1:])
        except Exception as e: print("   ", k, "ERR", e)
