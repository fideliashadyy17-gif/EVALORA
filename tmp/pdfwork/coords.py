import pymupdf, sys, json
key = sys.argv[1]; page_no = int(sys.argv[2])
paths = {"myp2":"/tmp/arena-coding-uploads/MYP2 1st Term examination B.pdf",
         "myp3":"/tmp/arena-coding-uploads/Grade_8_MYP_3_Mathematics_Marking_Scheme_Version_B.pdf",
         "myp4":"/tmp/arena-coding-uploads/Grade_9_MYP_4_Mathematics_Summative_Assessment_Version_B.pdf",
         "myp5":"/tmp/arena-coding-uploads/Grade_10_MYP_5_Mathematics_Summative_Assessment.pdf"}
doc = pymupdf.open(paths[key])
page = doc[page_no-1]
d = page.get_text("dict")
for b in d["blocks"]:
    if b["type"] != 0: 
        print(f"[IMAGE {b['bbox']}]"); continue
    for l in b["lines"]:
        txt = "".join(s["text"] for s in l["spans"]).strip()
        if not txt: continue
        x0,y0,x1,y1 = l["bbox"]
        print(f"{x0:7.1f},{y0:7.1f} -> {x1:7.1f},{y1:7.1f} | {txt}")
