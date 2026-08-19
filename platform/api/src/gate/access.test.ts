/**
 * Gate access, tested on the cases that let the wrong car in.
 *
 * The parity tests matter most. Wiegand runs tens of metres up a driveway past
 * a gate motor, and the firmware's check cannot be exercised on hardware here —
 * so the rule is proved against frames built from known facility and card
 * numbers, and against every single-bit corruption of them. A parity rule that
 * is subtly wrong is worse than none: it rejects valid tags, and the fault
 * looks like a broken reader.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  aclFor,
  aclString,
  decideGate,
  decodeWiegand26,
  describeDecision,
  wiegand26Card,
  wiegand26Encode,
  wiegand26Valid,
  type GateTag,
} from "./access";

function tag(over: Partial<GateTag> = {}): GateTag {
  return {
    id: 1,
    tag: 12345,
    label: "Blue Swift",
    vehicle: "TS09AB1234",
    active: true,
    validFrom: null,
    validTo: null,
    days: [],
    fromMinute: null,
    toMinute: null,
    ...over,
  };
}

/** Local wall-clock time, which is what every gate rule is written in. */
function at(iso: string): Date {
  return new Date(iso);
}

describe("Wiegand-26 parity", () => {
  test("accepts a frame it built itself", () => {
    const frame = wiegand26Encode(42, 1234);
    assert.equal(wiegand26Valid(frame), true);
  });

  test("recovers the facility and card number", () => {
    const frame = wiegand26Encode(42, 1234);
    const card = wiegand26Card(frame);
    assert.equal((card >> 16) & 0xff, 42);
    assert.equal(card & 0xffff, 1234);
  });

  test("rejects every single-bit corruption", () => {
    /*
     * The whole point of the two parity bits. A flipped bit anywhere in the
     * frame must fail — otherwise a noisy cable does not produce an error, it
     * produces a different card number, which is either a valid tag
     * mysteriously refused or somebody else's tag accepted.
     */
    const frame = wiegand26Encode(42, 1234);
    let caught = 0;
    for (let bit = 0; bit < 26; bit++) {
      const corrupted = (frame ^ (1 << bit)) >>> 0;
      if (!wiegand26Valid(corrupted)) caught++;
    }
    assert.equal(caught, 26, "a single flipped bit must always fail parity");
  });

  test("holds for a spread of facility and card numbers", () => {
    for (const facility of [0, 1, 42, 128, 255]) {
      for (const card of [0, 1, 1234, 32768, 65535]) {
        const frame = wiegand26Encode(facility, card);
        assert.equal(wiegand26Valid(frame), true, `FC${facility} card${card}`);
        assert.equal(wiegand26Card(frame), ((facility << 16) | card) >>> 0);
      }
    }
  });

  test("decode returns null rather than a plausible wrong number", () => {
    /*
     * The old firmware masked anything 24..37 bits down to its low 24 and
     * carried on. A corrupted read has to fail, not become a card number.
     */
    const frame = wiegand26Encode(42, 1234);
    assert.equal(decodeWiegand26(frame), wiegand26Card(frame));
    assert.equal(decodeWiegand26((frame ^ 0b100) >>> 0), null);
  });
});

