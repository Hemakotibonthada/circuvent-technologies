/**
 * Every sketch must declare its firmware version before it includes the library.
 *
 * THE BUG THIS EXISTS FOR
 *
 * `CircuventDevice.h` guards its own default:
 *
 *     #ifndef CV_FW_VERSION
 *     #define CV_FW_VERSION "1.0.0"
 *     #endif
 *
 * So a sketch that writes `#define CV_FW_VERSION "1.1.0"` *after* the include
 * has already lost. The header ran first, settled on 1.0.0, and every use
 * inside the library — the heartbeat, the status payload, the OTA guard — was
 * compiled against that. The sketch's own define is dead text.
 *
 * WHY THIS IS WORTH A TEST RATHER THAN CARE
 *
 * Nothing about it looks wrong. It compiles without error, the device boots,
 * the reader reads, and the only symptom is a number on a screen that nobody
 * has a reason to distrust. It cost a real debugging session on `rfid-only`:
 *
 *   - The OTA was dispatched and the console showed it delivered.
 *   - The device downloaded it, rebooted, and came back reporting 1.0.0.
 *   - Which looks exactly like an update that failed and rolled back.
 *
 * It had not failed. The new code was running perfectly; it was simply
 * introducing itself with the old version. The chase went to the R2 artefact,
 * the publish script and the broker before the ordering turned out to be it.
 *
 * The second-order damage is worse than a wrong label. The library's guard is
 *
 *     if (newVer.length() && newVer == CV_FW_VERSION) return;   // already there
 *
 * A device permanently reporting 1.0.0 never matches the version being offered,
 * so it accepts the same update every time it is sent, reboots, and reports no
 * progress. A fleet-wide OTA would put those devices in a reboot loop that
 * reads, from the console, as devices that simply refuse to update.
 */
import fs from "node:fs";
import path from "node:path";

const firmware = path.join(__dirname, "..", "firmware");

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

/**
 * Line numbers ignoring commented-out occurrences.
 *
 * The explanatory comment above the define in `rfid-only` mentions
 * `CV_FW_VERSION` several times, and a naive `indexOf` would match the prose
 * rather than the directive — a test that passes for the wrong reason.
 */
function directiveLine(src: string, re: RegExp): number {
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("*") || line.startsWith("//") || line.startsWith("/*")) continue;
    if (re.test(line)) return i + 1;
  }
  return -1;
}

describe("firmware version defines", () => {
  const all = sketches();

  it("finds the sketches at all", () => {
    // A glob that silently matches nothing would make every assertion below
    // vacuously true, which is the failure mode of this whole style of test.
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(all.map((s) => [s.name, s.src] as const))(
    "%s defines CV_FW_VERSION before including CircuventDevice.h",
    (name, src) => {
      const define = directiveLine(src, /^#\s*define\s+CV_FW_VERSION\b/);
      const include = directiveLine(src, /^#\s*include\s*<CircuventDevice\.h>/);

      expect(define).toBeGreaterThan(0);
      if (include < 0) return; // a few sketches vendor the header differently

      expect({ sketch: name, define, include, ordered: define < include }).toEqual({
        sketch: name,
        define,
        include,
        ordered: true,
      });
    }
  );

  it("the library still guards its default, which is why order matters", () => {
    const header = fs.readFileSync(
      path.join(firmware, "CircuventDevice", "CircuventDevice.h"),
      "utf8"
    );
    // If this guard were ever removed the ordering rule would stop mattering,
    // and this test would be enforcing a rule that no longer exists.
    expect(header).toMatch(/#ifndef\s+CV_FW_VERSION\s*\n\s*#define\s+CV_FW_VERSION/);
  });
});
