/**
 * Generate print-ready PNG companions for the WebP brand assets in `public/`.
 *
 * Why this exists
 * ---------------
 * Candidate-paper PDFs embed the administering school's own logo. `pdf-lib` can
 * only embed PNG and JPEG, while organisation logos in this project are stored
 * as WebP (`/brand/oak-international-school-logo.webp`). The PDF engine
 * transcodes WebP at request time with `sharp` when it is available, but on a
 * serverless host that native module can be pruned from the bundle. If it were
 * the only route, the logo would silently vanish from official student records
 * again -- the exact failure this work set out to fix.
 *
 * So each WebP gets a committed PNG sibling. `tryEmbedImage()` falls back to it
 * whenever a WebP cannot be transcoded, which keeps the logo deterministic
 * without adding a runtime dependency.
 *
 * The PNGs are downscaled to print resolution (the logo is drawn at most ~40pt
 * high) so the repository does not carry multi-megapixel copies.
 *
 * Run: node scripts/build-logo-pngs.mjs
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const BRAND_DIR = path.resolve("public/brand");
const TARGET_WIDTH = 600; // ~15x the printed height (40pt) — well beyond print resolution

async function main() {
  const { default: sharp } = await import("sharp");
  const entries = await readdir(BRAND_DIR);
  const webps = entries.filter((name) => name.toLowerCase().endsWith(".webp"));
  if (webps.length === 0) {
    console.log("No WebP brand assets found; nothing to do.");
    return;
  }

  let written = 0;
  for (const webp of webps) {
    const source = path.join(BRAND_DIR, webp);
    const target = path.join(BRAND_DIR, webp.replace(/\.webp$/i, ".png"));

    let targetExists = false;
    try {
      const info = await stat(target);
      targetExists = info.size > 0;
    } catch {
      targetExists = false;
    }

    // Refresh when the source is newer than the PNG, so edits are never stale.
    if (targetExists) {
      const [src, dst] = await Promise.all([stat(source), stat(target)]);
      if (dst.mtimeMs >= src.mtimeMs) {
        console.log(`  ok    ${webp} -> ${path.basename(target)} (up to date)`);
        continue;
      }
    }

    const png = await sharp(source)
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(target, png);
    written += 1;
    console.log(`  wrote ${webp} -> ${path.basename(target)} (${Math.round(png.byteLength / 1024)} KB)`);
  }

  console.log(`\n${written} PNG companion(s) written, ${webps.length} WebP asset(s) covered.`);
}

await main();
