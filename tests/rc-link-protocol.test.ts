import fs from "node:fs";
import path from "node:path";

/**
 * The RC link protocol.
 *
 * The vehicle takes its steering and throttle from these frames, so the parts
 * worth testing are the ones that decide whether a frame is obeyed at all:
 * the checksum, the sequence rule that rejects stale and replayed commands,
 * the power ceiling, and the failsafe.
 *
 * The header is C, so the logic is transcribed here and the source assertions
 * at the bottom check the firmware still matches what is modelled.
 */

const root = path.join(__dirname, "..");
const proto = fs.readFileSync(path.join(root, "firmware", "CircuventRC", "rc-protocol.h"), "utf8");
const car = fs.readFileSync(path.join(root, "firmware", "rccar", "rccar.ino"), "utf8");
const drive = fs.readFileSync(path.join(root, "firmware", "rccar", "rc-drive.h"), "utf8");
const lightsSrc = fs.readFileSync(path.join(root, "firmware", "rccar", "rc-lights.h"), "utf8");

const num = (src: string, name: string): number => {
  const m = src.match(new RegExp(`#define\\s+${name}\\s+(-?[0-9.]+)`));
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1]);
};

// ------------------------------------------------------------------- crc ---
function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (~crc) >>> 0;
}

describe("the frame checksum", () => {
  it("is the standard CRC-32, so both ends compute the same thing", () => {
    // "123456789" has a published CRC-32 of 0xCBF43926. If the firmware's
    // table-free loop had the polynomial or the bit order wrong, every frame
    // would fail its own check and the car would simply never move.
    const bytes = [...Buffer.from("123456789", "ascii")];
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it("changes when any byte of the frame changes", () => {
    const a = crc32([1, 2, 3, 4]);
    const b = crc32([1, 2, 3, 5]);
    expect(a).not.toBe(b);
  });

  it("covers the frame up to but not including the checksum field", () => {
    expect(proto).toMatch(/rcCrc32\(p, sizeof\(\*p\) - sizeof\(p->crc\)\)/);
  });
});

// -------------------------------------------------------------- sequence ---
const seqIsNewer = (candidate: number, current: number): boolean => {
  const d = ((candidate - current) << 16) >> 16; // to int16
  return d > 0;
};

describe("which frames the vehicle will obey", () => {
  it("accepts the next frame", () => {
    expect(seqIsNewer(101, 100)).toBe(true);
  });

  it("rejects one it has already seen", () => {
    /*
     * This is the replay defence. Somebody who records "full throttle" off the
     * air and sends it back later is sending a sequence the car has passed.
     */
    expect(seqIsNewer(100, 100)).toBe(false);
    expect(seqIsNewer(99, 100)).toBe(false);
  });

  it("survives the wrap at 65535", () => {
    /*
     * Plain `>` breaks here: 0 is not older than 65535, it is the next one.
     * Get this wrong and the car ignores every command for the eleven minutes
     * it takes the sequence to climb back up — starting at whatever throttle
     * it last accepted.
     */
    expect(seqIsNewer(0, 65535)).toBe(true);
    expect(seqIsNewer(1, 65534)).toBe(true);
    expect(seqIsNewer(65535, 0)).toBe(false);
  });

  it("has a horizon of half the sequence space, and that is deliberate", () => {
    /*
     * The circular comparison asks which way round is shorter, so a frame more
     * than 32768 behind reads as one ahead. That is inherent to the method and
     * is the right trade: at 50 Hz half the space is eleven minutes, so the
     * only way to reach it is an outage far longer than any battery lasts —
     * whereas a scheme with no wrap at all breaks every 22 minutes of driving.
     */
    expect(seqIsNewer(100, 40000)).toBe(true); // 25636 forward beats 39900 back
    expect(seqIsNewer(100, 30000)).toBe(false); // 29900 back is the shorter way
  });
});

// ---------------------------------------------------------------- limits ---
const CEILING: Record<number, number> = { 0: 0, 1: 300, 2: 700, 3: 1000 };
const AUX_REVERSE_LOCK = 1 << 6;

function applyLimits(throttle: number, mode: number, aux: number): number {
  const ceiling = CEILING[mode] ?? 0;
  if (ceiling === 0) return 0;
  const reverseOk = mode !== 1 && (aux & AUX_REVERSE_LOCK) === 0;
  if (throttle < 0 && !reverseOk) return 0;
  let scaled = Math.trunc((throttle * ceiling) / 1000);
  if (scaled > ceiling) scaled = ceiling;
  if (scaled < -ceiling) scaled = -ceiling;
  return scaled;
}

describe("the power ceiling", () => {
  it("is applied on the vehicle, not the controller", () => {
    /*
     * A limit enforced by the thing holding the joystick is a suggestion: it
     * is on the wrong side of the link, and the vehicle is the part with the
     * motor. The car re-applies it to whatever arrives.
     */
    expect(car).toMatch(/rcApplyLimits\(demandThrottle, mode, demandAux\)/);
  });

  it("clamps a controller that asks for more than full", () => {
    expect(applyLimits(1500, 3, 0)).toBe(1000);
    expect(applyLimits(-1500, 3, 0)).toBe(-1000);
  });

  it("holds a beginner to a third of the power", () => {
    expect(applyLimits(1000, 1, 0)).toBe(300);
  });

  it("refuses reverse for a beginner, and when the lock is set", () => {
    expect(applyLimits(-1000, 1, 0)).toBe(0);
    expect(applyLimits(-1000, 3, AUX_REVERSE_LOCK)).toBe(0);
    expect(applyLimits(-1000, 3, 0)).toBe(-1000);
  });

  it("will not drive at all when immobilised", () => {
    expect(applyLimits(1000, 0, 0)).toBe(0);
  });

  it("treats a mode it does not recognise as immobilised", () => {
    // A corrupted or newer frame must not be interpreted as "go".
    expect(applyLimits(1000, 9, 0)).toBe(0);
  });
});

// -------------------------------------------------------------- failsafe ---
describe("what happens when the link goes quiet", () => {
  it("gives up after six missed frames, not one", () => {
    const timeout = num(proto, "RC_CONTROL_TIMEOUT_MS");
    const period = num(proto, "RC_CONTROL_PERIOD_MS");
    expect(timeout / period).toBeGreaterThanOrEqual(5);
    expect(timeout / period).toBeLessThanOrEqual(10);
  });

  it("brakes rather than coasting", () => {
    /*
     * A coasting car keeps its momentum and its direction, and the reason the
     * link failed may be that it has gone somewhere it should not be.
     */
    expect(proto).toMatch(/a\.throttle = 0;/);
    expect(car).toMatch(/drive\.update\(a\.throttle, true\)/);
    expect(drive).toMatch(/Both legs high shorts the motor/);
  });

  it("holds the steering rather than centring it", () => {
    // Centring mid-corner is itself a swerve.
    expect(proto).toMatch(/a\.holdSteer = true;/);
  });

  it("puts the hazards on, so the car says why it stopped", () => {
    expect(proto).toMatch(/a\.hazard = true;/);
    expect(car).toMatch(/demandAux \| RC_AUX_HAZARD/);
  });

  it("makes the driver pass through neutral before it will drive again", () => {
    /*
     * Without this a handset switched on with the trigger already pulled
     * drives the car away the moment its battery goes in.
     */
    expect(car).toMatch(/if \(failsafe\) sawNeutral = false;/);
    expect(car).toMatch(/if \(!sawNeutral\) mode = RC_MODE_IMMOBILISED;/);
  });
});

// ------------------------------------------------------------------ links ---
describe("which link may be driven on", () => {
  it("allows ESP-NOW and refuses Zigbee", () => {
    /*
     * 802.15.4 gives 250 kbit/s across a mesh with tens of milliseconds per
     * hop. That is fine for "unlock the door" and useless for steering, and it
     * cannot carry video at all. Zigbee is the parked channel.
     */
    expect(proto).toMatch(/return kind == RC_LINK_ESPNOW;/);
  });
});

// ----------------------------------------------------------------- lights ---
describe("the lighting", () => {
  it("drives both indicators from one free-running phase", () => {
    /*
     * Restarting the blink when a lamp switches on is what makes a hazard look
     * like two indicators that happen to both be on. They have to share a
     * clock nobody resets.
     */
    expect(lightsSrc).toMatch(/_blinkAt/);
    expect(lightsSrc).toMatch(/const bool left = hazard \|\| \(aux & RC_AUX_INDICATE_L\)/);
  });

  it("takes the reverse lamp from the motor, not the stick", () => {
    // Otherwise it flickers while the throttle crosses zero.
    expect(lightsSrc).toMatch(/digitalWrite\(PIN_LIGHT_REVERSE, applied < -MOTOR_DEADBAND/);
  });

  it("gives the horn a cut-off", () => {
    // A held button or a lost link with the horn bit set would otherwise
    // sound it until the battery went flat.
    expect(num(lightsSrc, "HORN_MAX_MS")).toBeGreaterThan(0);
    expect(lightsSrc).toMatch(/now - _hornSince\) < HORN_MAX_MS/);
  });
});

// ------------------------------------------------------------------ drive ---
describe("the drive layer", () => {
  it("rations power going up but not coming down", () => {
    /*
     * A model motor goes stopped-to-full in the time it takes to move a thumb,
     * which strips gears and flips cars. Backing off and braking stay instant —
     * rationing those would make the car slower to stop than to start.
     */
    expect(drive).toMatch(/backing off or reversing: immediate/);
    expect(num(drive, "THROTTLE_SLEW_PER_S")).toBeGreaterThan(0);
  });

  it("writes both bridge legs low before claiming the pins", () => {
    /*
     * An H-bridge input floats until driven, and a floating input on a driver
     * with an internal pull-up is a motor that runs the instant the battery
     * goes in — before setup() has decided anything.
     */
    const begin = drive.slice(drive.indexOf("void begin()"), drive.indexOf("void update("));
    expect(begin.indexOf("ledcWrite(LEDC_CH_MOTOR_A, 0)")).toBeLessThan(
      begin.indexOf("ledcAttachPin(PIN_MOTOR_A"),
    );
  });

  it("has a deadband, so the motor is never told to buzz", () => {
    expect(num(drive, "MOTOR_DEADBAND")).toBeGreaterThan(0);
  });

  it("brings the drive up before the radio", () => {
    // The radio is what can deliver a throttle command; nothing that can move
    // the car should be initialised after it. Checked inside setup(), because
    // startLink is *defined* above it and a whole-file search finds that.
    const setup = car.slice(car.indexOf("void setup()"), car.indexOf("void loop()"));
    expect(setup.indexOf("drive.begin()")).toBeGreaterThanOrEqual(0);
    expect(setup.indexOf("drive.begin()")).toBeLessThan(setup.indexOf("startLink()"));
  });
});
