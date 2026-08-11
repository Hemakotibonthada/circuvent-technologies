import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * A modal has to be readable.
 *
 * Glass draws its cards at a few percent of white over the canvas, which is
 * exactly right for a tile sitting on content and exactly wrong for a dialog:
 * with `card` as its fill, the "Customise home" sheet was genuinely
 * see-through, with the home screen legible through its text.
 *
 * The thing that hid this is that the sheet also stacks a BlurView, so on iOS
 * — where the blur is real and strong — it looks fine. Android's blur is weak
 * where it works at all, so the same code produces a transparent panel there.
 * Relying on a platform effect for legibility is the bug; the opaque base is
 * the fix.
 *
 * `c.overlay` is that base: near-opaque under glass, and the ordinary card
 * everywhere else.
 */
const SRC = join(__dirname, "..", "mobile", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);

describe("modal surfaces are opaque enough to read", () => {
  it("the sheet paints an opaque base before it blurs", () => {
    const overlays = readFileSync(join(SRC, "overlays.tsx"), "utf8");
    const sheetStart = overlays.indexOf("c.isGlass ?");
    expect(sheetStart).toBeGreaterThan(-1);

    /*
     * Order matters as much as presence: the opaque base has to be underneath,
     * so it must appear before the BlurView in the tree.
     */
    const baseAt = overlays.indexOf("backgroundColor: c.overlay");
    const blurAt = overlays.indexOf("<BlurView");
    expect(baseAt).toBeGreaterThan(-1);
    expect(blurAt).toBeGreaterThan(-1);
    expect(baseAt).toBeLessThan(blurAt);
  });

  /*
   * Any style named like a modal card must not use the translucent card fill.
   * This is a narrow check on purpose — it catches the specific mistake that
   * was made, without trying to guess which of a hundred Views is a dialog.
   */
  it("no modal card is filled with the translucent card colour", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const line of src.split("\n")) {
        if (/modal\w*(Card|Box|Panel|Sheet)\s*:/i.test(line) && /backgroundColor:\s*c\.card\b/.test(line)) {
          offenders.push(`${f.replace(SRC, "")}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every theme defines an overlay colour", () => {
    const theme = readFileSync(join(SRC, "theme.ts"), "utf8");
    expect(theme).toContain("overlay:");
    /* Non-glass themes fall back to the card, which is already opaque. */
    expect(theme).toMatch(/overlay:\s*p\.isGlass\s*\?/);
  });
});

describe("glass cards stay translucent", () => {
  /*
   * The counterpart: fixing the modal must not make ordinary cards opaque, or
   * the theme stops being glass at all.
   */
  it("the card fill is still a few percent of white", () => {
    const theme = readFileSync(join(SRC, "theme.ts"), "utf8");
    expect(theme).toContain('card: "rgba(255,255,255,0.045)"');
  });
});
