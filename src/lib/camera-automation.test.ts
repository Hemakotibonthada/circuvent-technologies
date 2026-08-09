import { buildFieldCommand, readFieldCommand, projectCommand, CAM_FPS_MAX } from "./smarthome-command-map";
import { getCommandFields } from "@/app/smarthome/automation/describe";

/*
 * A rule aimed at a camera used to save and then do nothing.
 *
 * getCommandFields had no camera case, so a camera fell through to the default
 * and the rule builder offered one command: "Power". The camera sketch never
 * reads `power`. The rule was stored, showed a next-run time, ran on schedule,
 * published {action:"set", power:true}, and the camera ignored it -- which
 * looks identical to a working rule right up until you check the camera.
 *
 * These tests tie the three layers together: what the builder offers, what the
 * command map emits, and what firmware/camera/camera.ino actually parses.
 */

/** Exactly the keys camera.ino reads inside its `set` handler. */
const FIRMWARE_SET_KEYS = ["resolution", "quality", "rotation", "fps", "flash", "motion", "sensitivity", "streaming"];

describe("camera automations", () => {
  const fields = getCommandFields("camera");

  it("offers commands at all", () => {
    expect(fields.length).toBeGreaterThan(1);
  });

  it("offers only commands the firmware reads", () => {
    for (const f of fields) {
      expect(FIRMWARE_SET_KEYS).toContain(f.key);
    }
  });

  it("does not offer power, which the camera has no concept of", () => {
    expect(fields.map((f) => f.key)).not.toContain("power");
  });

  it.each([
    ["streaming", true],
    ["motion", false],
    ["fps", 30],
    ["quality", 12],
    ["flash", 40],
    ["sensitivity", 60],
    ["resolution", "vga"],
    ["rotation", "180"],
  ] as const)("builds a command for %s that the firmware would parse", (field, value) => {
    const cmd = buildFieldCommand("camera", field, value);
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("set");

    const key = Object.keys(cmd!).find((k) => k !== "action")!;
    expect(FIRMWARE_SET_KEYS).toContain(key);

    // The sketch type-checks each key. rotation is `.is<int>()`, so a string
    // there would be accepted by the broker and dropped by the device.
    const sent = (cmd as Record<string, unknown>)[key];
    if (["fps", "quality", "flash", "sensitivity", "rotation"].includes(key)) {
      expect(typeof sent).toBe("number");
    }
    if (["streaming", "motion"].includes(key)) expect(typeof sent).toBe("boolean");
    if (key === "resolution") expect(typeof sent).toBe("string");
  });

  it("round-trips rotation back to the string the select uses", () => {
    const cmd = buildFieldCommand("camera", "rotation", "180")!;
    expect(readFieldCommand("camera", cmd)).toEqual({ field: "rotation", value: "180" });
  });

  it("rejects a field the camera does not have", () => {
    expect(buildFieldCommand("camera", "power", true)).toBeNull();
  });

  it("projects 30 fps without clamping it back down", () => {
    // Was clamped to 15 here while the firmware's FPS_MAX is 30, so the console
    // overwrote the device's real value with a smaller one.
    const patch = projectCommand("camera", { action: "set", fps: 30 });
    expect(patch.fps).toBe(30);
    expect(CAM_FPS_MAX).toBe(30);
  });

  it("still clamps beyond what the firmware accepts", () => {
    expect(projectCommand("camera", { action: "set", fps: 99 }).fps).toBe(30);
    expect(projectCommand("camera", { action: "set", fps: 0 }).fps).toBe(1);
  });
});
