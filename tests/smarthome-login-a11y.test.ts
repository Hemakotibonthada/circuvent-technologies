import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every field on the console sign-in must have a real accessible name.
 *
 * A placeholder is not one. Screen readers treat it inconsistently, and it
 * disappears the moment somebody starts typing — so the field loses its
 * identity exactly when a person is checking what they entered. The page had
 * shipped with `Email` and `Password` identified by placeholder alone, and
 * nothing anywhere reported it: it renders correctly, type-checks, and looks
 * completely finished in a screenshot.
 *
 * Scanned from the source rather than asserted field by field, so a field added
 * later is covered without anybody remembering to come back here.
 */

const source = readFileSync(
  join(process.cwd(), "src", "app", "smarthome", "Login.tsx"),
  "utf8"
);

/** Each `<input …>` tag, whatever the attribute order or line breaks. */
function inputTags(text: string): string[] {
  return text.match(/<input\b[\s\S]*?\/>/g) ?? [];
}

describe("console sign-in accessibility", () => {
  const tags = inputTags(source);

  it("finds the inputs, so the scan cannot pass by matching nothing", () => {
    // Without this, a regex that stops matching turns the guard into a no-op
    // that reports success for ever.
    expect(tags.length).toBeGreaterThanOrEqual(5);
  });

  it.each(tags.map((t, i) => [i, t] as const))(
    "input %i has an accessible name, not just a placeholder",
    (_i, tag) => {
      const named = /aria-label(?:ledby)?\s*=/.test(tag);
      // Reported with the tag itself: "input 3 is unnamed" would otherwise send
      // somebody counting inputs down the file.
      expect(named ? "named" : tag.replace(/\s+/g, " ").slice(0, 120)).toBe("named");
    }
  );

  it("still labels the fields visually for everyone else", () => {
    // The names were added without removing the placeholders: the design keeps
    // its floating-label look, and assistive technology gets a real name.
    expect(tags.every((t) => /placeholder\s*=/.test(t))).toBe(true);
  });
});
