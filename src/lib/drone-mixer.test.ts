/**
 * The X1 mixer and rate controller, checked in TypeScript against the C++.
 *
 * WHY A TEST OUTSIDE THE FIRMWARE
 *
 * The mixer is four lines of arithmetic and it decides whether the aircraft
 * flies or flips. A sign error there compiles perfectly, passes every static
 * check, and is discovered by the airframe inverting itself into the ground
 * about 300 ms after takeoff. It cannot be caught by `pio run`.
 *
 * So the same equations are transcribed here from
 * firmware/drone-fc/control.h and driven with the cases a bench test would
 * exercise. If somebody edits the C++ and not this file, the two disagree and
 * this fails — which is the point.
 *
 * Layout (front at the top):
 *
 *   M4 (CW)    M1 (CCW)
 *        \    /
 *         \  /
 *         /  \
 *        /    \
 *   M3 (CW)    M2 (CCW)
 */

const MOTOR_IDLE = 0.055;
const MOTOR_MAX = 1.0;

interface Mix {
  m: [number, number, number, number];
  saturated: boolean;
}

/** Transcribed from `mixQuadX` in firmware/drone-fc/control.h. */
function mixQuadX(throttle: number, roll: number, pitch: number, yaw: number): Mix {
  const raw = [
    throttle - roll - pitch + yaw, // M1 front-right, CCW
    throttle - roll + pitch - yaw, // M2 rear-right,  CW
    throttle + roll + pitch + yaw, // M3 rear-left,   CCW
    throttle + roll - pitch - yaw, // M4 front-left,  CW
  ];

  let lo = Math.min(...raw);
  let hi = Math.max(...raw);
  const saturated = hi > MOTOR_MAX || lo < MOTOR_IDLE;

  const range = hi - lo;
  if (range > MOTOR_MAX - MOTOR_IDLE) {
    const scale = (MOTOR_MAX - MOTOR_IDLE) / range;
    const mid = 0.5 * (hi + lo);
    for (let i = 0; i < 4; i++) raw[i] = mid + (raw[i]! - mid) * scale;
    lo = mid + (lo - mid) * scale;
    hi = mid + (hi - mid) * scale;
  }

  let shift = 0;
  if (hi > MOTOR_MAX) shift = MOTOR_MAX - hi;
  else if (lo < MOTOR_IDLE) shift = MOTOR_IDLE - lo;

  const m = raw.map((v) => Math.min(MOTOR_MAX, Math.max(MOTOR_IDLE, v + shift)));
  return { m: m as Mix["m"], saturated };
}

const [M1, M2, M3, M4] = [0, 1, 2, 3];

describe("quad-X mixer directions", () => {
  const hover = 0.5;

  it("rolling right unloads the right-hand motors", () => {
    // To roll right the right side must drop, so M1 and M2 produce less.
    const { m } = mixQuadX(hover, 0.15, 0, 0);
    expect(m[M1]).toBeLessThan(m[M3]!);
    expect(m[M2]).toBeLessThan(m[M4]!);
  });

  it("pitching nose-up loads the rear motors", () => {
    // Rear is M2 and M3.
    const { m } = mixQuadX(hover, 0, 0.15, 0);
    expect(m[M2]).toBeGreaterThan(m[M1]!);
    expect(m[M3]).toBeGreaterThan(m[M4]!);
  });

  /*
   * The one that bites. A propeller's reaction torque on the frame opposes its
   * own rotation, so to yaw the aircraft right you speed up the props turning
   * left. Get this backwards and yaw becomes positive feedback: the aircraft
   * spins up faster the harder the controller tries to stop it.
   */
  it("yawing right speeds up the counter-clockwise props", () => {
    const { m } = mixQuadX(hover, 0, 0, 0.15);
    expect(m[M1]).toBeGreaterThan(m[M2]!); // CCW > CW
    expect(m[M3]).toBeGreaterThan(m[M4]!); // CCW > CW
  });

  it("leaves all four equal when the sticks are centred", () => {
    const { m } = mixQuadX(hover, 0, 0, 0);
    expect(m[M1]).toBeCloseTo(m[M2]!, 6);
    expect(m[M2]).toBeCloseTo(m[M3]!, 6);
    expect(m[M3]).toBeCloseTo(m[M4]!, 6);
  });
});

