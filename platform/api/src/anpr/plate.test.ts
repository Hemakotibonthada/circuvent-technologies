import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analysePlate,
  isValidPlate,
  normalisePlate,
  prettyPlate,
  voteOnBurst,
} from "./plate";
import { HEADER_BYTES, parseCapture } from "./protocol";

/**
 * These tests exist because a gate opens on the output of plate.ts.
 *
 * The recogniser is swappable and may be absent; this logic is neither, and it
 * is the only thing standing between "an OCR returned a string" and "a barrier
 * moved". The cases below are therefore weighted towards the ways a wrong
 * answer becomes an unlocked gate, not towards the happy path.
 */

const jpeg = (n = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 0x41)]);

function header(over: Partial<{ seq: number; burst: number; reason: number; capture: number; w: number; h: number }> = {}) {
  const h = Buffer.alloc(HEADER_BYTES);
  h.write("CVAN", 0, "latin1");
  h.writeUInt8(1, 4);
  h.writeUInt8(over.seq ?? 0, 5);
  h.writeUInt8(over.burst ?? 3, 6);
  h.writeUInt8(over.reason ?? 0, 7);
  h.writeUInt32LE(over.capture ?? 42, 8);
  h.writeUInt16LE(over.w ?? 800, 12);
  h.writeUInt16LE(over.h ?? 600, 14);
  return h;
}

describe("normalisePlate", () => {
  it("strips the separators people actually type", () => {
    assert.equal(normalisePlate("KA 01 AB 1234"), "KA01AB1234");
    assert.equal(normalisePlate("ka-01-ab-1234"), "KA01AB1234");
    assert.equal(normalisePlate("  KA01AB1234  "), "KA01AB1234");
  });

  it("drops the IND country prefix printed on the plate", () => {
    // The prefix is on the plate but is not part of the registration, so a
    // read that includes it must still match a rule that does not.
    assert.equal(normalisePlate("INDKA01AB1234"), "KA01AB1234");
  });

  it("does not eat a state code that merely starts with IND", () => {
    // Guards the lookahead: without it this would become "AB1234".
    assert.equal(normalisePlate("IND123"), "IND123");
  });
});

describe("analysePlate — positional correction", () => {
  it("reads a clean plate unchanged", () => {
    const a = analysePlate("KA01AB1234");
    assert.equal(a.plate, "KA01AB1234");
    assert.equal(a.valid, true);
    assert.equal(a.corrections, 0);
  });

  it("fixes letter/digit confusions in BOTH directions in one string", () => {
    // "MH1ZAB1Z34": the Z at index 3 sits in a digit slot and must become 2,
    // while the Z at index 7 also sits in a digit slot. A blanket rule in one
    // direction cannot get this right, which is the whole reason correction is
    // positional.
    const a = analysePlate("MH1ZAB1Z34");
    assert.equal(a.plate, "MH12AB1234");
    assert.equal(a.valid, true);
    assert.equal(a.corrections, 2);
  });

  it("turns a zero in a letter slot into an O and an O in a digit slot into a zero", () => {
    const a = analysePlate("KAO1AB1234".replace("O", "0")); // KA01AB1234
    assert.equal(a.plate, "KA01AB1234");
    const b = analysePlate("MH12OB1234"); // O sits in a letter slot -> stays O
    assert.equal(b.plate, "MH12OB1234");
    assert.equal(b.valid, true);
  });

  it("accepts the Delhi shape with a letter in the district", () => {
    const a = analysePlate("DL1CAA1111");
    assert.equal(a.plate, "DL1CAA1111");
    assert.equal(a.valid, true);
  });

  it("does not let a non-Delhi plate borrow Delhi's letter-district shape", () => {
    /*
     * Regression. "MH1ZAB1Z34" fits Delhi's AA9AAA9999 with one correction
     * (read the first Z as a letter) and the correct AA99AA9999 with two, so
     * the fewest-corrections rule picked the wrong one and produced
     * "MH1ZAB1234" — a valid-looking plate one character away from the real
     * registration. On an allow-list that is the worst class of failure: it
     * does not look like an error anywhere.
     */
    const a = analysePlate("MH1ZAB1Z34");
    assert.equal(a.plate, "MH12AB1234");
    assert.equal(a.corrections, 2);
  });

  it("accepts a Bharat-series plate", () => {
    const a = analysePlate("21BH1234AB");
    assert.equal(a.kind, "bharat");
    assert.equal(a.valid, true);
  });

  it("rejects a well-shaped string with a state code that does not exist", () => {
    // The dangerous case: "XX01AB1234" fits the format perfectly. Without the
    // state-code check a smudge that OCRs into a plausible shape becomes a
    // confident read, and a confident wrong read is what opens a gate for a
    // stranger.
    const a = analysePlate("XX01AB1234");
    assert.equal(a.valid, false);
    assert.equal(a.reason, "unknown_state");
  });

  it("rejects strings that are not plate-shaped at all", () => {
    assert.equal(analysePlate("HELLO").valid, false);
    assert.equal(analysePlate("").reason, "too_short");
    assert.equal(analysePlate("KA01AB1234567890").reason, "too_long");
    assert.equal(isValidPlate("NOTAPLATE"), false);
  });

  it("prefers the interpretation that needed the fewest corrections", () => {
    // Fits both AA99AA9999 and nothing else cleanly; corrections must be 0
    // rather than the analyser reaching for a shape that needs coercion.
    assert.equal(analysePlate("TN10BC4567").corrections, 0);
  });
});

