/**
 * The meter's command contract.
 *
 * A meter is the one device class where the dangerous mistake is offering a
 * control at all. Every interesting value it publishes — watts, amps, volts,
 * power factor, kWh — is the output of a measurement, and a command that
 * appeared to set one would be the console lying about physics. The generic
 * fall-through in buildFieldCommand would happily produce
 * { action:"set", watts: 500 }, the sketch would ignore it, and the result is
 * a control that looks like it works and does nothing.
 */
import { buildFieldCommand, projectCommand } from "./smarthome-command-map";

/** Verbs firmware/meter/meter.ino switches on in onCommand(). */
const FIRMWARE_ACTIONS = new Set(["calibrate", "reset"]);

describe("a meter refuses to pretend it can be set", () => {
  it.each(["watts", "amps", "volts", "pf", "kwh", "wattsTotal", "power"])(
    "refuses to build a command for %s",
    (field) => {
      expect(buildFieldCommand("meter", field, 500)).toBeNull();
    }
  );

  it("refuses on the three-channel board too", () => {
    expect(buildFieldCommand("meter-3ch", "watts2", 500)).toBeNull();
  });
});

describe("the two things it does accept", () => {
  it("resets a single channel, addressed the way the sketch reads it", () => {
    const cmd = buildFieldCommand("meter", "reset", 1)!;
    expect(cmd.action).toBe("reset");
    expect(cmd.ch).toBe(1);
  });

  it("resets every channel when none is named", () => {
    const cmd = buildFieldCommand("meter", "reset", -1)!;
    expect(cmd.action).toBe("reset");
    expect(cmd.ch).toBeUndefined();
  });

  it("carries a calibration trim as the quantity being trimmed", () => {
    expect(buildFieldCommand("meter", "calibrateWatts", 1000)).toEqual({ action: "calibrate", watts: 1000 });
    expect(buildFieldCommand("meter", "calibrateVolts", 230)).toEqual({ action: "calibrate", volts: 230 });
    expect(buildFieldCommand("meter", "calibrateAmps", 4.3)).toEqual({ action: "calibrate", amps: 4.3 });
  });

  it("refuses a calibration against a meaningless reference", () => {
    // Trimming against zero would divide the multiplier into nothing.
    expect(buildFieldCommand("meter", "calibrateWatts", 0)).toBeNull();
    expect(buildFieldCommand("meter", "calibrateWatts", Number.NaN)).toBeNull();
  });

  it("only uses verbs the sketch actually switches on", () => {
    for (const field of ["reset", "calibrateWatts"]) {
      const cmd = buildFieldCommand("meter", field, 1)!;
      expect(FIRMWARE_ACTIONS.has(String(cmd.action))).toBe(true);
    }
  });
});

describe("what a meter command changes", () => {
  it("projects a cleared total for the channel named", () => {
    expect(projectCommand("meter", { action: "reset", ch: 1 })).toEqual({ kwh2: 0 });
  });

  it("projects every total cleared when no channel is named", () => {
    expect(projectCommand("meter", { action: "reset" })).toEqual({ kwh: 0, kwh2: 0, kwh3: 0 });
  });

  it("projects nothing for a calibration", () => {
    // Calibration changes a multiplier inside the device; there is no state
    // key to predict, and claiming one would leave the command pending forever.
    expect(projectCommand("meter", { action: "calibrate", watts: 1000 })).toEqual({});
  });

  it("projects nothing for a reading it was never sent", () => {
    expect(projectCommand("meter", { watts: 500 })).toEqual({});
  });
});
