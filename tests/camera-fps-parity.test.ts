/**
 * The camera's frame rate is decided in four places that cannot import each
 * other, and it only takes one of them to hold the whole thing at 3 fps.
 *
 * That is not hypothetical. A console reported "UXGA · 44 KB · 3 fps" over a
 * relay that was working perfectly, and the cause was three independent,
 * individually-defensible settings multiplying together:
 *
 *   - one resolution governed both stills and video, so a UXGA snapshot
 *     setting made every streamed frame 1600x1200;
 *   - XCLK ran at half the driver's standard, roughly doubling sensor readout;
 *   - fb_count was 1, so capture could not overlap the TLS publish.
 *
 * None of them errored. None of them logged. The camera published frames
 * exactly as designed and the number on screen was simply low.
 *
 * These assertions pin the settings that make 24 fps reachable, and the
 * agreement between the firmware's ceiling and the sliders that are supposed
 * to reach it. A slider that cannot request what the firmware supports is the
 * house's favourite bug — a control that looks present and quietly does less
 * than it says.
 */
import fs from "node:fs";
import path from "node:path";

/* tests/ sits at the repo root, so one level up is the repo — not two. */
const root = path.join(__dirname, "..");

const firmware = fs.readFileSync(
  path.join(root, "firmware", "camera", "camera.ino"),
  "utf8"
);
const cameraConsole = fs.readFileSync(
  path.join(root, "src", "app", "smarthome", "camera", "CameraConsole.tsx"),
  "utf8"
);
const deviceControls = fs.readFileSync(
  path.join(root, "src", "app", "smarthome", "DeviceControls.tsx"),
  "utf8"
);
const mobileCameras = fs.readFileSync(
  path.join(root, "mobile", "src", "screens", "more", "Cameras.tsx"),
  "utf8"
);
const mobileControl = fs.readFileSync(
  path.join(root, "mobile", "src", "screens", "Control.tsx"),
  "utf8"
);
const mobileCameraLib = fs.readFileSync(
  path.join(root, "mobile", "src", "cameras.ts"),
  "utf8"
);

/** Reads `#define NAME value` out of the sketch. */
function define(name: string): string {
  const m = firmware.match(new RegExp(`#define\\s+${name}\\s+(\\S+)`));
  if (!m) throw new Error(`${name} is no longer defined in camera.ino`);
  return m[1];
}