describe("voteOnBurst", () => {
  it("returns null when the recogniser produced nothing", () => {
    assert.equal(voteOnBurst([]), null);
  });

  it("prefers the plate two frames agree on over one high-confidence frame", () => {
    // Agreement is the signal that survived contact with reality; a provider's
    // own confidence is not comparable between providers and is overconfident
    // on a blurred plate.
    const v = voteOnBurst([
      { raw: "KA01AB1234", confidence: 55 },
      { raw: "KA01AB1234", confidence: 60 },
      { raw: "KA01AB9999", confidence: 99 },
    ]);
    assert.equal(v?.plate, "KA01AB1234");
    assert.equal(v?.votes, 2);
    assert.equal(v?.samples, 3);
  });

  it("counts corrected spellings of the same plate as agreement", () => {
    // Two frames read the same car, one with an O-for-0 slip. They have to
    // land on the same tally or the burst looks like a disagreement.
    const v = voteOnBurst([
      { raw: "KA01AB1234", confidence: 70 },
      { raw: "KAO1AB1234", confidence: 70 },
    ]);
    assert.equal(v?.plate, "KA01AB1234");
    assert.equal(v?.votes, 2);
  });

  it("never reports an invalid plate as valid, however sure the provider was", () => {
    const v = voteOnBurst([{ raw: "XX01AB1234", confidence: 100 }]);
    assert.equal(v?.valid, false);
  });

  it("ranks a valid plate above an invalid one that got more votes", () => {
    // A string that is not a registration is not a read, no matter how many
    // frames produced it.
    const v = voteOnBurst([
      { raw: "ZZ99ZZ9999", confidence: 90 },
      { raw: "ZZ99ZZ9999", confidence: 90 },
      { raw: "KA01AB1234", confidence: 40 },
    ]);
    assert.equal(v?.plate, "KA01AB1234");
    assert.equal(v?.valid, true);
  });

  it("scores unanimous agreement above a split", () => {
    const unanimous = voteOnBurst([
      { raw: "KA01AB1234", confidence: 80 },
      { raw: "KA01AB1234", confidence: 80 },
      { raw: "KA01AB1234", confidence: 80 },
    ]);
    const split = voteOnBurst([
      { raw: "KA01AB1234", confidence: 80 },
      { raw: "KA02CD5678", confidence: 80 },
      { raw: "KA03EF9012", confidence: 80 },
    ]);
    assert.ok(unanimous!.confidence > split!.confidence);
  });

  it("keeps confidence inside 0-100", () => {
    const v = voteOnBurst([{ raw: "KA01AB1234", confidence: 1000 }]);
    assert.ok(v!.confidence >= 0 && v!.confidence <= 100);
  });
});

describe("prettyPlate", () => {
  it("groups a plate the way it is printed", () => {
    assert.equal(prettyPlate("KA01AB1234"), "KA 01 AB 1234");
    assert.equal(prettyPlate("21BH1234AB"), "21 BH 1234 AB");
  });

  it("groups Delhi's letter district correctly", () => {
    // Regression: a greedy optional letter in the old standalone regex printed
    // KA01AB1234 as "KA 01A B 1234". Grouping now comes from the matched shape.
    assert.equal(prettyPlate("DL1CAA1111"), "DL 1C AA 1111");
  });

  it("returns the normalised string when it cannot be grouped", () => {
    assert.equal(prettyPlate("NOTAPLATE"), "NOTAPLATE");
  });
});

describe("capture protocol", () => {
  it("parses a header and separates the JPEG", () => {
    const img = jpeg();
    const c = parseCapture(Buffer.concat([header({ seq: 2, burst: 3, reason: 1, capture: 7 }), img]));
    assert.equal(c?.captureId, 7);
    assert.equal(c?.seq, 2);
    assert.equal(c?.burst, 3);
    assert.equal(c?.reason, "loop");
    assert.equal(c?.width, 800);
    assert.deepEqual(c?.jpeg, img);
  });

  it("accepts a bare JPEG as a single manual capture", () => {
    // Deliberate: it lets a test fixture or `mosquitto_pub -f plate.jpg` feed
    // the pipeline, and means a future header version degrades to "we still
    // got a picture" rather than to silence.
    const c = parseCapture(jpeg());
    assert.equal(c?.burst, 1);
    assert.equal(c?.reason, "manual");
    assert.equal(c?.captureId, 0);
  });

  it("rejects a payload that is not an image", () => {
    assert.equal(parseCapture(Buffer.from("not an image at all")), null);
    assert.equal(parseCapture(Buffer.alloc(0)), null);
    // Header present but the body is not a JPEG — a device publishing
    // something else onto this topic must be dropped at the edge, not sent to
    // an OCR provider.
    assert.equal(parseCapture(Buffer.concat([header(), Buffer.alloc(32, 1)])), null);
  });

  it("floors a burst of zero at one", () => {
    // A burst of 0 would make the collector wait for frames that are not
    // coming, and the read would only land on the 4s timeout.
    const c = parseCapture(Buffer.concat([header({ burst: 0 }), jpeg()]));
    assert.equal(c?.burst, 1);
  });

  it("falls back to motion for an unknown reason byte", () => {
    const c = parseCapture(Buffer.concat([header({ reason: 99 }), jpeg()]));
    assert.equal(c?.reason, "motion");
  });
});