describe("decideGate", () => {
  const noon = at("2026-06-10T12:00:00");   // a Wednesday

  test("lets a plain active tag through", () => {
    const d = decideGate(tag(), noon);
    assert.equal(d.allowed, true);
    assert.equal(d.reason, "allowed");
  });

  test("an unknown tag is unknown, not out-of-hours", () => {
    // The two send somebody to look in completely different places.
    assert.equal(decideGate(undefined, noon).reason, "unknown-tag");
  });

  test("a revoked tag is refused", () => {
    assert.equal(decideGate(tag({ active: false }), noon).reason, "revoked");
  });

  test("respects a validity window at both ends", () => {
    assert.equal(
      decideGate(tag({ validFrom: at("2026-07-01T00:00:00") }), noon).reason,
      "not-yet-valid",
    );
    assert.equal(
      decideGate(tag({ validTo: at("2026-01-01T00:00:00") }), noon).reason,
      "expired",
    );
  });

  test("respects days of the week", () => {
    // Weekdays only; the test moment is a Wednesday.
    assert.equal(decideGate(tag({ days: [1, 2, 3, 4, 5] }), noon).allowed, true);
    assert.equal(decideGate(tag({ days: [0, 6] }), noon).reason, "wrong-day");
  });

  test("an empty day list means every day", () => {
    const sunday = at("2026-06-14T12:00:00");
    assert.equal(decideGate(tag({ days: [] }), sunday).allowed, true);
  });

  test("respects a daytime window", () => {
    const t = tag({ fromMinute: 9 * 60, toMinute: 17 * 60 });
    assert.equal(decideGate(t, noon).allowed, true);
    assert.equal(decideGate(t, at("2026-06-10T18:30:00")).reason, "wrong-time");
    assert.equal(decideGate(t, at("2026-06-10T07:00:00")).reason, "wrong-time");
  });

  test("a window that ends before it starts spans midnight", () => {
    /*
     * 22:00 to 06:00 is a night shift, not a mistake. Treating it as one would
     * lock out exactly the people most likely to be arriving in the dark.
     */
    const night = tag({ fromMinute: 22 * 60, toMinute: 6 * 60 });
    assert.equal(decideGate(night, at("2026-06-10T23:30:00")).allowed, true);
    assert.equal(decideGate(night, at("2026-06-10T02:00:00")).allowed, true);
    assert.equal(decideGate(night, at("2026-06-10T12:00:00")).reason, "wrong-time");
  });

  test("reports the tag alongside a denial", () => {
    // So the event log can say whose tag was refused, not just that one was.
    const d = decideGate(tag({ active: false }), noon);
    assert.equal(d.tag?.label, "Blue Swift");
  });

  test("every reason has wording", () => {
    for (const reason of [
      "allowed",
      "unknown-tag",
      "revoked",
      "not-yet-valid",
      "expired",
      "wrong-day",
      "wrong-time",
    ] as const) {
      const text = describeDecision({ allowed: reason === "allowed", reason });
      assert.ok(text.length > 0);
    }
  });
});

describe("the list pushed to the device", () => {
  const noon = at("2026-06-10T12:00:00");   // Wednesday

  test("contains only tags that could open the gate now", () => {
    /*
     * The device has no clock it can trust, so it cannot enforce a window
     * itself. Sending it a tag that expired last month would mean the barrier
     * opens for it whenever the platform is unreachable — which is exactly
     * when a gate most needs to be right.
     */
    const tags = [
      tag({ id: 1, tag: 100 }),
      tag({ id: 2, tag: 200, active: false }),
      tag({ id: 3, tag: 300, validTo: at("2026-01-01T00:00:00") }),
      tag({ id: 4, tag: 400, days: [0, 6] }),
      tag({ id: 5, tag: 500, fromMinute: 9 * 60, toMinute: 17 * 60 }),
    ];
    assert.deepEqual(aclFor(tags, noon), [100, 500]);
  });

  test("is sorted and deduplicated", () => {
    // Two rows can name the same physical tag — a replacement issued before the
    // old one was revoked. The device must not be sent it twice.
    const tags = [tag({ id: 1, tag: 300 }), tag({ id: 2, tag: 100 }), tag({ id: 3, tag: 300 })];
    assert.deepEqual(aclFor(tags, noon), [100, 300]);
  });

  test("serialises exactly as the device stores it", () => {
    assert.equal(aclString([100, 300]), "100,300");
    assert.equal(aclString([]), "");
  });

  test("an empty list is empty, not everybody", () => {
    assert.deepEqual(aclFor([], noon), []);
  });
});
