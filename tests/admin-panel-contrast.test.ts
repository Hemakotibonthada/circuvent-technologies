/**
 * @jest-environment node
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * The admin console is light and themeable. Tailwind's slate scale is not:
 * `text-slate-100` is near-white, which is correct on a dark console and
 * invisible on this one.
 *
 * The reliability panels shipped with the whole slate palette baked in, so the
 * incident queue rendered white titles on a white card. It typechecked, every
 * test passed, the data was correct, and the panel was unusable — the only way
 * it was found was rendering the page and looking at it.
 *
 * These are the cheap version of looking.
 */
const ADMIN = join(__dirname, "..", "src", "app", "admin");

const panels = readdirSync(ADMIN).filter((f) => f.endsWith("Panel.tsx"));

/*
 * Light greys used as *text* on a light surface. The dark end of the scale is
 * fine — text-slate-900 on white is readable — so this only catches the values
 * that cannot work.
 */
const UNREADABLE_TEXT = /\btext-(?:slate|gray|zinc|neutral)-(?:100|200|300|400)\b/;

/* Near-black surfaces, which swallow the theme's own dark text. */
const DARK_SURFACE = /\bbg-(?:slate|gray|zinc|neutral)-(?:800|900|950)\b/;

describe("admin panels follow the console theme", () => {
  it("has panels to check", () => {
    expect(panels.length).toBeGreaterThan(10);
  });

  it.each(panels)("%s uses no near-white text", (file) => {
    const src = readFileSync(join(ADMIN, file), "utf8");
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((l) => UNREADABLE_TEXT.test(l.line))
      .map((l) => `${file}:${l.n} ${l.line.slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it.each(panels)("%s uses no near-black surface", (file) => {
    const src = readFileSync(join(ADMIN, file), "utf8");
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((l) => DARK_SURFACE.test(l.line))
      .map((l) => `${file}:${l.n} ${l.line.slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});

describe("the utilities the panels were converted to actually exist", () => {
  /*
   * The conversion swapped class names; if the stylesheet never defined them,
   * every one of those elements would silently fall back to inheriting — which
   * looks fine on some backgrounds and not others, and would be a worse bug
   * than the one being fixed.
   */
  const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");

  it.each([
    ["cv-text-primary"],
    ["cv-text-secondary"],
    ["cv-text-muted"],
    ["cv-surface"],
    ["cv-surface-alt"],
    ["cv-border"],
    ["cv-hover"],
    ["cv-hover-h"],
  ])("%s is defined", (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}\\s*[:{]`));
  });

  it("binds them to the theme tokens rather than to fixed colours", () => {
    const block = css.slice(css.indexOf(".cv-text-primary"));
    expect(block).toContain("var(--text-primary)");
    expect(block).toContain("var(--bg-surface)");
    expect(block).toContain("var(--border-primary)");
  });
});

describe("the reliability panels specifically", () => {
  it.each([["IcmPanel.tsx"], ["AppInsightsPanel.tsx"]])("%s takes its colours from the theme", (file) => {
    const src = readFileSync(join(ADMIN, file), "utf8");
    expect(src).toContain("cv-text-primary");
    expect(src).toContain("cv-surface");
    /* Severity and status colours stay literal on purpose — red for Sev0 must
       be red in every theme — but the body text must not. */
    expect(UNREADABLE_TEXT.test(src)).toBe(false);
  });

  /*
   * A chip with a dark literal fill must carry a light literal label.
   *
   * The console's text tokens are dark, because the page is light — so pairing
   * a hardcoded dark background with `var(--text-…)` produces dark-on-dark.
   * A bulk conversion did exactly that and the Sev4 chip rendered as an
   * unlabelled blob; it typechecked and passed every test at the time.
   */
  it("never puts a theme text colour on a hardcoded dark fill", () => {
    for (const file of ["IcmPanel.tsx", "AppInsightsPanel.tsx"]) {
      const src = readFileSync(join(ADMIN, file), "utf8");
      /* A dark hex or a heavy dark rgba immediately followed by a var() text. */
      const bad = /(?:bg|background):\s*(?:"#[0-3][0-9a-f]{5}"|"rgba\(\s*\d{1,2},\s*\d{1,3},\s*\d{1,3},\s*\.[5-9]\d*\)")[^\n]{0,60}\n?[^\n]{0,40}(?:fg|color):\s*"var\(--text/;
      expect({ file, matched: bad.test(src) }).toEqual({ file, matched: false });
    }
  });

  it("gives every severity a light label on its dark chip", () => {
    const src = readFileSync(join(ADMIN, "IcmPanel.tsx"), "utf8");
    const block = src.slice(src.indexOf("SEV_STYLE"), src.indexOf("SLA_STYLE"));
    const rows = [...block.matchAll(/(\d):\s*\{\s*bg:\s*"(#[0-9a-f]{6})",\s*fg:\s*"(#[0-9a-f]{6})"/g)];
    expect(rows).toHaveLength(5);

    /* Crude luminance is enough to catch dark-on-dark. */
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    };
    for (const [, sev, bg, fg] of rows) {
      expect({ sev, readable: lum(fg) - lum(bg) > 0.35 }).toEqual({ sev, readable: true });
    }
  });
});
