/**
 * Fan speed, across the three places that have to agree.
 *
 * The app, the command map and the firmware each hold a copy of what a fan
 * speed means, and they are only correct together. The failure this guards
 * against has already happened on this product: the camera accepted rules that
 * saved, listed, scheduled and fired, and changed nothing, because the command
 * being published used a key the firmware never read. Nothing reported an
 * error at any point.
 *
 * Two functions matter and they are easy to confuse, which is itself worth a
 * test. buildFieldCommand turns a control into the command that goes on the
 * wire. projectCommand says what the firmware would do with a command. A fix
 * applied to only one of them looks complete and is not — the first version of
 * this change updated projectCommand alone, so the slider produced a command
 * carrying a key no installed fan reads.
 */
import { buildFieldCommand, projectCommand, levelToSpeed, FAN_STEP_LEVEL } from "./smarthome-command-map";

/** Keys firmware/smart-fan.ino reads in onCommand(). */
const FIRMWARE_KEYS = new Set(["action", "power", "speed", "level"]);

const fromSlider = (field: string, value: number) => buildFieldCommand("smart-fan", field, value);
const applied = (cmd: Record<string, unknown>) => projectCommand("smart-fan", { action: "set", ...cmd });

describe("what the slider puts on the wire", () => {
  it("produces a command at all — null is a control that does nothing", () => {
    expect(fromSlider("level", 50)).not.toBeNull();
  });

  it("uses only keys the firmware reads", () => {
    for (const key of Object.keys(fromSlider("level", 50)!)) {
      expect(FIRMWARE_KEYS.has(key)).toBe(true);
    }
  });

  it("sends BOTH level and speed, so a fan that has not been updated still responds", () => {
    // Installed firmware reads `speed` and silently ignores anything else. A
    // command carrying only `level` would move the slider, report success and
    // change nothing.
    const cmd = fromSlider("level", 50)!;
    expect(cmd).toHaveProperty("level", 50);
    expect(cmd).toHaveProperty("speed");
  });

  it("derives a speed meaning the same airflow as the level", () => {
    expect(fromSlider("level", 0)!.speed).toBe(0);
    expect(fromSlider("level", 33)!.speed).toBe(1);
    expect(fromSlider("level", 66)!.speed).toBe(2);
    expect(fromSlider("level", 100)!.speed).toBe(3);
  });

  it("still works when a control asks in the old units", () => {
    // Scenes, schedules and the automation builder all speak `speed`.
    const cmd = fromSlider("speed", 2)!;
    expect(cmd.speed).toBe(2);
    expect(cmd.level).toBe(FAN_STEP_LEVEL[2]);
  });

  it("clamps to the range the firmware accepts", () => {
    expect(fromSlider("level", 400)!.level).toBe(100);
    expect(fromSlider("level", -20)!.level).toBe(0);
    expect(fromSlider("speed", 9)!.speed).toBe(3);
  });

  it("rounds, because the firmware reads an int", () => {
    expect(fromSlider("level", 47.6)!.level).toBe(48);
  });

  it("refuses a value that is not a number rather than publishing NaN", () => {
    expect(fromSlider("level", Number.NaN)).toBeNull();
  });

  it("carries the action, without which the sketch ignores the whole message", () => {
    expect(fromSlider("level", 50)!.action).toBe("set");
  });
});

describe("what the firmware does with it", () => {
  it("applies the speed", () => {
    expect(applied({ level: 50, speed: 2 }).speed).toBe(2);
  });

  it("does NOT promise a level, because older fans never report one", () => {
    // A projection is a promise about the state the device will publish, and
    // patchSatisfied requires every projected key to match before a command is
    // considered confirmed. A fan on the previous firmware publishes `speed`
    // and never `level`, so projecting `level` would leave every command from
    // this slider pending forever on exactly the devices the dual-key command
    // exists to support.
    expect(applied({ level: 50 })).not.toHaveProperty("level");
  });

  it("prefers level when both arrive, because it is the precise one", () => {
    expect(applied({ level: 80, speed: 1 }).speed).toBe(levelToSpeed(80));
  });

  it("turns the fan on when a speed is set on a fan that is off", () => {
    // Otherwise dragging the slider does nothing until the user also finds the
    // power switch.
    expect(applied({ level: 40 }).power).toBe(true);
  });

  it("turns the fan off at zero", () => {
    expect(applied({ level: 0 }).power).toBe(false);
  });

  it("lets an explicit power in the same command win", () => {
    expect(applied({ level: 40, power: false }).power).toBe(false);
  });

  it("accepts a bare legacy speed", () => {
    expect(applied({ speed: 2 }).speed).toBe(2);
  });
});