describe("camera frame rate", () => {
  describe("nothing between the sensor and the screen caps the rate", () => {
    it("does not let the relay drop frames the firmware is allowed to send", () => {
      /*
       * mqtt.ts carried MAX_FPS = 30, which quietly made it the real frame-rate
       * limit of the whole product: a camera asked for 60 would capture, encrypt
       * and publish 60, and the relay threw every other one away before it
       * reached a socket. The device had no way to learn that, so it kept paying
       * for frames nobody would ever see.
       */
      const relay = fs.readFileSync(
        path.join(root, "platform", "api", "src", "mqtt.ts"),
        "utf8"
      );
      const m = relay.match(/const MAX_FPS\s*=\s*(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(Number(define("FPS_MAX")));
    });

    it("relays frames as bytes rather than base64 JSON", () => {
      /*
       * base64 costs an encode per frame and a third more bytes on the one link
       * where bytes are the product. The JSON shape stays for clients already in
       * the field, so both paths have to remain.
       */
      const ws = fs.readFileSync(path.join(root, "platform", "api", "src", "ws.ts"), "utf8");
      expect(ws).toMatch(/export function encodeFrame/);
      expect(ws).toMatch(/binaryFrames/);
      // The fallback must survive: removing it turns off video for every app
      // and browser currently installed.
      expect(ws).toMatch(/toString\("base64"\)/);
    });

    it("has the browser ask for binary and read it back", () => {
      const live = fs.readFileSync(path.join(root, "src", "lib", "control-plane-live.ts"), "utf8");
      expect(live).toMatch(/binaryType\s*=\s*"arraybuffer"/);
      expect(live).toMatch(/binaryFrames:\s*true/);
    });

    it("renders frames from object URLs and releases them", () => {
      /*
       * A blob URL lives as long as the document. At thirty frames a second an
       * un-revoked one leaks thirty JPEGs a second, and the tab dies during the
       * incident somebody opened the camera to watch. The rule lives in one hook
       * so three surfaces cannot each get it half right.
       */
      const hook = fs.readFileSync(
        path.join(root, "src", "app", "smarthome", "useFrameUrl.ts"),
        "utf8"
      );
      expect(hook).toMatch(/revokeObjectURL/);
      for (const f of ["DeviceControls.tsx", "camera/CameraConsole.tsx", "security/CamerasPanel.tsx"]) {
        const src = fs.readFileSync(path.join(root, "src", "app", "smarthome", f), "utf8");
        expect(src).toMatch(/useFrameUrl/);
        // No surface may go back to building a data URL per frame.
        expect(src).not.toMatch(/data:image\/jpeg;base64,\$\{/);
      }
    });

    it("cuts the per-frame TLS cost in the firmware", () => {
      /*
       * Every chunk is its own TLS record with a header, a MAC and a pass
       * through mbedtls. At 1 KB a 22 KB frame paid that twenty-two times, and
       * it is a per-frame cost — exactly what stops a camera going faster once
       * the sensor no longer is.
       */
      const lib = fs.readFileSync(
        path.join(root, "firmware", "CircuventDevice", "CircuventDevice.h"),
        "utf8"
      );
      const m = lib.match(/#define CV_PUBLISH_CHUNK\s+(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(4096);
    });

    it("adapts quality to hold the requested rate instead of quietly missing it", () => {
      expect(firmware).toMatch(/void adaptTick/);
      expect(firmware).toMatch(/cv\.set\("achievedFps"/);
      // Measured, not requested: reporting the target back would be reporting a
      // wish as a result.
      expect(firmware).toMatch(/lastAchieved/);
    });
  });

  describe("the firmware can actually produce 24 fps", () => {
    it("pipelines capture against transmit with two frame buffers", () => {
      /*
       * With fb_count = 1 the driver cannot expose frame N+1 until the
       * application returns frame N, and sendFrame() does not return it until
       * the frame has been pushed through TLS. Capture and publish become
       * strictly serial, so the period is capture + publish when it only ever
       * needed to be max(capture, publish). This single line was worth roughly
       * a factor of two and no network tuning could have found it.
       */
      expect(firmware).toMatch(/c\.fb_count\s*=\s*canDoubleBuffer \? 2 : 1;/);
    });

    it("only takes the second buffer where it can be allocated", () => {
      /*
       * Taking it unconditionally was a landmine, not a bug. Two buffers at
       * UXGA cannot be allocated, and the failure is silent: init succeeds, the
       * sensor answers, sensorPid reads back, and no frame ever arrives — so
       * the camera disables itself. Nothing goes wrong when the resolution is
       * changed, so it detonates on the next reboot, which may be weeks later
       * and looks exactly like failed hardware.
       */
      expect(firmware).toMatch(/canDoubleBuffer\s*=\s*bootSize <= FRAMESIZE_SVGA/);
    });

    it("lowers the picture before giving up the camera", () => {
      /*
       * A capture can fail because the ribbon is unseated — nothing helps — or
       * because the configured size cannot be allocated, which the device can
       * fix itself. The two look identical from the firmware, so the cheap
       * remedy is tried first. A camera must not disable itself over a setting
       * in a house nobody can visit.
       */
      expect(firmware).toMatch(/resolutionFault/);
      expect(firmware).toMatch(/retrying at/);
    });

    it("takes the newest frame rather than the oldest", () => {
      /*
       * With a queue of two, CAMERA_GRAB_WHEN_EMPTY hands back the older
       * frame, so live video runs a frame behind and drifts further under
       * load. For video a late frame is worthless — the same reasoning that
       * already makes frames QoS 0 and never retained.
       */
      expect(firmware).toMatch(/c\.grab_mode\s*=\s*canDoubleBuffer \? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;/);
    });

    it("runs the sensor clock at the driver's standard 20 MHz", () => {
      /*
       * 10 MHz roughly doubles the time the sensor needs to read a frame out,
       * which puts a ceiling under the frame rate that nothing downstream can
       * lift. Lowering it fleet-wide is what cost this camera half its speed;
       * a board that genuinely needs it gets -DCV_CAM_XCLK_HZ=10000000.
       */
      expect(Number(define("CV_CAM_XCLK_HZ"))).toBe(20_000_000);
    });

    it("caps the streaming resolution below the sensor's still size", () => {
      /*
       * An OV2640 cannot read out, encode and publish a 1600x1200 frame 24
       * times a second; it tops out near 5 fps at UXGA regardless of the
       * network. Stills keep the full chosen resolution — see
       * applySensorSettings() — but video gets a size that can hold the rate.
       */
      const cap = define("STREAM_RES_MAX").replace(/"/g, "");
      expect(["VGA", "SVGA"]).toContain(cap);
    });

    it("defaults to a frame rate somebody would call video", () => {
      // The default is what every camera in the field runs at, because almost
      // nobody opens the slider.
      expect(Number(define("FPS_DEFAULT"))).toBeGreaterThanOrEqual(24);
    });

    it("keeps the default within the ceiling it is allowed to ask for", () => {
      expect(Number(define("FPS_DEFAULT"))).toBeLessThanOrEqual(
        Number(define("FPS_MAX"))
      );
    });

    it("raises the frame rate on cameras that never chose one", () => {      /*
       * A default only applies to a device with nothing stored, and every
       * camera already in a house has `fps` in NVS. Without a migration this
       * change would have shipped as an OTA that improved nothing at all on
       * the installed fleet while passing every other assertion here.
       *
       * The migration is deliberately narrow — it moves a stored value only
       * when it equals the previous default, which is the one value a user
       * cannot have chosen on purpose — and it records that it ran so a
       * deliberate 8 survives the next reboot.
       */
      expect(firmware).toMatch(/FPS_PREVIOUS_DEFAULT\s*=\s*8/);
      expect(firmware).toMatch(/store\.putInt\("fpsv"/);
      expect(firmware).toMatch(/store\.getInt\("fpsv", 0\)\s*<\s*1/);
    });
  });

  describe("the console can ask for what the firmware supports", () => {
    /** The `max={N}` of the control carrying `label`/`suffix` fps. */
    function sliderMax(src: string, label: string): number {
      const block = src.slice(src.indexOf(label));
      const m = block.match(/max=\{(\d+)\}/);
      if (!m) throw new Error(`no max found after "${label}"`);
      return Number(m[1]);
    }

    it("offers the full range on the camera console", () => {
      /*
       * This read max={15} while the firmware accepted 30, so the one screen
       * dedicated to cameras was the one screen that could not ask for the
       * frame rate the device supported. The device silently constrains
       * whatever it is sent, so the slider looked correct at every position.
       */
      expect(sliderMax(cameraConsole, "Live frame rate")).toBe(
        Number(define("FPS_MAX"))
      );
    });

    it("offers the full range on the device page", () => {
      expect(sliderMax(deviceControls, "Frame rate")).toBe(
        Number(define("FPS_MAX"))
      );
    });
  });

  describe("the phone can ask for what the firmware supports", () => {
    /** Highest value in a `const NAME = [...] as const` list. */
    function listMax(src: string, name: string): number {
      const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]+)\\]`));
      if (!m) throw new Error(`${name} not found`);
      return Math.max(...m[1].split(",").map((v) => Number(v.trim())));
    }

    it("offers the full range on the camera wall", () => {
      /*
       * This capped at 15 under a comment asserting the firmware did. It does
       * not. Control.tsx had already been corrected and this screen had not,
       * so the two screens in the same app disagreed about the same hardware —
       * and the one that disagreed was the one people actually watch cameras
       * on.
       */
      expect(listMax(mobileCameras, "FPS_OPTIONS")).toBe(Number(define("FPS_MAX")));
    });

    it("offers the full range on the device control sheet", () => {
      expect(listMax(mobileControl, "CAM_FPS")).toBe(Number(define("FPS_MAX")));
    });

    it("does not still claim the firmware stops at 15", () => {
      // The belief outlived the code twice. Fail if it is written down again.
      for (const src of [mobileCameras, mobileControl]) {
        expect(src).not.toMatch(/clamps to 15\s*fps/i);
      }
    });
  });

  describe("the console does not clamp what the firmware allows", () => {
    /*
     * The sliders read their maximum from the sketch, so they were already
     * right. CAM_FPS_MAX is a second, independent copy of the same limit, and
     * it is the one that decides what a command projects to — so when it fell
     * behind, the slider offered 60, the device ran 60, and the console put 30
     * on the screen.
     *
     * This drifted at 15-vs-30 and again at 30-vs-60. Both times the symptom
     * was a number quietly corrected to a smaller one, which is invisible
     * unless you are looking for it. Asserting the value against the sketch is
     * the only version of this check that cannot go stale.
     */
    const commandMap = fs.readFileSync(
      path.join(root, "src", "lib", "smarthome-command-map.ts"),
      "utf8"
    );

    /** Value of an exported `const NAME = <number>`. */
    function constant(src: string, name: string): number {
      const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
      if (!m) throw new Error(`${name} not found`);
      return Number(m[1]);
    }

    it("caps projected frame rate at the firmware's limit, not below it", () => {
      expect(constant(commandMap, "CAM_FPS_MAX")).toBe(Number(define("FPS_MAX")));
    });

    it("offers presets that reach the firmware's limit", () => {
      const presets = commandMap.match(/CAM_FPS_PRESETS\s*=\s*\[([^\]]+)\]/);
      if (!presets) throw new Error("CAM_FPS_PRESETS not found");
      const max = Math.max(...presets[1].split(",").map((v) => Number(v.trim())));
      expect(max).toBe(Number(define("FPS_MAX")));
    });

    it("does not write the ceiling down as a number in prose", () => {
      /*
       * Each stale comment named the then-current limit, so it read as
       * authoritative long after it stopped being true. Comments may point at
       * the sketch; they may not restate its value.
       */
      for (const src of [mobileCameras, mobileControl, commandMap]) {
        expect(src).not.toMatch(/FPS_MAX\s+\d+/);
      }
    });
  });

  describe("the picture is labelled with the size it actually is", () => {
    it("publishes the streaming resolution, not only the chosen one", () => {
      /*
       * Frames leave at the streaming size while somebody is watching. Without
       * this key the console would caption an 800x600 stream "UXGA" — a
       * statement a person measuring the picture would trust over their own
       * eyes.
       */
      expect(firmware).toMatch(/cv\.set\("streamResolution"/);
    });

    it("reads that key in the console overlay", () => {
      expect(deviceControls).toMatch(/streamResolution/);
    });

    it("still labels older firmware from the chosen resolution", () => {
      /*
       * Cameras in the field do not publish streamResolution. Absence is not
       * evidence that a stream is downscaled, and treating it as such would
       * mislabel every camera that has not taken the update yet.
       */
      expect(deviceControls).toMatch(/function effectiveResolution/);
    });

    it("keeps the phone's copy of that rule, since it cannot import one", () => {
      /*
       * The app and the site are separate TypeScript projects. Duplication is
       * correct here; drift is not, and the console learning something the
       * camera wall does not is precisely how one surface ends up captioning a
       * picture differently from the other.
       */
      expect(mobileCameraLib).toMatch(/export function effectiveResolution/);
      expect(mobileCameras).toMatch(/effectiveResolution\(/);
    });

    it("has both copies fall back rather than assume a downscale", () => {
      for (const src of [deviceControls, mobileCameraLib]) {
        expect(src).toMatch(/if \(!live\) return chosen;/);
      }
    });
  });
});
