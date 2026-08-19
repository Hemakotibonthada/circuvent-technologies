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
  TANK_STALE_MISSES,
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

  it("uses the same miss count on both sides", () => {
    /*
     * The report interval is settable from the app, so the window has to be
     * expressed as a multiple rather than a duration. If the two sides used
     * different multipliers, choosing a slower cadence would put them into
     * disagreement — the app calling the link healthy while the firmware had
     * already stopped filling the tank.
     */
    const interval = defineMs("CV_TANK_REPORT_INTERVAL_MS");
    const stale = defineMs("CV_TANK_STALE_MS");
    expect(stale / interval).toBe(TANK_STALE_MISSES);
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

  it("applies the replay check to the counter restored from flash", () => {
    /*
     * The check used to read `if (s.everHeard && p.seq <= s.lastSeq)`. The
     * starter restores `lastSeq` from NVS at boot precisely so a power cut
     * cannot reopen the replay window — but `everHeard` means "heard since we
     * started" and has to begin false, so the restored counter was loaded and
     * then skipped, and the first packet after every reboot was accepted
     * whatever its sequence.
     *
     * Pinned as a shape rather than a behaviour because this header is C and
     * cannot be executed from here; the point is that `lastSeq` alone must be
     * able to arm the check.
     */
    expect(source).toMatch(/s\.everHeard\s*\|\|\s*s\.lastSeq\s*!=\s*0/);
  });

  it("verifies a pairing offer before adopting its key", () => {
    /*
     * Copying the offered key into place and verifying afterwards left the
     * live sensor's key overwritten when the check failed — the link then
     * stayed dead until the starter was power-cycled, taking auto-fill with
     * it. The memcpy must come after the verify.
     */
    const starter = readFileSync(join(ROOT, "firmware", "watertank", "watertank.ino"), "utf8");
    const verify = starter.indexOf("cvTankVerify(p, offeredKey)");
    const adopt = starter.indexOf("memcpy(linkKey, offeredKey");
    expect(verify).toBeGreaterThan(-1);
    expect(adopt).toBeGreaterThan(verify);
  });

  it("refuses to pump on a sump it cannot read", () => {
    /*
     * A faulted sump used to be substituted with 50%, which is above every
     * possible sumpMin — so a dead sump sensor satisfied the pump's primary
     * dry-run interlock and auto-fill would start the motor on it.
     */
    const starter = readFileSync(join(ROOT, "firmware", "watertank", "watertank.ino"), "utf8");
    expect(starter).toMatch(/if\s*\(\s*on\s*&&\s*sumpFault\s*\)\s*on\s*=\s*false/);
    expect(starter).toMatch(/if\s*\(pump\s*&&\s*sumpFault\)\s*\{\s*setPump\(false\)/);
  });

  it("no longer invents a sump percentage", () => {
    // The specific line that caused it. Its return would be silent.
    const starter = readFileSync(join(ROOT, "firmware", "watertank", "watertank.ino"), "utf8");
    expect(starter).not.toMatch(/sumpPct\s*=\s*sumpPct\s*<\s*0\s*\?\s*50/);
  });

  it("holds the sensor's supply line through deep sleep", () => {
    /*
     * The ESP32 releases digital outputs the moment deep sleep begins, so
     * driving SENSOR_EN low without latching it left the ultrasonic module's
     * enable floating for the whole interval — on the one device in the fleet
     * that runs from a cell on a roof.
     */
    const sensor = readFileSync(
      join(ROOT, "firmware", "watertank-sensor", "watertank-sensor.ino"),
      "utf8"
    );
    expect(sensor).toMatch(/gpio_hold_en\(\(gpio_num_t\)SENSOR_EN\)/);
    expect(sensor).toMatch(/gpio_deep_sleep_hold_en\(\)/);
    // And released on the way back, or the pin stays frozen and the sensor is
    // never powered up again.
    expect(sensor).toMatch(/gpio_hold_dis\(\(gpio_num_t\)SENSOR_EN\)/);
  });

  it("compares MACs in constant time", () => {
    // A byte-at-a-time comparison leaks how many leading bytes were correct,
    // and a radio attacker can retry indefinitely.
    expect(source).toMatch(/diff\s*\|=/);
    expect(source).not.toMatch(/memcmp\s*\([^)]*mac/);
  });
});