describe("the round trip", () => {
  it.each([0, 1, 15, 33, 50, 66, 80, 100])("a slider at %i%% confirms against the step the device reports", (value) => {
    const cmd = fromSlider("level", value)!;
    expect(applied(cmd).speed).toBe(levelToSpeed(value));
  });
});

describe("levelToSpeed", () => {
  it("matches the firmware's nearest-step rule", () => {
    expect(levelToSpeed(0)).toBe(0);
    expect(levelToSpeed(1)).toBe(1);
    expect(levelToSpeed(45)).toBe(1);
    expect(levelToSpeed(50)).toBe(2);
    expect(levelToSpeed(85)).toBe(3);
    expect(levelToSpeed(100)).toBe(3);
  });

  it("treats a non-number as off rather than throwing", () => {
    expect(levelToSpeed(Number.NaN)).toBe(0);
  });
});

/**
 * The duty curve, ported.
 *
 * This is not a compile. There is no ESP32 toolchain on the machine that
 * builds this, so the sketch itself is unverified by a compiler here; what
 * these check is the arithmetic, transcribed exactly from levelToDuty() in
 * firmware/smart-fan/smart-fan.ino. Integer division and an off-by-one at the
 * ends are the mistakes that would survive review and then show up as a fan
 * that will not reach full speed, or one that stalls at the bottom of the
 * slider.
 */
const MIN_DUTY = 85;
const MAX_DUTY = 255;
function levelToDuty(pct: number): number {
  if (pct <= 0) return 0;
  if (pct > 100) pct = 100;
  return MIN_DUTY + Math.trunc(((pct - 1) * (MAX_DUTY - MIN_DUTY)) / 99);
}

describe("firmware duty curve", () => {
  it("is off at zero, and only at zero", () => {
    expect(levelToDuty(0)).toBe(0);
    expect(levelToDuty(1)).toBeGreaterThan(0);
  });

  it("never lands between off and the stall floor", () => {
    // A fan motor below roughly a third of duty does not turn slowly, it
    // stalls: it hums and draws locked-rotor current through a winding its own
    // airflow is no longer cooling. There is no usable value in that gap, so
    // the scale must not produce one.
    for (let pct = 1; pct <= 100; pct++) {
      expect(levelToDuty(pct)).toBeGreaterThanOrEqual(MIN_DUTY);
    }
  });

  it("reaches full duty at 100, and does not exceed it", () => {
    expect(levelToDuty(100)).toBe(MAX_DUTY);
    expect(levelToDuty(200)).toBe(MAX_DUTY);
  });

  it("rises monotonically, so a higher setting is never slower", () => {
    for (let pct = 2; pct <= 100; pct++) {
      expect(levelToDuty(pct)).toBeGreaterThanOrEqual(levelToDuty(pct - 1));
    }
  });

  it("puts the named steps where the app says they are", () => {
    // Low/Medium/High in the UI must be the same airflow the button gives.
    expect(levelToDuty(FAN_STEP_LEVEL[1])).toBeGreaterThan(MIN_DUTY);
    expect(levelToDuty(FAN_STEP_LEVEL[3])).toBe(MAX_DUTY);
  });

  it("stays inside a byte, since ledcWrite takes 8-bit duty", () => {
    for (let pct = 0; pct <= 100; pct++) {
      const d = levelToDuty(pct);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(255);
    }
  });
});
