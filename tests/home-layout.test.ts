import {
  DEFAULT_LAYOUT,
  HOME_SECTIONS,
  SECTION_META,
  isDefault,
  move,
  resolveLayout,
  setHidden,
  visibleSections,
  type HomeLayout,
  type HomeSection,
} from "../mobile/src/home-layout";

/*
 * A stored layout outlives the code that wrote it.
 *
 * Someone arranges their home screen, then updates the app three times. The
 * value in their account was written by a release that had different sections,
 * and it is read while the home screen is rendering — so "throw on unexpected
 * input" means a white screen on launch with no way back, since the screen you
 * would fix it on is the one that will not load.
 *
 * Everything here is about surviving that.
 */
describe("resolving a stored layout", () => {
  it("gives a fresh install every section in canonical order", () => {
    expect(resolveLayout(undefined).order).toEqual([...HOME_SECTIONS]);
    expect(resolveLayout(undefined).hidden).toEqual([]);
  });

  it.each([[null], [undefined], ["nonsense"], [42], [[]], [{ order: "no" }]])(
    "falls back rather than throwing on %p",
    (bad) => {
      const l = resolveLayout(bad);
      expect(l.order).toEqual([...HOME_SECTIONS]);
      expect(l.hidden).toEqual([]);
    }
  );

  /*
   * The forward-compatibility case: a section this build has, that the stored
   * layout predates. It has to appear, or a feature ships invisible to every
   * existing user and only new installs ever see it.
   */
  it("appends sections the stored order never heard of", () => {
    const l = resolveLayout({ order: ["activity", "power"], hidden: [] });
    expect(l.order.slice(0, 2)).toEqual(["activity", "power"]);
    expect(new Set(l.order)).toEqual(new Set(HOME_SECTIONS));
    expect(l.order).toHaveLength(HOME_SECTIONS.length);
  });

  /*
   * And the backward case: a section that used to exist and does not any more.
   * Rendering by key means an unknown key has no component.
   */
  it("drops keys it does not recognise", () => {
    const l = resolveLayout({ order: ["power", "atlantis", "glance"], hidden: ["shangri-la"] });
    expect(l.order).not.toContain("atlantis");
    expect(l.hidden).not.toContain("shangri-la");
    expect(l.order).toContain("power");
  });

  it("collapses duplicates, which would otherwise render twice", () => {
    const l = resolveLayout({ order: ["power", "power", "glance", "power"], hidden: ["scenes", "scenes"] });
    expect(l.order.filter((k) => k === "power")).toHaveLength(1);
    expect(l.hidden).toEqual(["scenes"]);
  });

  it("is stable: resolving twice changes nothing", () => {
    const once = resolveLayout({ order: ["rooms", "power"], hidden: ["weather"] });
    expect(resolveLayout(once)).toEqual(once);
  });
});

describe("required sections", () => {
  /*
   * Hiding the device grid leaves a smart-home app whose home screen cannot
   * reach any device — and the way out is the screen you have just emptied.
   */
  it("refuses to hide the device grid", () => {
    const l = setHidden(DEFAULT_LAYOUT, "devices", true);
    expect(l.hidden).not.toContain("devices");
    expect(visibleSections(l)).toContain("devices");
  });

  it("un-hides it even if something stored it as hidden", () => {
    const l = resolveLayout({ order: [...HOME_SECTIONS], hidden: ["devices", "weather"] });
    expect(l.hidden).toEqual(["weather"]);
    expect(visibleSections(l)).toContain("devices");
  });

  it("has exactly one required section, so this is not a lock-out", () => {
    const required = HOME_SECTIONS.filter((k) => SECTION_META[k].required);
    expect(required).toEqual(["devices"]);
  });
});

