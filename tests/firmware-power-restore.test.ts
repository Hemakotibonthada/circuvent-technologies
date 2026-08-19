/**
 * What every device must do in the first moments after power returns.
 *
 * THE FIELD REPORT THIS EXISTS FOR
 *
 * Mains fails, so the router and the devices go down together. Power returns.
 * A device is booted in about a second; a domestic router takes two to five
 * minutes. Two things went wrong in that window, and both were reported as the
 * hardware being broken:
 *
 *   1. The device came up, could not find the Wi-Fi, and opened its setup
 *      hotspot — and was still sitting in it long after the router had
 *      recovered.
 *   2. Every relay came up on, rather than the way the owner had left them.
 *
 * Neither produces an error anywhere. From the outside it is simply a house
 * where all the lights came on by themselves and the app says everything is
 * offline.
 *
 * These assertions pin the behaviour that prevents both. They read the
 * firmware, because the firmware is the only thing that is true here — the
 * control plane cannot help a device that has not reached it yet, and that is
 * the entire point.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const firmware = path.join(root, "firmware");
const shared = fs.readFileSync(
  path.join(firmware, "CircuventDevice", "CircuventDevice.h"),
  "utf8"
);

/** Every sketch in the tree, with its source. */
function sketches(): Array<{ name: string; src: string }> {
  return fs
    .readdirSync(firmware, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => {
      const dir = path.join(firmware, e.name);
      const ino = fs.readdirSync(dir).find((f) => f.endsWith(".ino"));
      return ino ? { name: e.name, src: fs.readFileSync(path.join(dir, ino), "utf8") } : null;
    })
    .filter((x): x is { name: string; src: string } => x !== null);
}

/** The body of `void setup() { ... }`, brace-matched. */
function setupBody(src: string): string {
  const at = src.indexOf("void setup()");
  if (at < 0) return "";
  const open = src.indexOf("{", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

const all = sketches();

describe("a device that loses the router does not lose its way home", () => {
  it("only opens the setup hotspot when there is nothing to connect to", () => {
    /*
     * The rule that fixes the reported fault. The AP is for a device that has
     * been reset or was never set up — the two cases where waiting cannot
     * help. A device holding credentials keeps trying for as long as it takes,
     * because the router is coming back and it has somewhere to go.
     */
    expect(shared).toMatch(/bool needsPortal = !haveWifi \|\|/);
  });

  it("retries its home Wi-Fi while sitting in the portal", () => {
    /*
     * Belt to the braces above. A device can reach AP mode by other routes —
     * a setup window nobody used, or a portal raised by an older build — and
     * loop() returns early while the portal is up, so without this it would
     * never try the network again.
     */
    expect(shared).toMatch(/CV_PORTAL_WIFI_RETRY_MS/);
    expect(shared).toMatch(/Home Wi-Fi is back — leaving setup mode/);
  });

  it("reconnects with begin rather than reconnect", () => {
    // WiFi.reconnect() re-uses an association the supplicant never made when
    // the AP was down at boot, so it returns false and does nothing — in
    // exactly the state a device is in after a power cut.
    expect(shared).toMatch(/WiFi\.begin\(_ssid\.c_str\(\), _pass\.c_str\(\)\)/);
  });
});

describe("the reset button cannot fire because the power came back", () => {
  it("ignores the reset pin until it has been seen released", () => {
    /*
     * The destructive one. GPIO0 is a strapping pin on an RC network on every
     * one of our boards, and on a slow mains restore it can sit low for
     * seconds. Read as a three-second press that erases the Wi-Fi, or an
     * eight-second one that factory-resets, it produces a device that comes
     * back from a power cut with nothing left to reconnect with — which is
     * indistinguishable, from the app, from a device that simply never
     * returned.
     *
     * Nobody can hold a button for a device that is not running yet, so a
     * press that was already in progress at boot is never real.
     */
    expect(shared).toMatch(/_resetArmed/);
    expect(shared).toMatch(/if \(!_resetArmed\)/);
    expect(shared).toMatch(/_resetArmed = false;/);
  });

  it("refuses a press too short to be a finger", () => {
    expect(shared).toMatch(/CV_RESET_DEBOUNCE_MS/);
    expect(shared).toMatch(/if \(held < CV_RESET_DEBOUNCE_MS\) return;/);
  });

  it("still honours a real long press", () => {
    // The feature has to survive the fix: 3s changes Wi-Fi, 8s factory resets.
    expect(shared).toMatch(/held >= 8000\) _factoryReset\(\)/);
    expect(shared).toMatch(/held >= 3000\) _clearWifi\(\)/);
  });
});

