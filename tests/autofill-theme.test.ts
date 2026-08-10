import { readFileSync } from "fs";
import { join } from "path";

/*
 * Autofill styling cannot be asserted from a rendered page: a browser will not
 * autofill under automation, by design, so there is nothing to measure. What
 * can be asserted is that the rule uses a technique that does something.
 *
 * The bug this follows: the sign-in fields came back solid white with grey text
 * on a dark glass card. A rule for it was already present and had been for
 * months -- it painted an inset box-shadow of `transparent` over Chrome's
 * imposed background. An inset shadow covers the background only if it is
 * opaque; `transparent` covers nothing. So the fix was there, looked right in
 * review, and had never once worked.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const FILES = ["src/app/globals.css", "src/app/smarthome/Login.tsx"];

describe("autofilled fields keep the theme", () => {
  it("never covers the imposed background with something transparent", () => {
    for (const f of FILES) {
      const css = read(f);
      // `0 0 0 1000px transparent inset` and friends: an inset shadow whose
      // colour is transparent paints nothing.
      expect(css).not.toMatch(/box-shadow:[^;]*\btransparent\b[^;]*inset/i);
      expect(css).not.toMatch(/box-shadow:[^;]*inset[^;]*\btransparent\b/i);
    }
  });

  it("clips the imposed background to the glyphs, which is what removes it", () => {
    const css = read("src/app/globals.css");
    const block = css.slice(css.indexOf("input:-webkit-autofill"));
    expect(block).toMatch(/-webkit-background-clip:\s*text/);
    expect(block).toMatch(/background-clip:\s*text/);
  });

  it("takes its colours from the theme rather than pinning one", () => {
    const css = read("src/app/globals.css");
    const start = css.indexOf("input:-webkit-autofill");
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toMatch(/-webkit-text-fill-color:\s*var\(--text-primary\)/);
    expect(block).toMatch(/caret-color:\s*var\(--text-primary\)/);
  });

  it("covers every field a browser will fill, not only the email box", () => {
    const css = read("src/app/globals.css");
    const start = css.indexOf("input:-webkit-autofill");
    const selectors = css.slice(start, css.indexOf("{", start));
    for (const s of ["input:-webkit-autofill:hover", "input:-webkit-autofill:focus", "textarea:-webkit-autofill", "select:-webkit-autofill"]) {
      expect(selectors).toContain(s);
    }
  });
});
