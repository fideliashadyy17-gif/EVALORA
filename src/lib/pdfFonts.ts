import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

/**
 * Embedded text faces for the candidate paper.
 *
 * pdf-lib's standard faces (Helvetica &co.) are limited to WinAnsi, so every
 * mathematical glyph had to be flattened to ASCII before printing — `≤` became
 * `<=`, `√` became `sqrt`, Italian super/subscripts disappeared. That is why the
 * paper read like source code rather than a mathematics paper.
 *
 * DejaVu Serif carries 3,447 glyphs including the Unicode mathematical
 * operators, Greek letters and the super/subscript blocks, and has a true italic
 * and bold. Embedding it lets the engine print `uₙ = 2n² − 7n + 9` as written.
 * DejaVu Sans is embedded too, for tables and diagram labels where a sans face
 * reads better.
 *
 * The fonts are shipped with the repository (see LICENSE.txt beside them), so a
 * render never depends on the host having them installed.
 */

export interface PaperFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
}

const FONT_DIR = "pdf-fonts";

/** Resolve the vendored font directory from either the source tree or a build. */
function fontDirCandidates(): string[] {
  return [
    join(process.cwd(), "src", "lib", FONT_DIR),
    join(__dirname ?? "", FONT_DIR),
    join(process.cwd(), FONT_DIR),
  ];
}

const fileCache = new Map<string, Promise<Buffer | null>>();

function readFontFile(name: string): Promise<Buffer | null> {
  const cached = fileCache.get(name);
  if (cached) return cached;
  const promise = (async () => {
    for (const dir of fontDirCandidates()) {
      try {
        return await readFile(join(dir, name));
      } catch {
        /* try the next location */
      }
    }
    return null;
  })();
  fileCache.set(name, promise);
  return promise;
}

/**
 * Embed the paper fonts into `pdf`.
 *
 * If the vendored faces cannot be read (a stripped deployment, for instance) the
 * engine falls back to the standard faces rather than failing the render — a
 * paper with flat ASCII maths is worse than one with real notation, but far
 * better than no paper at all.
 */
export async function embedPaperFonts(pdf: PDFDocument): Promise<PaperFonts> {
  pdf.registerFontkit(fontkit);

  const [serif, serifBold, serifItalic, sans] = await Promise.all([
    readFontFile("DejaVuSerif.ttf"),
    readFontFile("DejaVuSerif-Bold.ttf"),
    readFontFile("DejaVuSerif-Italic.ttf"),
    readFontFile("DejaVuSans.ttf"),
  ]);

  const standard = async () => {
    const { StandardFonts } = await import("pdf-lib");
    const [regular, bold, italic, mono] = await Promise.all([
      pdf.embedFont(StandardFonts.Helvetica),
      pdf.embedFont(StandardFonts.HelveticaBold),
      pdf.embedFont(StandardFonts.HelveticaOblique),
      pdf.embedFont(StandardFonts.Courier),
    ]);
    return { regular, bold, italic, mono };
  };

  if (!serif || !serifBold || !serifItalic) return standard();

  const subset = true;
  const [regular, bold, italic, mono] = await Promise.all([
    pdf.embedFont(serif, { subset }),
    pdf.embedFont(serifBold, { subset }),
    pdf.embedFont(serifItalic, { subset }),
    sans ? pdf.embedFont(sans, { subset }) : pdf.embedFont(serif, { subset }),
  ]);

  return { regular, bold, italic, mono };
}
