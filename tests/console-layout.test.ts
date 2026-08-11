import {
  APP_LAYOUT_KEY,
  CONSOLE_LAYOUT_KEY,
  CONSOLE_SECTIONS,
  CONSOLE_SECTION_META,
  DEFAULT_CONSOLE_LAYOUT,
  isDefaultConsoleLayout,
  mergeConsoleLayout,
  moveConsole,
  readConsoleLayout,
  resolveConsoleLayout,
  setConsoleHidden,
  visibleConsoleSections,
  type ConsoleLayout,
  type ConsoleSection,
} from "@/lib/console-layout";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCOPES } from "@/lib/user-prefs";

describe("the two dashboards share a scope without eating each other", () => {
  /*
   * The failure this prevents: both platforms store under `dashboard`. A writer
   * that PUTs its own layout as the whole document deletes the other's. The
   * symptom is "my phone's home screen reset itself", reported by someone who
   * was using a browser at the time — so the evidence points at the wrong
   * device and the cause is invisible.
   */
  it("keeps the app's layout when the console saves", () => {
    const shared = {
      [APP_LAYOUT_KEY]: { order: ["devices", "power"], hidden: ["weather"] },
    };
    const next = mergeConsoleLayout(shared, DEFAULT_CONSOLE_LAYOUT);

    expect(next[APP_LAYOUT_KEY]).toEqual(shared[APP_LAYOUT_KEY]);
    expect(next[CONSOLE_LAYOUT_KEY]).toEqual(DEFAULT_CONSOLE_LAYOUT);
  });

  it("keeps anything else it does not recognise", () => {
    const shared = { [APP_LAYOUT_KEY]: { order: [] }, somethingLater: { a: 1 } };
    const next = mergeConsoleLayout(shared, DEFAULT_CONSOLE_LAYOUT);
    expect(next.somethingLater).toEqual({ a: 1 });
  });

  it("copes with an empty or malformed document", () => {
    expect(mergeConsoleLayout(undefined, DEFAULT_CONSOLE_LAYOUT)[CONSOLE_LAYOUT_KEY]).toEqual(DEFAULT_CONSOLE_LAYOUT);
    expect(mergeConsoleLayout("nonsense", DEFAULT_CONSOLE_LAYOUT)[CONSOLE_LAYOUT_KEY]).toEqual(DEFAULT_CONSOLE_LAYOUT);
  });

  it("does not mutate the document it was handed", () => {
    const shared = { [APP_LAYOUT_KEY]: { order: ["power"] } };
    const copy = JSON.parse(JSON.stringify(shared));
    mergeConsoleLayout(shared, DEFAULT_CONSOLE_LAYOUT);
    expect(shared).toEqual(copy);
  });

  it("reads only its own half", () => {
    const shared = {
      [APP_LAYOUT_KEY]: { order: ["devices"], hidden: [] },
      [CONSOLE_LAYOUT_KEY]: { order: ["latency", "kpis"], hidden: ["scenes"] },
    };
    const mine = readConsoleLayout(shared);
    expect(mine.order.slice(0, 2)).toEqual(["latency", "kpis"]);
    expect(mine.hidden).toEqual(["scenes"]);
  });

  /*
   * The app's section names are not console section names. Reading the app's
   * half by mistake would resolve to "nothing recognised" and silently produce
   * the default — which looks like a reset rather than a bug.
   */
  it("does not mistake the app's layout for its own", () => {
    const appOnly = { [APP_LAYOUT_KEY]: { order: ["favorites", "quickActions"], hidden: [] } };
    expect(readConsoleLayout(appOnly)).toEqual(resolveConsoleLayout(undefined));
  });

  it("uses a scope the site actually has", () => {
    expect(SCOPES).toContain("dashboard");
  });

  /*
   * Both applications have to agree on the key names, and they are written out
   * separately in each. This is the only place that can catch a rename.
   */
  it("agrees with the app on the key names", () => {
    const store = readFileSync(
      join(__dirname, "..", "mobile", "src", "home-layout-store.ts"),
      "utf8"
    );
    expect(store).toContain(`LAYOUT_SCOPE = "dashboard"`);
    expect(store).toContain(`LAYOUT_KEY = "${APP_LAYOUT_KEY}"`);
    /* And that it merges rather than overwriting. */
    expect(store).toContain("...siblings");
  });
});