describe("showing and hiding", () => {
  it("hides and restores", () => {
    let l: HomeLayout = DEFAULT_LAYOUT;
    l = setHidden(l, "weather", true);
    expect(visibleSections(l)).not.toContain("weather");
    l = setHidden(l, "weather", false);
    expect(visibleSections(l)).toContain("weather");
  });

  it("keeps the order when a hidden section comes back", () => {
    let l: HomeLayout = DEFAULT_LAYOUT;
    const before = [...l.order];
    l = setHidden(l, "scenes", true);
    l = setHidden(l, "scenes", false);
    expect(l.order).toEqual(before);
  });

  it("does not accumulate duplicates when hidden twice", () => {
    let l: HomeLayout = DEFAULT_LAYOUT;
    l = setHidden(l, "rooms", true);
    l = setHidden(l, "rooms", true);
    expect(l.hidden.filter((k) => k === "rooms")).toHaveLength(1);
  });

  it("never invents or loses a section", () => {
    let l: HomeLayout = DEFAULT_LAYOUT;
    for (const k of HOME_SECTIONS) l = setHidden(l, k, true);
    expect(new Set(l.order)).toEqual(new Set(HOME_SECTIONS));
    /* All but the required one. */
    expect(l.hidden).toHaveLength(HOME_SECTIONS.length - 1);
  });
});

describe("reordering", () => {
  it("moves a section up and back down", () => {
    const first = DEFAULT_LAYOUT.order[0];
    const second = DEFAULT_LAYOUT.order[1];
    const up = move(DEFAULT_LAYOUT, second, -1);
    expect(up.order[0]).toBe(second);
    expect(up.order[1]).toBe(first);
    expect(move(up, second, 1).order).toEqual(DEFAULT_LAYOUT.order);
  });

  /* The ends: the arrows are disabled there, but the model must not wrap —
     a section jumping from top to bottom is not what "up" means. */
  it("does nothing at the ends", () => {
    const first = DEFAULT_LAYOUT.order[0];
    const last = DEFAULT_LAYOUT.order[DEFAULT_LAYOUT.order.length - 1];
    expect(move(DEFAULT_LAYOUT, first, -1).order).toEqual(DEFAULT_LAYOUT.order);
    expect(move(DEFAULT_LAYOUT, last, 1).order).toEqual(DEFAULT_LAYOUT.order);
  });

  it("ignores a key that is not in the layout", () => {
    expect(move(DEFAULT_LAYOUT, "atlantis" as HomeSection, 1).order).toEqual(DEFAULT_LAYOUT.order);
  });

  it("never drops or duplicates while shuffling", () => {
    let l: HomeLayout = DEFAULT_LAYOUT;
    for (let i = 0; i < 40; i++) {
      const k = HOME_SECTIONS[i % HOME_SECTIONS.length];
      l = move(l, k, i % 2 === 0 ? 1 : -1);
    }
    expect(l.order).toHaveLength(HOME_SECTIONS.length);
    expect(new Set(l.order)).toEqual(new Set(HOME_SECTIONS));
  });

  it("does not mutate the layout it was given", () => {
    const before = [...DEFAULT_LAYOUT.order];
    move(DEFAULT_LAYOUT, DEFAULT_LAYOUT.order[3], -1);
    expect(DEFAULT_LAYOUT.order).toEqual(before);
  });
});

describe("isDefault", () => {
  it("is true for a fresh layout and false once touched", () => {
    expect(isDefault(resolveLayout(undefined))).toBe(true);
    expect(isDefault(setHidden(DEFAULT_LAYOUT, "weather", true))).toBe(false);
    expect(isDefault(move(DEFAULT_LAYOUT, DEFAULT_LAYOUT.order[1], -1))).toBe(false);
  });
});

describe("section metadata", () => {
  /* The editor renders from this map; a missing entry is a blank row. */
  it("describes every section", () => {
    for (const k of HOME_SECTIONS) {
      expect(SECTION_META[k]).toBeDefined();
      expect(SECTION_META[k].label.length).toBeGreaterThan(0);
      expect(SECTION_META[k].hint.length).toBeGreaterThan(0);
      expect(SECTION_META[k].key).toBe(k);
    }
  });

  it("describes nothing that is not a section", () => {
    expect(Object.keys(SECTION_META).sort()).toEqual([...HOME_SECTIONS].sort());
  });
});
