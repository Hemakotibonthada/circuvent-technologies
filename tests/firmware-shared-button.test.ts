/**
 * A local button must not act while the reset gesture is being made.
 *
 * THE PIN HAS TWO OWNERS
 *
 * `BTN_PIN` is GPIO0 on every board we ship, and GPIO0 is also what every
 * sketch hands to `setResetButton(0)`. A tap means whatever the device decides
 * — toggle the lamp, cycle the fan, throw the bolt, open the barrier — and a
 * multi-second hold is the platform gesture for "clear Wi-Fi" (3 s) or
 * "factory reset" (8 s).
 *
 * Six sketches read that pin as a level with a rate limit:
 *
 *     if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) { ... }
 *
 * which is not "on press". It is "every 400 ms for as long as it is held". So
 * the act of holding BOOT to change the Wi-Fi also drove the device: seven
 * toggles over three seconds, twenty over the eight needed for a factory reset,
 * each one switching a relay and committing to NVS. On a lock that is the bolt
 * thrown twenty times, ending wherever the timing landed. On a gate it is a
 * barrier motor reversed every 600 ms under load.
 *
 * It is also wrong at boot. A press cannot begin before the device is running,
 * and GPIO0 is a strapping pin — usually on an RC network, often wired to an
 * auto-reset circuit — that can sit low for seconds while the rail comes up.
 * `_pollResetButton` in CircuventDevice refuses to arm until it has seen the
 * pin released, and says why at length. A sketch reading the same pin its own
 * way put that bug straight back.
 *
 * `CvTapButton` is the one implementation of the rule. These assertions check
 * that every sketch sharing the pin uses it, and nobody quietly reintroduces
 * the level test.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const firmware = path.join(root, "firmware");

const library = fs.readFileSync(
  path.join(firmware, "CircuventDevice", "CircuventDevice.h"),
  "utf8",
);

function sketches(): Array<{ name: string; src: string }> {
  return fs
    .readdirSync(firmware, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "CircuventDevice")
    .map((e) => {
      const dir = path.join(firmware, e.name);
      const ino = fs.readdirSync(dir).find((f) => f.endsWith(".ino"));
      return ino
        ? { name: e.name, src: fs.readFileSync(path.join(dir, ino), "utf8") }
        : null;
    })
    .filter((x): x is { name: string; src: string } => x !== null);
}

/** Sketches that put a local button on the same pin as the reset gesture. */
function sharesResetPin(src: string): boolean {
  const btn = /#define\s+BTN_PIN\s+(\S+)/.exec(src);
  const reset = /setResetButton\((\d+)/.exec(src);
  return !!btn && !!reset && btn[1].trim() === reset[1].trim();
}

describe("CvTapButton is the single implementation of the shared-pin rule", () => {
  it("exists in the library", () => {
    expect(library).toMatch(/struct CvTapButton/);
  });

  it("refuses to arm until the pin has been seen released", () => {
    /*
     * Without this a pin held low at boot is read as a press that began at the
     * first pass of loop(), and releasing it produces a tap nobody made. After
     * a power cut that means the door unlocked itself.
     */
    const body = library.slice(library.indexOf("struct CvTapButton"));
    expect(body).toMatch(/if\s*\(!_armed\)/);
    expect(body).toMatch(/if\s*\(!down\)\s*_armed = true;/);
  });

  it("acts on release, and only inside the tap window", () => {
    const body = library.slice(library.indexOf("struct CvTapButton"));
    // Falling edge starts the clock; the rising edge decides.
    expect(body).toMatch(/down && !_down/);
    expect(body).toMatch(/!down && _down/);
    expect(body).toMatch(/held >= _min && held < _max/);
  });
});

describe("every sketch sharing GPIO0 uses it", () => {
  const shared = sketches().filter((s) => sharesResetPin(s.src));

  it("finds the sketches that share the pin", () => {
    // If this shrinks, a device stopped sharing the pin — fine. If it grows,
    // the new sketch must be covered by the assertions below, which it will be
    // automatically; this list is here so the growth is noticed and reviewed.
    expect(shared.map((s) => s.name).sort()).toEqual([
      "aquaguard",
      "rfid-gate",
      "smart-fan",
      "smart-light",
      "smart-lock",
      "smart-plug",
      "watertank",
    ]);
  });

  for (const { name, src } of shared) {
    it(`${name} does not level-test the button`, () => {
      /*
       * The exact shape of the bug: a bare digitalRead of BTN_PIN gated only by
       * elapsed time. Edge detection reads the pin into a variable and compares
       * it against the previous sample instead.
       */
      expect(src).not.toMatch(/digitalRead\(BTN_PIN\)\s*==\s*LOW\s*&&\s*millis\(\)\s*-\s*lastBtn/);
    });

    it(`${name} uses CvTapButton`, () => {
      expect(src).toMatch(/CvTapButton\s+\w+;/);
      expect(src).toMatch(/\.begin\(BTN_PIN/);
      expect(src).toMatch(/\.tapped\(\)/);
    });
  }
});
