import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Shell renders overlays with early returns, and defines its navigation
 * helpers as `const` arrow functions in the same body. Order matters, and
 * nothing enforces it:
 *
 *   if (overlay?.kind === "search") return <CommandPalette
 *     onOpenAutomate={(sg) => openAutomate(sg)} />;   // captures the binding
 *   ...
 *   const openAutomate = ...                          // never reached
 *
 * The closure is created happily — nothing evaluates `openAutomate` until
 * somebody taps. So opening search worked, the results rendered, and tapping
 * a room crashed the app with "undefined is not a function". It typechecks,
 * because as far as TypeScript is concerned the binding exists.
 *
 * This is the only place that can catch it.
 */
const shell = readFileSync(
  join(__dirname, "..", "mobile", "src", "screens", "Shell.tsx"),
  "utf8"
);

describe("Shell defines navigation helpers before it returns early", () => {
  /*
   * The first early return is the deadline: any helper declared after it does
   * not exist in a render that takes one of the overlay branches.
   */
  const firstEarlyReturn = shell.indexOf("if (overlay?.kind");

  it("has early returns to guard against", () => {
    expect(firstEarlyReturn).toBeGreaterThan(-1);
  });

  it.each([["openControl"], ["openAutomate"]])(
    "%s is declared above the first overlay return",
    (name) => {
      const declared = shell.indexOf(`const ${name} =`);
      expect(declared).toBeGreaterThan(-1);
      expect(declared).toBeLessThan(firstEarlyReturn);
    }
  );

  /*
   * Declaring them twice would also "pass" the check above while shadowing in
   * a way that is pure confusion — that is what the first attempt at this fix
   * left behind.
   */
  it.each([["openControl"], ["openAutomate"]])("%s is declared once", (name) => {
    const hits = shell.split(`const ${name} =`).length - 1;
    expect(hits).toBe(1);
  });
});

describe("searching for a room opens that room", () => {
  const palette = readFileSync(
    join(__dirname, "..", "mobile", "src", "screens", "CommandPalette.tsx"),
    "utf8"
  );
  const rooms = readFileSync(
    join(__dirname, "..", "mobile", "src", "screens", "Rooms.tsx"),
    "utf8"
  );

  /*
   * Tapping a room in the results used to switch to the Rooms tab and stop
   * there, leaving the user to find the room they had just named. The room has
   * to travel with the navigation.
   */
  it("passes the room name from the search result", () => {
    expect(palette).toMatch(/onOpenAutomate\("rooms",\s*r\.name\)/);
  });

  it("Rooms accepts a room to open on arrival", () => {
    expect(rooms).toContain("initialRoom");
    expect(rooms).toMatch(/useState<string \| null>\(initialRoom \?\? null\)/);
  });
});
