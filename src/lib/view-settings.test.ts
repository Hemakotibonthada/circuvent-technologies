/**
 * View settings.
 *
 * The behaviour worth pinning down is not "does a setter set" but the two
 * things that broke before: a preference that is written and never read, and a
 * boot script whose key strings drift from the module's. Both are asserted
 * here rather than left to be noticed on a screenshot.
 */

import {
  DEFAULT_VIEW_SETTINGS,
  DENSITIES,
  DENSITY_KEY,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_KEY,
  WIDTHS,
  WIDTH_KEY,
  applyViewSettings,
  clampScale,
  readViewSettings,
  resetViewSettings,
  saveViewSettings,
  subscribeViewSettings,
  viewSettingsBootScript,
} from "./view-settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-density");
  document.documentElement.removeAttribute("data-width");
  document.documentElement.style.removeProperty("--cv-ui-scale");
});

describe("readViewSettings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it("accepts a JSON-encoded value, as the console's usePersistentState writes", () => {
    localStorage.setItem(DENSITY_KEY, JSON.stringify("compact"));
    expect(readViewSettings().density).toBe("compact");
  });

  it("accepts a bare value, as a plain setItem writes", () => {
    localStorage.setItem(DENSITY_KEY, "compact");
    expect(readViewSettings().density).toBe("compact");
  });

  it("falls back to the default rather than trusting an unknown value", () => {
    localStorage.setItem(DENSITY_KEY, JSON.stringify("enormous"));
    localStorage.setItem(WIDTH_KEY, JSON.stringify("cinemascope"));
    const s = readViewSettings();
    expect(s.density).toBe(DEFAULT_VIEW_SETTINGS.density);
    expect(s.width).toBe(DEFAULT_VIEW_SETTINGS.width);
  });

  it("clamps a stored scale that is out of range", () => {
    localStorage.setItem(SCALE_KEY, JSON.stringify(5000));
    expect(readViewSettings().scale).toBe(MAX_SCALE);
    localStorage.setItem(SCALE_KEY, JSON.stringify(1));
    expect(readViewSettings().scale).toBe(MIN_SCALE);
    localStorage.setItem(SCALE_KEY, JSON.stringify("not a number"));
    expect(readViewSettings().scale).toBe(DEFAULT_VIEW_SETTINGS.scale);
  });
});

describe("applyViewSettings", () => {
  it("puts the settings where CSS can see them", () => {
    applyViewSettings({ density: "compact", scale: 90, width: "full" });
    const el = document.documentElement;
    expect(el.dataset.density).toBe("compact");
    expect(el.dataset.width).toBe("full");
    expect(el.style.getPropertyValue("--cv-ui-scale")).toBe("0.9");
  });
});

describe("saveViewSettings", () => {
  it("persists, applies and notifies in one step", () => {
    const seen: string[] = [];
    const stop = subscribeViewSettings((s) => seen.push(s.density));

    saveViewSettings({ density: "compact" });

    expect(readViewSettings().density).toBe("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(seen).toEqual(["compact"]);
    stop();
  });

  it("leaves the settings it was not asked to change alone", () => {
    saveViewSettings({ density: "compact", scale: 90, width: "full" });
    saveViewSettings({ scale: 110 });
    expect(readViewSettings()).toEqual({ density: "compact", scale: 110, width: "full" });
  });

  it("clamps rather than storing an unusable scale", () => {
    expect(saveViewSettings({ scale: 400 }).scale).toBe(MAX_SCALE);
    expect(saveViewSettings({ scale: 10 }).scale).toBe(MIN_SCALE);
  });

  it("stops notifying once unsubscribed", () => {
    const seen: string[] = [];
    const stop = subscribeViewSettings((s) => seen.push(s.density));
    stop();
    saveViewSettings({ density: "compact" });
    expect(seen).toEqual([]);
  });
});

describe("resetViewSettings", () => {
  it("returns every value to the default", () => {
    saveViewSettings({ density: "compact", scale: 85, width: "standard" });
    expect(resetViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });
});

describe("clampScale", () => {
  it("survives values that are not numbers at all", () => {
    expect(clampScale(Number.NaN)).toBe(DEFAULT_VIEW_SETTINGS.scale);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VIEW_SETTINGS.scale);
  });
});

describe("viewSettingsBootScript", () => {
  const runBootScript = () => {
    new Function(viewSettingsBootScript())();
  };

  it("names the same storage keys the module reads", () => {
    const src = viewSettingsBootScript();
    for (const key of [DENSITY_KEY, WIDTH_KEY, SCALE_KEY]) {
      expect(src).toContain(key);
    }
  });

  it("applies stored settings before any React code runs", () => {
    localStorage.setItem(DENSITY_KEY, JSON.stringify("compact"));
    localStorage.setItem(WIDTH_KEY, JSON.stringify("full"));
    localStorage.setItem(SCALE_KEY, JSON.stringify(90));

    runBootScript();

    const el = document.documentElement;
    expect(el.dataset.density).toBe("compact");
    expect(el.dataset.width).toBe("full");
    expect(el.style.getPropertyValue("--cv-ui-scale")).toBe("0.9");
  });

  it("agrees with readViewSettings on every valid combination", () => {
    for (const density of DENSITIES) {
      for (const width of WIDTHS) {
        for (const scale of [MIN_SCALE, 100, MAX_SCALE]) {
          localStorage.setItem(DENSITY_KEY, JSON.stringify(density));
          localStorage.setItem(WIDTH_KEY, JSON.stringify(width));
          localStorage.setItem(SCALE_KEY, JSON.stringify(scale));

          runBootScript();
          const fromModule = readViewSettings();
          const el = document.documentElement;

          expect(el.dataset.density).toBe(fromModule.density);
          expect(el.dataset.width).toBe(fromModule.width);
          expect(el.style.getPropertyValue("--cv-ui-scale")).toBe(String(fromModule.scale / 100));
        }
      }
    }
  });

  it("falls back to the defaults when storage holds nonsense", () => {
    localStorage.setItem(DENSITY_KEY, "{{{ not json");
    localStorage.setItem(SCALE_KEY, JSON.stringify("banana"));

    runBootScript();

    const el = document.documentElement;
    expect(el.dataset.density).toBe(DEFAULT_VIEW_SETTINGS.density);
    expect(el.style.getPropertyValue("--cv-ui-scale")).toBe(
      String(DEFAULT_VIEW_SETTINGS.scale / 100),
    );
  });
});
