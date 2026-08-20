/**
 * Every device the firmware tree ships must have a console that can control it.
 *
 * This gap is easy to create and invisible once made: a new sketch lands, the
 * hardware works, and the console falls through to its generic renderer — a
 * device page with a raw state dump and no controls. Nothing errors, so nobody
 * finds out until somebody plugs one in.
 *
 * It had already happened once. firmware/meter shipped a true-power meter with
 * calibration and per-channel energy counters, and DeviceControls had no case
 * for it at all.
 */
import fs from "node:fs";
import path from "node:path";

/* tests/ sits at the repo root, so one level up is the repo — not two. */
const root = path.join(__dirname, "..");

/** Firmware projects, by directory name, excluding build output. */
function firmwareProjects(): string[] {
  const dir = path.join(root, "firmware");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .filter((e) => {
      const inner = path.join(dir, e.name);
      return fs.readdirSync(inner).some((f) => f.endsWith(".ino"));
    })
    .map((e) => e.name)
    .sort();
}

/** Device types DeviceControls switches on. */
function renderedTypes(): Set<string> {
  const src = fs.readFileSync(
    path.join(root, "src", "app", "smarthome", "DeviceControls.tsx"),
    "utf8"
  );
  const out = new Set<string>();
  for (const m of src.matchAll(/case\s+"([a-z0-9-]+)":/g)) out.add(m[1]);
  return out;
}

/**
 * Firmware whose sketch is a component of another device rather than a device
 * somebody adds to a home.
 *
 * Each needs a reason, so that "it is fine, it is a special case" cannot be
 * used to wave away a genuine omission.
 */
const NOT_STANDALONE: Record<string, string> = {
  // A radio-linked sensor that reports through the watertank controller; it
  // never appears as its own tile.
  "watertank-sensor": "reports through watertank",
  // The flight controller inside the drone. The console talks to drone-link.
  "drone-fc": "spoken to via drone-link",
  // The dongle on the end of the phone's OTG cable. It is an accessory of the
  // phone rather than a device in a home — it has no state of its own worth a
  // tile, and what it relays appears under the car.
  "rc-link": "relays for the rc car; has no state of its own",
  // The handset. Same reasoning: it drives the car, it is not driven.
  "rc-remote": "drives the rc car; not itself controllable",
};

describe("firmware and console agree on what exists", () => {
  it("finds the firmware tree", () => {
    expect(firmwareProjects().length).toBeGreaterThan(15);
  });

  it("renders a control surface for every device the firmware ships", () => {
    const rendered = renderedTypes();
    const missing = firmwareProjects()
      .filter((p) => !(p in NOT_STANDALONE))
      .filter((p) => !rendered.has(p));

    expect(missing).toEqual([]);
  });

  it("keeps the meter specifically, since that is the one that was missing", () => {
    expect(renderedTypes().has("meter")).toBe(true);
  });

  it("documents why anything is excluded", () => {
    // An empty reason would let an omission hide behind the exclusion list.
    for (const [name, reason] of Object.entries(NOT_STANDALONE)) {
      expect(reason.length).toBeGreaterThan(5);
      expect(firmwareProjects()).toContain(name);
    }
  });
});
