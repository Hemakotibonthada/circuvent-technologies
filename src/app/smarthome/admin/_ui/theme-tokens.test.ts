/**
 * The admin console has to follow the theme the operator chose.
 *
 * WHAT WENT WRONG
 *
 * /smarthome/admin painted its own chrome inside a styled-jsx block: #070b14
 * for the page, rgba(9,13,22,.92) for the sidebar, #e2e8f0 for text. That was
 * consistent while the console was dark-only.
 *
 * theme.tsx carries a light-scheme shim that remaps Tailwind's dark-first
 * neutrals by class name — `.text-white` becomes `var(--cv-text)` — so the
 * ~1,100 hardcoded utilities under /smarthome stay legible on a light scheme
 * without editing every file. It reaches class names. It cannot reach a
 * literal inside a styled-jsx template, and it cannot reach an inline style.
 *
 * So on any light scheme the admin's text was remapped to near-black while its
 * surfaces stayed near-black: measured at 1.07:1 against rgb(7,11,20). Not
 * "hard to read" — invisible. Every heading, the sidebar brand, the KPI
 * figures.
 *
 * WHY THIS TEST IS STATIC
 *
 * The real check is scripts/audit-admin-theme.js, which drives a browser
 * through six theme combinations and fourteen routes and measures contrast
 * against what is actually painted. That needs a running dev server, so it
 * cannot gate a commit.
 *
 * This does gate one: the chrome is defined in exactly two places, and both
 * must express colour as tokens. It is narrow on purpose — it does not police
 * accent hues, chart palettes or one-off tints, only the structural surfaces
 * and foregrounds that have to move with the scheme.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ADMIN = join(process.cwd(), "src", "app", "smarthome", "admin");
const shell = readFileSync(join(ADMIN, "AdminShell.tsx"), "utf8");
const ui = readFileSync(join(ADMIN, "_ui", "index.tsx"), "utf8");

/** The styled-jsx block that defines every admin surface. */
function shellStyles(): string {
  const start = shell.indexOf("function ShellStyles");
  expect(start).toBeGreaterThan(-1);
  const open = shell.indexOf("`", start);
  const close = shell.indexOf("`", open + 1);
  expect(close).toBeGreaterThan(open);
  return shell.slice(open + 1, close);
}

/** Declarations of a property, with comments stripped so prose cannot match. */
function declarations(css: string, prop: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare))) out.push(m[1].trim());
  return out;
}

describe("the admin chrome is expressed in theme tokens", () => {
  const css = shellStyles();

  it("never states a structural colour as a literal", () => {
    /*
     * `color:` and `background:` are the two that decide legibility. A literal
     * in either is a value the light-scheme shim cannot reach, which is
     * precisely how the surfaces and the text ended up disagreeing.
     *
     * The accent wash on .ad-root is the deliberate exception: a decoration
     * that reads on either scheme. "Decoration" is defined by alpha, not by
     * intent — anything at 0.15 or above is painting a surface, whatever it is
     * called. The sidebar's old rgba(9,13,22,0.92) is opaque in every way that
     * matters and has to fail this.
     */
    const DECORATIVE_ALPHA = 0.15;
    const suspect: string[] = [];
    for (const prop of ["color", "background", "background-color", "border-color"]) {
      for (const value of declarations(css, prop)) {
        const hasHex = /#[0-9a-f]{3,8}\b/i.test(value);
        const named = /\b(white|black)\b/i.test(value);
        const opaqueRgb = (value.match(/rgba?\([^)]*\)/gi) ?? []).some((c) => {
          const alpha = /rgba\([^)]*,\s*([0-9.]+)\s*\)/i.exec(c)?.[1];
          return alpha === undefined || Number(alpha) >= DECORATIVE_ALPHA;
        });
        if (hasHex || opaqueRgb || named) suspect.push(`${prop}: ${value.slice(0, 70)}`);
      }
    }
    // #fff on the primary button sits on an accent gradient, where white is
    // correct in every scheme. Anything else has to be a token.
    const allowed = suspect.filter((s) => !/^color:\s*#fff\b/i.test(s));
    expect(allowed).toEqual([]);
  });

  it("takes the page colour from the theme instead of repainting it", () => {
    // .ad-root used to end its background list with #070b14, which meant this
    // file had to know what every scheme's page colour was. It never will.
    //
    // Scoped to the background declaration rather than the whole block: the
    // block legitimately holds the --ad-fg-* ramp, whose dark values are hexes
    // by design and are overridden under .cv-light.
    const rootBlock = /\.ad-root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    expect(rootBlock).toMatch(/color:\s*var\(--cv-text\)/);
    const bg = declarations(rootBlock, "background")[0] ?? "";
    expect(bg).not.toBe("");
    expect(bg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // Only translucent decoration, so the theme's own background shows through.
    for (const rgba of bg.match(/rgba?\([^)]*\)/gi) ?? []) {
      expect(rgba).toMatch(/,\s*0?\.\d+\s*\)/);
    }
  });

  it("draws its surfaces from the console's own tokens", () => {
    for (const [selector, token] of [
      [".ad-sidebar", "--cv-card"],
      [".ad-card", "--cv-card"],
      [".ad-muted", "--cv-muted"],
      [".ad-input", "--cv-input-bg"],
    ] as const) {
      const block = new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(css)?.[1] ?? "";
      expect(block).toContain(`var(${token})`);
    }
  });

  it("defines the status ramp for both schemes", () => {
    // The tones are applied as inline styles, so the class-based shim in
    // theme.tsx cannot reach them. They need their own light overrides or the
    // whole 300/400 ramp stays pale-on-pale.
    expect(css).toMatch(/--ad-fg-slate:/);
    expect(css).toMatch(/\.cv-light \.ad-root\s*\{/);
    const light = /\.cv-light \.ad-root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    for (const tone of ["cyan", "green", "amber", "red", "blue", "violet", "slate"]) {
      expect(light).toContain(`--ad-fg-${tone}:`);
    }
  });
});

describe("the shared status tones resolve through variables", () => {
  it("holds no fixed foreground hex", () => {
    const table = /export const TONE[\s\S]*?\n\};/.exec(ui)?.[0] ?? "";
    expect(table).not.toBe("");
    const foregrounds = [...table.matchAll(/fg:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(foregrounds.length).toBeGreaterThanOrEqual(8);
    for (const fg of foregrounds) {
      // A hex here is invisible to the light shim and stays at the 300/400
      // level on a white card — `slate` measured 2.1:1 that way.
      expect(fg).toMatch(/^var\(--ad-fg-[a-z]+\)$/);
    }
  });
});
