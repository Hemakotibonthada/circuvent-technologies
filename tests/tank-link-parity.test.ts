/**
 * The firmware and the apps must agree about when a tank reading goes stale.
 *
 * Two copies of this rule exist and cannot be shared: one in C++ on the
 * controller (firmware/CircuventDevice/CvTankLink.h), which decides whether the
 * pump may run, and one in TypeScript (src/lib/tank-link.ts), which decides
 * what the console and the app show.
 *
 * If they drift, the failure is quiet and it is the dangerous kind. Suppose the
 * app's threshold is longer than the firmware's: the app shows a healthy level
 * and an idle pump, the controller has silently stopped auto-filling, and the
 * tank runs dry while the dashboard looks fine. Reverse them and the app warns
 * about a link the controller is happily using.
 *
 * Nothing else would catch it. Both sides work perfectly on their own.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  TANK_REPORT_INTERVAL_S,
  TANK_STALE_S,
  TANK_ABANDON_S,
} from "@/lib/tank-link";

const ROOT = resolve(__dirname, "..");
const HEADER = join(ROOT, "firmware", "CircuventDevice", "CvTankLink.h");
const source = readFileSync(HEADER, "utf8");

/**
 * Pull a `#define NAME <expr>` out of the header and evaluate the arithmetic.
 *
 * The header writes the stale window as `(INTERVAL * 6UL)` on purpose — the
 * relationship is the point, not the number — so the value has to be computed
 * rather than string-matched.
 */
function defineMs(name: string): number {
  const m = source.match(new RegExp(`#define\\s+${name}\\s+([^\\n/]+)`));
  if (!m) throw new Error(`${name} is not defined in CvTankLink.h`);

  // Strip integer suffixes, but only where they follow a digit — a blanket
  // removal of "L" also eats the L in CV_TANK_REPORT_INTERVAL_MS.
  const expr = m[1].trim().replace(/(\d)(?:ULL|LL|UL|U|L)\b/g, "$1");
  const resolved = expr.replace(/CV_TANK_[A-Z0-9_]+/g, (ref) => String(defineMs(ref)));

  if (!/^[\d\s()*+/-]+$/.test(resolved)) {
    throw new Error(`${name} is not plain arithmetic: ${expr}`);
  }
  return Number(new Function(`return (${resolved});`)());
}

describe("tank link thresholds", () => {
  it("agrees on the report interval", () => {
    expect(defineMs("CV_TANK_REPORT_INTERVAL_MS") / 1000).toBe(TANK_REPORT_INTERVAL_S);
  });

  it("agrees on when a reading goes stale", () => {
    // The moment the pump stops trusting the level is the moment the app must
    // stop presenting it as current.
    expect(defineMs("CV_TANK_STALE_MS") / 1000).toBe(TANK_STALE_S);
  });

  it("agrees on when a reading is abandoned", () => {
    expect(defineMs("CV_TANK_ABANDON_MS") / 1000).toBe(TANK_ABANDON_S);
  });

  it("keeps the stale window a multiple of the report interval", () => {
    // A threshold that is not a whole number of reports means the link is
    // declared down partway through a gap, which makes the behaviour depend on
    // exactly when the controller booted.
    const interval = defineMs("CV_TANK_REPORT_INTERVAL_MS");
    const stale = defineMs("CV_TANK_STALE_MS");
    expect(stale % interval).toBe(0);
    // Several misses, so one lost packet is not a fault; not so many that a
    // dead sensor goes unnoticed for a long time.
    expect(stale / interval).toBeGreaterThanOrEqual(3);
    expect(stale / interval).toBeLessThanOrEqual(10);
  });

  it("abandons well after it goes stale", () => {
    // These must be distinct states. Collapsing them loses the difference
    // between "briefly late, still roughly true" and "tells you nothing".
    expect(defineMs("CV_TANK_ABANDON_MS")).toBeGreaterThan(defineMs("CV_TANK_STALE_MS") * 2);
  });
});

describe("the firmware's safety gate", () => {
  it("routes the pump through the freshness check", () => {
    // The whole design rests on setPump refusing to start without a fresh
    // reading. If this disappears, everything else still looks correct.
    const starter = readFileSync(join(ROOT, "firmware", "watertank", "watertank.ino"), "utf8");
    expect(starter).toMatch(/if\s*\(\s*on\s*&&\s*!ohLive\s*\)\s*on\s*=\s*false/);
  });

  it("stops a pump that is already running when the link drops", () => {
    // The dangerous moment: mid-fill, the only thing that would have stopped
    // the pump was a level that is no longer arriving.
    const starter = readFileSync(join(ROOT, "firmware", "watertank", "watertank.ino"), "utf8");
    expect(starter).toMatch(/if\s*\(pump\s*&&\s*!ohLive\)\s*\{\s*setPump\(false\)/);
  });

  it("gates auto-fill on the link being live", () => {
    const starter = readFileSync(join(ROOT, "firmware", "watertank", "watertank.ino"), "utf8");
    expect(starter).toMatch(/if\s*\(autoMode\s*&&\s*ohLive\s*&&/);
  });

  it("refuses replayed packets", () => {
    // Without this, a recording of one valid packet could hold the link
    // "alive" forever while the real sensor is flat or removed.
    expect(source).toMatch(/p\.seq\s*<=\s*s\.lastSeq/);
  });

  it("compares MACs in constant time", () => {
    // A byte-at-a-time comparison leaks how many leading bytes were correct,
    // and a radio attacker can retry indefinitely.
    expect(source).toMatch(/diff\s*\|=/);
    expect(source).not.toMatch(/memcmp\s*\([^)]*mac/);
  });
});
