/**
 * The 8-gang touch board must be eight gangs everywhere, or it is broken
 * somewhere nobody looks.
 *
 * A multi-gang device is defined in six places that cannot import each other:
 * the sketch, the console's field list, the console's automation fields, the
 * phone's field list, the phone's widget list, and the registries that decide
 * whether a control gets drawn at all. Every one of them is a chance for the
 * board to have eight relays and for some surface to know about three.
 *
 * That failure is silent by construction. A gang the console does not list is
 * not an error — it is a switch that is simply absent, on hardware that
 * switches it happily from the wall. A gang listed but not read by the sketch
 * is worse: the toggle moves, the optimistic update pins it, and it waits for
 * an echo that can never arrive.
 *
 * Docs/07-adding-a-new-device.md calls these out by name as the silent
 * failures. This file is that checklist, executed.
 */
import fs from "node:fs";
import path from "node:path";

import { TOUCHBOARD8_GANG_FIELDS, projectCommand } from "@/lib/smarthome-command-map";

const root = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");

const sketch = read("firmware", "touchboard-8", "touchboard-8.ino");

/** Reads `#define NAME value` out of the sketch. */
function define(name: string): string {
  const m = sketch.match(new RegExp(`#define\\s+${name}\\s+(\\S+)`));
  if (!m) throw new Error(`${name} is no longer defined in touchboard-8.ino`);
  return m[1];
}

const GANGS = Number(define("NUM_GANG"));

describe("the sketch is the source of truth for how many gangs exist", () => {
  it("declares a gang count", () => {
    expect(GANGS).toBe(8);
  });

  it("gives every gang a relay and a pad", () => {
    /*
     * Eight fields with seven relay pins would be a board whose last gang
     * exists in every list and drives nothing.
     */
    const list = (name: string) => {
      const m = sketch.match(new RegExp(`${name}\\[NUM_GANG\\]\\s*=\\s*\\{([^}]+)\\}`));
      if (!m) throw new Error(`${name} not found in the sketch`);
      return m[1].split(",").map((s) => s.trim()).filter(Boolean);
    };
    expect(list("RELAY_PIN")).toHaveLength(GANGS);
    expect(list("kRelay")).toHaveLength(GANGS);
    expect(list("kTouch")).toHaveLength(GANGS);
  });

  it("keeps GPIO12 off the touch pads", () => {
    /*
     * GPIO12 is the flash-voltage strap. A pad there can be held high by a
     * resting hand or a damp wall through a power cut, and the board then
     * selects 1.8V flash and does not boot at all — inside a wall, with
     * nothing in any log. The sketch has a static_assert; this fails faster
     * and explains why to somebody reading the tests rather than the build.
     */
    const touch = sketch.match(/kTouch\[NUM_GANG\]\s*=\s*\{([^}]+)\}/);
    expect(touch).not.toBeNull();
    expect(touch![1]).not.toMatch(/\bT5\b/);
    expect(sketch).toMatch(/static_assert\(!cvHas\(kTouch, NUM_GANG, 12\)/);
  });

  it("publishes the count instead of letting the UI assume one", () => {
    // The lesson the Sentinel taught: a board that ships in variants must say
    // how big it is, or a smaller unit inherits the larger one's dead switches.
    expect(sketch).toMatch(/cv\.set\("gangs",\s*NUM_GANG\)/);
  });

  it("names its fields g1..gN, which is what every list above assumes", () => {
    expect(sketch).toMatch(/out\[0\]\s*=\s*'g';/);
    expect(sketch).toMatch(/out\[1\]\s*=\s*\(char\)\('1'\s*\+\s*i\);/);
  });
});

