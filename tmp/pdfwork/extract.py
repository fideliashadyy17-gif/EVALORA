import pymupdf, os, sys, json
files = {
 "myp2": "/tmp/arena-coding-uploads/MYP2 1st Term examination B.pdf",
 "myp3": "/tmp/arena-coding-uploads/Grade_8_MYP_3_Mathematics_Marking_Scheme_Version_B.pdf",
 "myp4": "/tmp/arena-coding-uploads/Grade_9_MYP_4_Mathematics_Summative_Assessment_Version_B.pdf",
 "myp5": "/tmp/arena-coding-uploads/Grade_10_MYP_5_Mathematics_Summative_Assessment.pdf",
}
for key, path in files.items():
    doc = pymupdf.open(path)
    print("="*80)
    print(key, path, "pages:", doc.page_count)
    os.makedirs(key, exist_ok=True)
    for i, page in enumerate(doc):
        txt = page.get_text("text")
        with open(f"{key}/page_{i+1:02d}.txt", "w") as f:
            f.write(txt)
        with open(f"{key}/all.txt", "a") as f:
            f.write(f"\n\n===== PAGE {i+1} =====\n{txt}")
    print("images per page:", [len(p.get_images(full=True)) for p in doc])
    # drawings count
    print("drawings per page:", [len(p.get_drawings()) for p in doc])
