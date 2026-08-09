import { readFileSync } from "fs";
import { join } from "path";

/*
 * The brand accent is not a text colour.
 *
 * --accent-cyan (#0891b2) is 3.68:1 on white. That is fine for a border, an
 * icon, or 24px display type, and wrong for 12px body copy. It was being used
 * for the Privacy Policy link in the cookie banner, which renders white in
 * every theme on every page — one element that produced 283 of the 297
 * contrast findings in the whole application.
 *
 * The fix was --accent-cyan-text. This test exists so that token cannot drift
 * lighter, and so the banner cannot quietly go back to the brand accent.
 */

const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

/** The two lightest surfaces accent text actually lands on. */
const WHITE: RGB = [255, 255, 255];
const LIGHTEST_CARD: RGB = [230, 233, 242]; // #e6e9f2, the neo-light card

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const x = luminance(a) + 0.05;
  const y = luminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`token --${name} not found as a literal hex in globals.css`);
  return m[1];
}

describe("accent text tokens", () => {
  it("defines --accent-cyan-text", () => {
    expect(() => token("accent-cyan-text")).not.toThrow();
  });

  it.each([
    ["white", WHITE],
    ["the lightest card", LIGHTEST_CARD],
  ])("--accent-cyan-text clears AA on %s", (_label, bg) => {
    const ratio = contrast(hexToRgb(token("accent-cyan-text")), bg as RGB);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("--accent-cyan is still the lighter brand colour, and so is still unfit for body text", () => {
    // Not a bug — documenting why the second token has to exist. If someone
    // ever darkens --accent-cyan enough to pass, this test says so out loud
    // rather than leaving two tokens that mean the same thing.
    const ratio = contrast(hexToRgb(token("accent-cyan")), WHITE);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe("cookie consent", () => {
  const banner = readFileSync(join(root, "src/components/CookieConsent.tsx"), "utf8");

  it("does not colour its link with the raw brand accent", () => {
    // Scoped to links on purpose. The cookie icon on line 57 uses
    // --accent-cyan and should: an icon is a graphic, judged at 3:1, and the
    // brand colour is the point of it. Only text has to clear 4.5:1.
    const links = [...openingTags(banner, "Link"), ...openingTags(banner, "a ")];
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l).not.toMatch(/var\(--accent-cyan\)/);
    }
  });

  it("uses the readable accent instead", () => {
    expect(banner).toMatch(/var\(--accent-cyan-text\)/);
  });

  it("gives every control a 44px touch target", () => {
    const buttons = openingTags(banner, "button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b).toMatch(/min-h-\[44px\]|h-11/);
    }
  });
});

/**
 * Extract opening tags for one element.
 *
 * A regex cannot do this: `<button[\s\S]*?>` stops at the `>` inside
 * `onClick={() => ...}`, so it returns a two-line fragment with no className
 * and the test fails on every button in the file. Track brace and quote depth
 * and only treat `>` as the end of the tag when we are outside both.
 */
function openingTags(source: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}`;
  let i = source.indexOf(open);
  while (i !== -1) {
    let depth = 0;
    let quote: string | null = null;
    let j = i + open.length;
    for (; j < source.length; j++) {
      const c = source[j];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(source.slice(i, j + 1));
    i = source.indexOf(open, j);
  }
  return out;
}