describe("every surface lists the same eight gangs", () => {
  const expected = Array.from({ length: GANGS }, (_, i) => `g${i + 1}`);

  it("the console's field list matches the sketch", () => {
    expect([...TOUCHBOARD8_GANG_FIELDS]).toEqual(expected);
  });

  it("the phone's field list matches the console's", () => {
    /*
     * The app and the site are separate projects and cannot import each other,
     * so this constant is duplicated. Duplication is fine; drift is the bug —
     * and drift here means the phone silently stops at whatever it knew last.
     */
    const mobile = read("mobile", "src", "command-map.ts");
    const m = mobile.match(/TOUCHBOARD8_GANG_FIELDS\s*=\s*\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const fields = (m![1].match(/"(g\d+)"/g) || []).map((s) => s.replace(/"/g, ""));
    expect(fields).toEqual(expected);
  });

  it("the phone's per-gang widgets cover all of them", () => {
    // defaultGangs drives renaming and hiding. A gang missing here cannot be
    // labelled, so it shows as a generic channel the owner cannot identify.
    const widgets = read("mobile", "src", "widgets.ts");
    const m = widgets.match(/case "touchboard-8":\s*\n\s*return ([^;]+);/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(new RegExp(`length:\\s*${GANGS}`));
  });

  it("the automation builder offers every gang", () => {
    const describeSrc = read("src", "app", "smarthome", "automation", "describe.ts");
    expect(describeSrc).toMatch(/case "touchboard-8":/);
    expect(describeSrc).toMatch(/TOUCHBOARD8_GANG_FIELDS\.map/);
  });
});

describe("commands project to what the sketch will actually report", () => {
  it("projects each gang", () => {
    for (const g of TOUCHBOARD8_GANG_FIELDS) {
      expect(projectCommand("touchboard-8", { action: "set", [g]: true })).toEqual({ [g]: true });
    }
  });

  it("projects `all` across all eight, not three", () => {
    /*
     * The exact bug this type risks: `all` is shared wording with the 3-gang
     * board. Projecting three gangs would leave five toggles pinned, spinning,
     * waiting for an echo the device already sent for hardware the console
     * thinks it does not have.
     */
    const patch = projectCommand("touchboard-8", { action: "set", all: true });
    expect(Object.keys(patch).sort()).toEqual([...TOUCHBOARD8_GANG_FIELDS].sort());
    expect(Object.values(patch).every((v) => v === true)).toBe(true);
  });

  it("does not widen the 3-gang board", () => {
    const patch = projectCommand("touchboard", { action: "set", all: true });
    expect(Object.keys(patch).sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("clamps backlight the way the sketch does", () => {
    // constrain(p["backlight"], 0, 100) in touchboard-8.ino.
    expect(projectCommand("touchboard-8", { action: "set", backlight: 140 })).toEqual({ backlight: 100 });
    expect(projectCommand("touchboard-8", { action: "set", backlight: -5 })).toEqual({ backlight: 0 });
  });
});

describe("the registries that decide whether a control is drawn at all", () => {
  it("the console renders a control instead of a JSON dump", () => {
    // Silent failure #1 in Docs/07: no case means the device falls through to
    // `default:` and shows raw state.
    const controls = read("src", "app", "smarthome", "DeviceControls.tsx");
    expect(controls).toMatch(/case "touchboard-8":\s*\n\s*return <TouchBoard/);
    expect(controls).toMatch(/"touchboard-8":\s*\{\s*label:/);
  });

  it("the phone renders a control instead of a JSON dump", () => {
    // Silent failure #2: the KNOWN array, not the components, decides whether
    // the raw-state card appears.
    const control = read("mobile", "src", "screens", "Control.tsx");
    expect(control).toMatch(/const KNOWN = \[[^\]]*"touchboard-8"/);
    expect(control).toMatch(/d\.type === "touchboard-8"/);
  });

  it("a serial number resolves back to the type", () => {
    // Silent failure #4: without a code the serial still prints and validates,
    // and resolves to no device type at all.
    const serial = read("platform", "api", "src", "serial.ts");
    expect(serial).toMatch(/"touchboard-8":\s*"TC8"/);
  });

  it("has an icon the phone can actually draw", () => {
    const icons = read("mobile", "src", "icons.tsx");
    const theme = read("mobile", "src", "theme.ts");
    const meta = theme.match(/"touchboard-8":\s*\{[^}]*icon:\s*"([^"]+)"/);
    expect(meta).not.toBeNull();
    // A name with no entry is invisible to TypeScript and renders as a blank box.
    expect(icons).toMatch(new RegExp(`["']?${meta![1]}["']?:\\s*mci\\(`));
  });

  it("is sold with artwork that exists", () => {
    const shop = read("src", "lib", "shop-data.ts");
    const m = shop.match(/id: "touchboard-8",[\s\S]*?image: "([^"]+)"/);
    expect(m).not.toBeNull();
    expect(fs.existsSync(path.join(root, "public", m![1]))).toBe(true);
  });
});