describe("resolving a stored console layout", () => {
  it("gives a fresh console every panel in order", () => {
    expect(resolveConsoleLayout(undefined).order).toEqual([...CONSOLE_SECTIONS]);
  });

  it.each([[null], ["nope"], [7], [{ order: {} }]])("falls back on %p", (bad) => {
    expect(resolveConsoleLayout(bad).order).toEqual([...CONSOLE_SECTIONS]);
  });

  it("appends panels the stored order predates", () => {
    const l = resolveConsoleLayout({ order: ["latency"], hidden: [] });
    expect(l.order[0]).toBe("latency");
    expect(new Set(l.order)).toEqual(new Set(CONSOLE_SECTIONS));
  });

  it("drops panels it no longer has", () => {
    const l = resolveConsoleLayout({ order: ["kpis", "gone"], hidden: ["alsoGone"] });
    expect(l.order).not.toContain("gone");
    expect(l.hidden).not.toContain("alsoGone");
  });

  it("collapses duplicates", () => {
    const l = resolveConsoleLayout({ order: ["kpis", "kpis", "kpis"], hidden: [] });
    expect(l.order.filter((k) => k === "kpis")).toHaveLength(1);
  });

  it("is stable across two passes", () => {
    const once = resolveConsoleLayout({ order: ["rooms", "kpis"], hidden: ["latency"] });
    expect(resolveConsoleLayout(once)).toEqual(once);
  });
});

describe("required panels", () => {
  it("refuses to hide live control", () => {
    const l = setConsoleHidden(DEFAULT_CONSOLE_LAYOUT, "control", true);
    expect(visibleConsoleSections(l)).toContain("control");
  });

  it("un-hides it even if it was stored as hidden", () => {
    const l = resolveConsoleLayout({ order: [...CONSOLE_SECTIONS], hidden: ["control", "latency"] });
    expect(l.hidden).toEqual(["latency"]);
  });

  it("locks exactly one panel", () => {
    expect(CONSOLE_SECTIONS.filter((k) => CONSOLE_SECTION_META[k].required)).toEqual(["control"]);
  });
});

describe("reordering panels", () => {
  it("moves up and back down", () => {
    const [first, second] = DEFAULT_CONSOLE_LAYOUT.order;
    const up = moveConsole(DEFAULT_CONSOLE_LAYOUT, second, -1);
    expect(up.order[0]).toBe(second);
    expect(moveConsole(up, second, 1).order).toEqual(DEFAULT_CONSOLE_LAYOUT.order);
  });

  it("does not wrap at the ends", () => {
    const order = DEFAULT_CONSOLE_LAYOUT.order;
    expect(moveConsole(DEFAULT_CONSOLE_LAYOUT, order[0], -1).order).toEqual(order);
    expect(moveConsole(DEFAULT_CONSOLE_LAYOUT, order[order.length - 1], 1).order).toEqual(order);
  });

  it("never drops or duplicates while shuffling", () => {
    let l: ConsoleLayout = DEFAULT_CONSOLE_LAYOUT;
    for (let i = 0; i < 40; i++) {
      l = moveConsole(l, CONSOLE_SECTIONS[i % CONSOLE_SECTIONS.length], i % 2 ? -1 : 1);
    }
    expect(new Set(l.order)).toEqual(new Set(CONSOLE_SECTIONS));
    expect(l.order).toHaveLength(CONSOLE_SECTIONS.length);
  });

  it("ignores an unknown key", () => {
    expect(moveConsole(DEFAULT_CONSOLE_LAYOUT, "atlantis" as ConsoleSection, 1).order).toEqual(
      DEFAULT_CONSOLE_LAYOUT.order
    );
  });
});

describe("console section metadata", () => {
  it("describes every panel and nothing else", () => {
    expect(Object.keys(CONSOLE_SECTION_META).sort()).toEqual([...CONSOLE_SECTIONS].sort());
    for (const k of CONSOLE_SECTIONS) {
      expect(CONSOLE_SECTION_META[k].label.length).toBeGreaterThan(0);
      expect(CONSOLE_SECTION_META[k].hint.length).toBeGreaterThan(0);
    }
  });

  it("knows when it is untouched", () => {
    expect(isDefaultConsoleLayout(DEFAULT_CONSOLE_LAYOUT)).toBe(true);
    expect(isDefaultConsoleLayout(setConsoleHidden(DEFAULT_CONSOLE_LAYOUT, "latency", true))).toBe(false);
  });
});
