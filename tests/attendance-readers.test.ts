/**
 * Which device types count as attendance readers.
 *
 * This exists because the list used to be four separate string literals — the
 * presence check that decides whether the Attendance section appears, the
 * picker that offers a device for registration, the console device tile and
 * the shop icon. Adding the second reader model meant finding all four.
 *
 * Missing one is silent in the worst direction: a reader that is plugged in,
 * online and reading cards, which the console offers no way to register, so
 * every scan is discarded with no error anywhere on the way.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ATTENDANCE_READER_TYPES, isAttendanceReader } from "@/lib/attendance-readers";

describe("isAttendanceReader", () => {
  it("accepts both models", () => {
    expect(isAttendanceReader("rfid-attend")).toBe(true);
    expect(isAttendanceReader("rfid-only")).toBe(true);
  });

  /*
   * rfid-gate is a barrier for vehicles. It reads tags, so it is the plausible
   * mistake — but it belongs to Security and feeds no register.
   */
  it("does not accept a reader that is not an attendance reader", () => {
    expect(isAttendanceReader("rfid-gate")).toBe(false);
    expect(isAttendanceReader("facedoor")).toBe(false);
    expect(isAttendanceReader("camera")).toBe(false);
  });

  it("is safe on a missing type", () => {
    expect(isAttendanceReader(null)).toBe(false);
    expect(isAttendanceReader(undefined)).toBe(false);
    expect(isAttendanceReader("")).toBe(false);
  });
});

describe("every reader model is wired into the console", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  /*
   * The four places a reader has to appear. Asserted against the source rather
   * than by rendering, because the failure is a missing map entry rather than
   * a broken component — and a missing entry renders perfectly, just as
   * something else.
   */
  it.each(ATTENDANCE_READER_TYPES)("%s has a console device tile", (type) => {
    expect(read("src/app/smarthome/DeviceControls.tsx")).toContain(`"${type}":`);
  });

  it.each(ATTENDANCE_READER_TYPES)("%s has a shop icon", (type) => {
    expect(read("src/app/shop/devices/page.tsx")).toContain(`"${type}":`);
  });

  it.each(ATTENDANCE_READER_TYPES)("%s has mobile metadata", (type) => {
    expect(read("mobile/src/theme.ts")).toContain(`"${type}":`);
  });

  /*
   * The two that decide whether a reader is reachable at all: the section has
   * to appear, and the device has to be offered for registration. Both now go
   * through the shared predicate, so this asserts the literal is gone rather
   * than that the predicate is called.
   */
  it("finds readers through the shared predicate, not a pinned type", () => {
    const hooks = read("src/app/smarthome/_data/hooks.ts");
    const panel = read("src/app/smarthome/attendance/AttendancePanel.tsx");
    expect(hooks).toContain("isAttendanceReader");
    expect(panel).toContain("isAttendanceReader");
    expect(hooks).not.toContain('d.type === "rfid-attend"');
    expect(panel).not.toContain('d.type === "rfid-attend"');
  });
});
