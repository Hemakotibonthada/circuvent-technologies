/**
 * Wiegand frames, and deciding whether a vehicle may pass.
 *
 * WHY THE PLATFORM KNOWS ABOUT A WIRE FORMAT
 *
 * It should not have to, and mostly it does not — the reader decodes and the
 * gate publishes a card number. Two things make it worth having here anyway:
 *
 *   1. The parity rule is security-relevant and cannot be tested on the
 *      device. Wiegand runs tens of metres up a driveway on a pair of
 *      open-drain lines, past a gate motor that is a large inductive load, and
 *      the format carries two spare bits for exactly that reason. The firmware
 *      checks them; this is where that check is *proved* — against frames
 *      constructed from known facility and card numbers, and against
 *      single-bit corruptions of them.
 *
 *   2. Somebody enrolling a tag by reading the number off a printed label
 *      needs it turned into the same card number the reader will produce.
 *
 * The access decision below is here for the ordinary reason: it decides who
 * gets through a gate, and it must be possible to ask it awkward questions
 * without a barrier and a car.
 */

/* ------------------------------------------------------------------ */
/* Wiegand-26                                                          */
/* ------------------------------------------------------------------ */

/**
 * Bit layout, most significant first, as transmitted:
 *
 *   bit 25      P0 — even parity over bits 25..13
 *   bits 24..1  24 data bits (8-bit facility code, 16-bit card number)
 *   bit 0       P1 — odd parity over bits 12..0
 *
 * The two parity groups overlap the data in the middle, which is what lets a
 * single flipped bit be caught wherever it lands.
 */
export function wiegand26Valid(frame: number): boolean {
  let evenOnes = 0;
  let oddOnes = 0;
  for (let i = 25; i >= 13; i--) if (frame & (1 << i)) evenOnes++;
  for (let i = 12; i >= 0; i--) if (frame & (1 << i)) oddOnes++;
  return evenOnes % 2 === 0 && oddOnes % 2 === 1;
}

/** The 24 data bits, once parity has been satisfied. */
export function wiegand26Card(frame: number): number {
  return (frame >>> 1) & 0xffffff;
}

/**
 * Builds a frame from a facility and card number, parity included.
 *
 * Used by the tests to produce known-good frames, and by the enrolment flow so
 * somebody reading "FC 42, card 1234" off a label gets the number the reader
 * will actually report.
 */
export function wiegand26Encode(facility: number, card: number): number {
  const data = ((facility & 0xff) << 16) | (card & 0xffff);

  // P0 makes the top half even; P1 makes the bottom half odd.
  let topOnes = 0;
  for (let i = 23; i >= 12; i--) if (data & (1 << i)) topOnes++;
  const p0 = topOnes % 2 === 0 ? 0 : 1;

  let bottomOnes = 0;
  for (let i = 11; i >= 0; i--) if (data & (1 << i)) bottomOnes++;
  const p1 = bottomOnes % 2 === 0 ? 1 : 0;

  return ((p0 << 25) | (data << 1) | p1) >>> 0;
}

/** The card number a 26-bit frame carries, or null if it is corrupt. */
export function decodeWiegand26(frame: number): number | null {
  return wiegand26Valid(frame) ? wiegand26Card(frame) : null;
}

/* ------------------------------------------------------------------ */
/* Access decisions                                                    */
/* ------------------------------------------------------------------ */

export type GateTag = {
  id: number;
  /** The number the reader reports. */
  tag: number;
  label: string;
  vehicle: string;
  active: boolean;
  /** Null means no bound in that direction. */
  validFrom: Date | null;
  validTo: Date | null;
  /**
   * Days of the week this tag may pass, 0 = Sunday. Empty means every day.
   *
   * A contractor allowed on site Monday to Friday is the ordinary case, and
   * expressing it as a rule rather than making somebody remember to revoke and
   * reissue is the difference between a restriction that stays true and one
   * that quietly stops being enforced.
   */
  days: number[];
  /** Minutes from local midnight. Both null means any time. */
  fromMinute: number | null;
  toMinute: number | null;
};

export type GateReason =
  | "allowed"
  | "unknown-tag"
  | "revoked"
  | "not-yet-valid"
  | "expired"
  | "wrong-day"
  | "wrong-time";

export type GateDecision = {
  allowed: boolean;
  /** Recorded on every event, so a denial can be explained afterwards. */
  reason: GateReason;
  tag?: GateTag;
};

/**
 * Whether this tag may pass, at this local moment.
 *
 * `now` is local wall-clock time for the site, because every rule a person
 * writes about a gate is in wall-clock terms — "the cleaners come at six" does
 * not shift with daylight saving the way an offset would.
 *
 * Ordering matters: an unknown tag is reported as unknown rather than as
 * out-of-hours, because the two send somebody to look in completely different
 * places.
 */
export function decideGate(tag: GateTag | undefined, now: Date): GateDecision {
  if (!tag) return { allowed: false, reason: "unknown-tag" };
  if (!tag.active) return { allowed: false, reason: "revoked", tag };

  const t = now.getTime();
  if (tag.validFrom && t < tag.validFrom.getTime()) {
    return { allowed: false, reason: "not-yet-valid", tag };
  }
  if (tag.validTo && t > tag.validTo.getTime()) {
    return { allowed: false, reason: "expired", tag };
  }

  if (tag.days.length > 0 && !tag.days.includes(now.getDay())) {
    return { allowed: false, reason: "wrong-day", tag };
  }

  if (tag.fromMinute !== null && tag.toMinute !== null) {
    const minute = now.getHours() * 60 + now.getMinutes();
    /*
     * A window that ends before it starts spans midnight — 22:00 to 06:00 is a
     * night shift, not a mistake, and treating it as one would lock out
     * exactly the people most likely to be arriving in the dark.
     */
    const overnight = tag.toMinute < tag.fromMinute;
    const inside = overnight
      ? minute >= tag.fromMinute || minute <= tag.toMinute
      : minute >= tag.fromMinute && minute <= tag.toMinute;
    if (!inside) return { allowed: false, reason: "wrong-time", tag };
  }

  return { allowed: true, reason: "allowed", tag };
}

/**
 * The list pushed to the device.
 *
 * Only tags that could open the gate *right now* are sent. The device has no
 * clock it can trust — no RTC, and NTP only while the network is up — so it
 * cannot enforce a validity window itself, and sending it a tag that expired
 * last month would mean the barrier opens for it whenever the platform is
 * unreachable. Which is precisely when a gate most needs to be right.
 *
 * Time-of-day and day-of-week rules are therefore enforced by re-pushing the
 * list as they change, the same way the attendance terminals work.
 */
export function aclFor(tags: GateTag[], now: Date): number[] {
  const out: number[] = [];
  for (const tag of tags) {
    if (decideGate(tag, now).allowed) out.push(tag.tag);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** The exact string the device stores in NVS. */
export function aclString(tagNumbers: number[]): string {
  return tagNumbers.join(",");
}

/** A sentence for the event log, so a denial explains itself. */
export function describeDecision(d: GateDecision): string {
  switch (d.reason) {
    case "allowed":
      return "Allowed";
    case "unknown-tag":
      return "Denied — tag not recognised";
    case "revoked":
      return "Denied — access revoked";
    case "not-yet-valid":
      return "Denied — not valid yet";
    case "expired":
      return "Denied — pass expired";
    case "wrong-day":
      return "Denied — not permitted on this day";
    case "wrong-time":
      return "Denied — outside permitted hours";
  }
}
