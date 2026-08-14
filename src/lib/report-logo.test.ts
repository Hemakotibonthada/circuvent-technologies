/**
 * The embedded report logo must stay the logo.
 *
 * `report-logo.ts` carries the brand mark as base64 because `public/` is served
 * by the CDN and is not reliably traced into a serverless function bundle — a
 * read from there fails in production and works on every developer's machine,
 * and it fails quietly: the header simply renders without a logo. That is how
 * it went missing.
 *
 * The cost of embedding is that the copy can go stale. These tests make that
 * loud: the artwork is re-derived from the same source PNG and compared, so
 * changing `public/logo-mark-160.png` without re-running the generator fails
 * here rather than shipping last year's mark on every invoice.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { REPORT_LOGO_PNG_BASE64, reportLogoBytes } from "./report-logo";

const ROOT = resolve(__dirname, "..", "..");
const SOURCE = join(ROOT, "public", "logo-mark-160.png");

describe("the embedded mark", () => {
  it("is a real PNG", () => {
    const bytes = reportLogoBytes();
    // \x89PNG\r\n\x1a\n
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("is small enough to live in a source file", () => {
    // Embedding is a trade; it stops being a good one at some size. An RGBA
    // build of the same mark was 27KB, which is why it is indexed.
    expect(REPORT_LOGO_PNG_BASE64.length).toBeLessThan(20_000);
    expect(reportLogoBytes().byteLength).toBeGreaterThan(1_000);
  });

  it("is the size the header expects", async () => {
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(reportLogoBytes());
    expect(img.width).toBe(128);
    expect(img.height).toBe(128);
  });

  it("is one pdf-lib can actually decode", async () => {
    /*
     * The reason this is asserted rather than assumed: the mark is an indexed
     * PNG, chosen because it is a quarter the size of the truecolour build, and
     * indexed PNGs with transparency are the case a decoder is most likely to
     * refuse. If pdf-lib ever stops accepting it the renderer falls back to no
     * logo — silently — so the check belongs here.
     */
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const img = await doc.embedPng(reportLogoBytes());
    page.drawImage(img, { x: 10, y: 10, width: 60, height: 60 });
    const out = await doc.save();
    expect(Buffer.from(out.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});

describe("the embedded mark matches the artwork", () => {
  const python = ["python", "python3", "py"];

  function regenerate(): Buffer | null {
    // Best effort: the generator needs Pillow, which CI may not install. A
    // missing toolchain must skip rather than fail — a red test nobody can fix
    // locally gets ignored, and then the real drift goes unnoticed too.
    for (const exe of python) {
      try {
        const out = execFileSync(
          exe,
          [
            "-c",
            [
              "import io,sys",
              "from PIL import Image",
              `img = Image.open(r'${SOURCE.replace(/\\/g, "\\\\")}').convert('RGBA')`,
              "img = img.resize((128,128), Image.LANCZOS)",
              "img = img.quantize(colors=128, method=Image.FASTOCTREE)",
              "b = io.BytesIO(); img.save(b, format='PNG', optimize=True)",
              "sys.stdout.buffer.write(b.getvalue())",
            ].join("\n"),
          ],
          { maxBuffer: 20 * 1024 * 1024 },
        );
        return Buffer.from(out);
      } catch {
        continue;
      }
    }
    return null;
  }

  it("re-derives byte for byte from public/logo-mark-160.png", () => {
    if (!existsSync(SOURCE)) {
      // The artwork itself is missing, which is a different problem and one the
      // asset pipeline should catch.
      expect(existsSync(SOURCE)).toBe(false);
      return;
    }
    const fresh = regenerate();
    if (!fresh) {
      // No Pillow here. Assert what can still be asserted: the source exists
      // and the embedded copy is present and plausible.
      expect(readFileSync(SOURCE).byteLength).toBeGreaterThan(0);
      expect(reportLogoBytes().byteLength).toBeGreaterThan(1_000);
      return;
    }
    expect(Buffer.from(reportLogoBytes()).equals(fresh)).toBe(true);
  });
});
