import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The app and the console are two applications drawing the same theme.
 *
 * Nothing connects them: the app builds a palette object in TypeScript, the
 * console emits CSS custom properties, and the only thing keeping "glass" the
 * same look in both is somebody remembering to change both. That is exactly how
 * glass ended up as a vivid accent gradient in one and a near-black room in the
 * other, with each looking deliberate on its own.
 *
 * These tests do not compare rendered pixels — they cannot. They check that the
 * handful of decisions that *define* the look are the same numbers on both
 * sides, so a change to one without the other fails here rather than in a
 * screenshot six weeks later.
 *
 * Both sides are read as source rather than imported: the app's theme module
 * pulls in react-native for Platform, which does not run under this test
 * environment. The values being compared are literals in both files, so the
 * text is the thing that matters.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

const webTheme = read("src", "app", "smarthome", "theme.tsx");
const appTheme = read("mobile", "src", "theme.ts");

/** The glass branch of a file that also defines aurora, neo, oled and neon. */
function glassBranch(src: string, endMarker: string): string {
  const start = src.indexOf('if (mode === "glass")');
  if (start < 0) throw new Error("no glass branch found");
  const end = src.indexOf(endMarker, start);
  return src.slice(start, end < 0 ? undefined : end);
}

const web = glassBranch(webTheme, "as React.CSSProperties");
/* The app's glass branch runs to the aurora fallthrough below it. */
const app = glassBranch(appTheme, "// aurora (default)");

describe("glass is the same room in the app and the console", () => {
  /*
   * The canvas. Navy or black is the single biggest decision in the look, and
   * the one that was different between them.
   */
  it("uses the same near-black canvas", () => {
    expect(app).toContain("#0a0a0c");
    expect(web).toContain("#0a0a0c");
  });

  it("uses the same pane fill", () => {
    expect(app).toContain("rgba(255,255,255,0.045)");
    /* CSS drops the leading zero; the value is the same. */
    expect(web).toContain("rgba(255,255,255,.045)");
  });

  it("uses the same hairline border", () => {
    expect(app).toContain("rgba(255,255,255,0.07)");
    expect(web).toContain("rgba(255,255,255,.07)");
  });

  it("uses the same text colour", () => {
    expect(app).toContain("#f7f8fa");
    expect(web).toContain("#f7f8fa");
  });

  /*
   * The ambient lights. These are what stop the black being flat, and their
   * colours are the reason the room reads as lit rather than as switched off.
   */
  it("is lit by the same two lamps", () => {
    expect(appTheme).toContain('warmGlow: "#ff8a3d"');
    expect(appTheme).toContain('coolGlow: "#3d7bff"');
    /* 255,138,61 and 61,123,255 are those two colours in the CSS gradients. */
    expect(web).toContain("rgba(255,138,61");
    expect(web).toContain("rgba(61,123,255");
  });

  /*
   * The specific regression: glass was built from the accent gradient, so the
   * backdrop changed colour with the accent picker and was always the loudest
   * thing on screen.
   */
  it("no longer paints the canvas from the accent", () => {
    expect(web).not.toContain("accent.grad");
    expect(app).not.toContain("a.grad");
  });
});

describe("glass in the light", () => {
  it("is a near-white room, not a coloured one", () => {
    expect(app).toContain("#f0f1f6");
    expect(web).toContain("#f0f1f6");
  });

  /*
   * The old light glass used white borders on a white canvas — invisible, so
   * cards had no edge at all. The border has to be darker than the surface.
   */
  it("has an edge you can see", () => {
    expect(app).toContain("rgba(15,20,35,0.07)");
    expect(web).toContain("rgba(15,20,35,.07)");
  });
});