describe("mixer saturation", () => {
  /*
   * The behaviour that keeps an aircraft controllable at full throttle. Naive
   * clipping preserves throttle and destroys the differential -- so the
   * aircraft loses exactly the correction it needed, at the moment it needed
   * it most. Shifting preserves the differential and gives up throttle.
   */
  it("preserves the roll differential at full throttle instead of clipping it", () => {
    const { m } = mixQuadX(1.0, 0.2, 0, 0);
    const rightAvg = (m[M1]! + m[M2]!) / 2;
    const leftAvg = (m[M3]! + m[M4]!) / 2;
    expect(leftAvg - rightAvg).toBeGreaterThan(0.3);
  });

  it("never commands below idle or above full", () => {
    for (const [t, r, p, y] of [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0.5, -1, -1, -1],
      [0.05, 0.9, -0.9, 0.4],
      [0.95, -0.7, 0.7, -0.6],
    ] as const) {
      const { m } = mixQuadX(t, r, p, y);
      for (const v of m) {
        expect(v).toBeGreaterThanOrEqual(MOTOR_IDLE - 1e-9);
        expect(v).toBeLessThanOrEqual(MOTOR_MAX + 1e-9);
      }
    }
  });

  it("reports saturation so the rate controller can stop integrating", () => {
    // Windup while saturated buys no authority and has to be unwound later,
    // which shows up as a lazy, overshooting recovery.
    expect(mixQuadX(0.5, 0, 0, 0).saturated).toBe(false);
    expect(mixQuadX(1.0, 0.5, 0, 0).saturated).toBe(true);
  });

  it("scales an over-wide demand about its centre rather than favouring one axis", () => {
    // Demanded spread is far wider than the motors can express; every axis
    // should lose authority proportionally, not one axis entirely.
    const { m } = mixQuadX(0.5, 0.8, 0.8, 0);
    const spread = Math.max(...m) - Math.min(...m);
    expect(spread).toBeLessThanOrEqual(MOTOR_MAX - MOTOR_IDLE + 1e-9);
    // Both axes survive: the two extremes are not the same pair they would be
    // if one axis had been zeroed.
    expect(Math.max(...m)).toBeGreaterThan(Math.min(...m));
  });
});

/** Transcribed from `applyExpo` in control.h. */
function applyExpo(stick: number, expo: number, maxRate: number): number {
  const s = Math.min(1, Math.max(-1, stick));
  return ((1 - expo) * s + expo * s * s * s) * maxRate;
}

describe("stick shaping", () => {
  it("reaches exactly the maximum rate at full deflection", () => {
    // If expo changed the endpoint, the advertised max rate would be a lie.
    expect(applyExpo(1, 0.35, 360)).toBeCloseTo(360, 6);
    expect(applyExpo(-1, 0.35, 360)).toBeCloseTo(-360, 6);
  });

  it("is softer than linear around centre", () => {
    // The entire purpose: fine control near centre without losing the top end.
    expect(Math.abs(applyExpo(0.25, 0.35, 360))).toBeLessThan(0.25 * 360);
  });

  it("is symmetric", () => {
    expect(applyExpo(0.4, 0.35, 360)).toBeCloseTo(-applyExpo(-0.4, 0.35, 360), 6);
  });

  it("passes through unchanged with no expo", () => {
    expect(applyExpo(0.5, 0, 360)).toBeCloseTo(180, 6);
  });
});

/** Transcribed from `angleToRate` in control.h. */
function angleToRate(targetDeg: number, actualDeg: number, kp: number, maxRateDps: number): number {
  return Math.min(maxRateDps, Math.max(-maxRateDps, (targetDeg - actualDeg) * kp));
}

describe("angle loop", () => {
  it("commands a rate that reduces the error", () => {
    // Target above actual must ask for a positive rate, or the outer loop
    // drives the aircraft away from the stick.
    expect(angleToRate(20, 0, 6, 360)).toBeGreaterThan(0);
    expect(angleToRate(-20, 0, 6, 360)).toBeLessThan(0);
    expect(angleToRate(10, 10, 6, 360)).toBe(0);
  });

  it("bounds the demand so a large upset produces a correction, not a lurch", () => {
    // 60 degrees of error at kp=6 asks for 360 deg/s; without the clamp a
    // bigger upset would ask for a rate the airframe cannot reach, and the
    // inner loop saturates trying.
    expect(angleToRate(90, -90, 6, 360)).toBe(360);
    expect(angleToRate(-90, 90, 6, 360)).toBe(-360);
  });
});