describe("outputs come back the way the owner left them", () => {
  it("claims a relay pin without clicking it first", () => {
    /*
     * An ESP32 output latch reads LOW before anything is written to it, so on
     * an active-low board pinMode(OUTPUT) energises the relay the instant the
     * pin becomes an output. Writing the safe level first means the pin drives
     * "off" from the moment it drives anything at all.
     */
    const init = shared.slice(shared.indexOf("cvRelayInit"), shared.indexOf("cvRelayInit") + 400);
    const write = init.indexOf("digitalWrite");
    const mode = init.indexOf("pinMode");
    expect(write).toBeGreaterThan(-1);
    expect(mode).toBeGreaterThan(-1);
    expect(write).toBeLessThan(mode);
  });

  /*
   * The important half. Restoring from the cloud is not restoring: the cloud is
   * minutes away after a power cut, and for those minutes the loads are in
   * whatever state the hardware powered up in. Every sketch that drives an
   * output must put it back from its own storage before it does anything with
   * the network.
   */
  const relayDrivers = all.filter(
    (s) => /cvRelayInit\(/.test(s.src) || /relayHwWrite\(/.test(s.src)
  );

  it("finds the sketches that drive outputs", () => {
    expect(relayDrivers.length).toBeGreaterThan(8);
  });

  it.each(relayDrivers.map((s) => s.name))(
    "%s restores its outputs before it touches the network",
    (name) => {
      const s = all.find((x) => x.name === name)!;
      const body = setupBody(s.src);
      expect(body.length).toBeGreaterThan(40);

      const begin = body.indexOf("cv.begin(");
      expect(begin).toBeGreaterThan(-1);

      /*
       * Matched on reading persisted state rather than on a particular helper
       * name: sketches spell the restore as applyPower(), applyLight(),
       * loadState(), loadCfg(), applyPump() and half a dozen other things, and
       * pinning the name would make this a test about vocabulary. The loader
       * calls are included because several sketches read NVS inside one rather
       * than inline in setup().
       */
      const restore = body.search(
        /store\.(getBool|getInt|getUChar|getString)\(|load(State|Cfg|Prefs|Config)\(/
      );
      expect(restore).toBeGreaterThan(-1);
      expect(restore).toBeLessThan(begin);
    }
  );

  /*
   * A first boot, or a boot after a factory reset, has nothing stored. The
   * default has to be off: coming up with every load energised is the fault
   * this file is named for, and a house where the lights come on by themselves
   * at 3am is worse than one where they do not come on at all.
   *
   * Only literal `true` is refused. A variable default is the sketch's own
   * initialiser, which is where that value already has to be correct, and
   * chasing it here would be re-implementing the compiler.
   */
  const PREFERENCE_KEYS_ALLOWED_TRUE: Record<string, string[]> = {
    // Whether to restore relays at all, not the state of one. Defaulting it
    // true is what makes restore-on-power-return the behaviour out of the box.
    "home-hub": ["restore"],
    // Auto mode is a mode, not a load. A tank controller that came back with
    // auto disabled would quietly stop filling.
    aquaguard: ["auto"],
    watertank: ["auto"],
    /*
     * Same argument at a gate, and the failure is more visible: a barrier that
     * came back from a power cut with auto mode off stops opening for
     * authorised tags, and the residents sit outside their own gate wondering
     * why their card has stopped working. It energises nothing by itself —
     * `auto` only decides whether a *scanned* tag opens the barrier.
     *
     * The gate only appears in this list at all since 2.0.0, when it started
     * claiming its relays through cvRelayInit. Before that it drove them with
     * bare pinMode and digitalWrite, which meant it escaped this check
     * entirely — while being the sketch that most needed it, because on an
     * active-low board that left both the OPEN and CLOSE relays energised from
     * the moment it powered on.
     */
    "rfid-gate": ["auto"],
  };

  it.each(relayDrivers.map((s) => s.name))(
    "%s never defaults a stored output to on",
    (name) => {
      const s = all.find((x) => x.name === name)!;
      const allowed = PREFERENCE_KEYS_ALLOWED_TRUE[name] ?? [];
      const offenders = [...s.src.matchAll(/store\.getBool\(\s*"([^"]+)"\s*,\s*true\s*\)/g)]
        .map((m) => m[1])
        .filter((key) => !allowed.includes(key));
      expect(offenders).toEqual([]);
    }
  );
});
