/**
 * The meter's state keys, read out of the sketch rather than assumed.
 *
 * chKey() writes the bare name for channel 0 and appends i+1 after that, so a
 * three-channel board publishes `watts`, `watts2`, `watts3` — and `watts0`
 * exists on no board at all. I got this wrong first time and shipped a panel
 * that read watts0/1/2, which shows a working meter as reading zero on every
 * channel. Nothing errors; the numbers are simply absent.
 *
 * This pins the convention in both directions: the console must read the keys
 * the firmware writes, and the firmware must keep writing them.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const sketch = fs.readFileSync(path.join(root, "firmware", "meter", "meter.ino"), "utf8");

/** The naming rule, mirrored from chKey() in the sketch. */
function channelKey(base: string, index: number): string {
  return index === 0 ? base : `${base}${index + 1}`;
}

describe("meter channel keys", () => {
  it("the sketch still names channel 0 with the bare key", () => {
    // if (i == 0) snprintf(buf, n, "%s", base);
    expect(sketch).toMatch(/if\s*\(i\s*==\s*0\)\s*snprintf\(buf,\s*n,\s*"%s",\s*base\)/);
  });

  it("the sketch still appends i + 1 for later channels", () => {
    expect(sketch).toMatch(/snprintf\(buf,\s*n,\s*"%s%d",\s*base,\s*i\s*\+\s*1\)/);
  });

  it("never produces a zero-suffixed key", () => {
    // The mistake that cost a panel: watts0 looks obvious and is never written.
    for (const base of ["watts", "amps", "kwh", "pf"]) {
      expect(channelKey(base, 0)).not.toBe(`${base}0`);
      expect(channelKey(base, 0)).toBe(base);
    }
  });

  it("maps the three channels the way the sketch writes them", () => {
    expect([0, 1, 2].map((i) => channelKey("watts", i))).toEqual(["watts", "watts2", "watts3"]);
    expect([0, 1, 2].map((i) => channelKey("kwh", i))).toEqual(["kwh", "kwh2", "kwh3"]);
  });

  it("publishes the totals the console leads with", () => {
    // A single-channel board and an older energy-monitor both publish `watts`,
    // which is why the console falls back to it for the headline figure.
    expect(sketch).toMatch(/cv\.set\("wattsTotal"/);
    expect(sketch).toMatch(/cv\.set\("volts"/);
    expect(sketch).toMatch(/cv\.set\("channels"/);
  });
});

describe("the console reads what the firmware writes", () => {
  const controls = fs.readFileSync(
    path.join(root, "src", "app", "smarthome", "DeviceControls.tsx"),
    "utf8"
  );
  const mobile = fs.readFileSync(
    path.join(root, "mobile", "src", "screens", "Control.tsx"),
    "utf8"
  );

  it.each([
    ["console", () => controls],
    ["app", () => mobile],
  ])("%s uses the i + 1 convention, not a zero suffix", (_name, read) => {
    const src = read();
    const meter = src.slice(src.indexOf("function EnergyMeter"));
    const body = meter.slice(0, meter.indexOf("\nfunction "));

    expect(body).toContain("i + 1");
    // `${base}${i}` would produce watts0 and read nothing.
    expect(body).not.toMatch(/\$\{base\}\$\{i\}/);
  });
});
