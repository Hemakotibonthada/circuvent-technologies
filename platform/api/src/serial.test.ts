import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SERIAL_ALPHABET,
  generateSerial,
  normalizeSerial,
  isSerial,
  checkCharacter,
  payloadFromHwid,
  productCode,
  typeFromProductCode,
  fallbackProductCode,
  labelQrPayload,
} from "./serial";

/**
 * A serial exists to be read off a moulded label, spoken down a phone line and
 * typed into a form by somebody who is not looking at the unit. The assertions
 * that matter are therefore about human error, not about the happy path: a
 * transposed pair, a misread O for a zero, a stray space.
 */

describe("format", () => {
  test("looks like the documented shape", () => {
    const s = generateSerial("smart-plug", "a41c9e02");
    assert.match(s, /^CV-[A-Z]{3}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.ok(s.startsWith("CV-PLG-"));
  });

  test("uses only unambiguous characters in the payload", () => {
    // I/L/O/U are excluded precisely so a misread can be corrected rather than
    // guessed. If one ever appears in generated output the folding table below
    // would start rewriting real characters.
    for (let i = 0; i < 300; i++) {
      const payload = generateSerial("home-hub").replace(/^CV-[A-Z]{3}-/, "").replace("-", "");
      for (const ch of payload) {
        assert.ok(SERIAL_ALPHABET.includes(ch), `${ch} is not in the serial alphabet`);
      }
    }
  });

  test("every known product gets a distinct three-letter code", () => {
    const types = [
      "home-hub", "smart-plug", "smart-switch", "smart-light", "smart-fan",
      "smart-lock", "touchboard", "sentinel", "camera", "aquaguard",
      "watertank", "guardian", "motion-sensor", "energy-monitor",
      "agri-starter", "curtain", "rfid-gate", "facedoor", "generic",
    ];
    const codes = types.map(productCode);
    assert.equal(new Set(codes).size, codes.length, "two products share a code");
    for (const c of codes) assert.match(c, /^[A-Z]{3}$/);
  });

  test("a product code reads back to its type", () => {
    assert.equal(typeFromProductCode("PLG"), "smart-plug");
    assert.equal(typeFromProductCode("snl"), "sentinel");
    assert.equal(typeFromProductCode("ZZZ"), null);
  });

  test("an unknown type still gets a usable code", () => {
    // A product added later must still be able to provision. Failing here
    // would block the device, not just its label.
    assert.match(fallbackProductCode("quantum-toaster"), /^[A-Z]{3}$/);
    assert.match(fallbackProductCode("x"), /^[A-Z]{3}$/);
    assert.match(fallbackProductCode(""), /^[A-Z]{3}$/);
    assert.match(productCode("not-a-real-product"), /^[A-Z]{3}$/);
  });
});

describe("stability", () => {
  test("the same board always produces the same serial", () => {
    // A factory reset must not issue a second number while the label on the
    // case still shows the first.
    const a = generateSerial("aquaguard", "3c71bf2a41c9");
    const b = generateSerial("aquaguard", "3c71bf2a41c9");
    assert.equal(a, b);
  });

  test("different boards produce different serials", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateSerial("smart-plug", `chip${i}`));
    assert.equal(seen.size, 500);
  });

  test("hwid case and punctuation do not change the answer", () => {
    assert.equal(payloadFromHwid("A41C-9E02"), payloadFromHwid("a41c9e02"));
  });

  test("an empty hwid still yields a payload rather than throwing", () => {
    assert.equal(payloadFromHwid("").length, 7);
  });

  test("serials without a hwid are random, not constant", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateSerial("camera"));
    assert.ok(seen.size > 190, `only ${seen.size} distinct serials in 200 draws`);
  });
});

describe("normalisation", () => {
  const serial = generateSerial("home-hub", "deadbeef");

  test("accepts the canonical form", () => {
    assert.equal(normalizeSerial(serial), serial);
  });

  test("forgives everything that carries no meaning", () => {
    // Somebody reading a label into a form should not be told "not found"
    // because they typed lower case or left out the dashes.
    for (const variant of [
      serial.toLowerCase(),
      serial.replace(/-/g, ""),
      serial.replace(/-/g, " "),
      `  ${serial}  `,
      serial.replace(/^CV-/, ""),
      serial.toLowerCase().replace(/-/g, ""),
    ]) {
      assert.equal(normalizeSerial(variant), serial, `failed on "${variant}"`);
    }
  });

  test("folds the characters a human substitutes", () => {
    // O for 0 and I/L for 1 are the classic misreads. They are not in the
    // alphabet, so the substitution is unambiguous and can be corrected.
    const withOh = serial.replace(/0/g, "O");
    if (withOh !== serial) assert.equal(normalizeSerial(withOh), serial);
    const withEye = serial.replace(/1/g, "I");
    if (withEye !== serial) assert.equal(normalizeSerial(withEye), serial);
    const withEll = serial.replace(/1/g, "L");
    if (withEll !== serial) assert.equal(normalizeSerial(withEll), serial);
  });

  test("rejects a single wrong character", () => {
    const body = serial.replace(/^CV-[A-Z]{3}-/, "").replace("-", "");
    for (let i = 0; i < body.length - 1; i++) {
      const wrong = SERIAL_ALPHABET[(SERIAL_ALPHABET.indexOf(body[i]) + 7) % 32];
      const broken = body.slice(0, i) + wrong + body.slice(i + 1);
      const candidate = serial.slice(0, 7) + broken.slice(0, 4) + "-" + broken.slice(4);
      assert.equal(normalizeSerial(candidate), null, `accepted a typo at position ${i}`);
    }
  });

  test("rejects a transposed pair", () => {
    // The whole reason the checksum is position-weighted. An unweighted sum
    // cannot see this, and swapping two adjacent characters is the single most
    // common copying error.
    const body = serial.replace(/^CV-[A-Z]{3}-/, "").replace("-", "");
    let checked = 0;
    for (let i = 0; i < body.length - 2; i++) {
      if (body[i] === body[i + 1]) continue; // a swap of equal characters is a no-op
      const swapped = body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      const candidate = serial.slice(0, 7) + swapped.slice(0, 4) + "-" + swapped.slice(4);
      assert.equal(normalizeSerial(candidate), null, `accepted a transposition at ${i}`);
      checked++;
    }
    assert.ok(checked > 0, "the fixture had no transposable pair — pick another hwid");
  });

  test("rejects a serial from the wrong product", () => {
    // The product code is inside the checksum, so relabelling a unit's type
    // does not silently produce a valid serial.
    const other = "CV-CAM-" + serial.slice(7);
    assert.equal(normalizeSerial(other), null);
  });

  test("rejects malformed input rather than guessing", () => {
    for (const bad of ["", "CV", "CV-PLG", "CV-PLG-1234-567", "CV-PLG-1234-56789", "not a serial", "12345678901"]) {
      assert.equal(normalizeSerial(bad), null, `accepted "${bad}"`);
      assert.equal(isSerial(bad), false);
    }
  });

  test("normalisation is idempotent", () => {
    assert.equal(normalizeSerial(normalizeSerial(serial)!), serial);
  });
});

describe("check character", () => {
  test("depends on position, not just content", () => {
    assert.notEqual(checkCharacter("PLG", "ABCDEFG"), checkCharacter("PLG", "BACDEFG"));
  });

  test("depends on the product code", () => {
    assert.notEqual(checkCharacter("PLG", "ABCDEFG"), checkCharacter("CAM", "ABCDEFG"));
  });

  test("is always a character from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const c = checkCharacter(productCode("smart-plug"), payloadFromHwid(`x${i}`));
      assert.ok(SERIAL_ALPHABET.includes(c));
    }
  });
});

describe("label QR", () => {
  test("matches the scheme the mobile scanner parses", () => {
    const payload = labelQrPayload("CV-PLG-4K7M-92XH", "smart-plug");
    assert.ok(payload.startsWith("circuvent://setup?"));
    assert.ok(payload.includes("type=smart-plug"));
    assert.ok(payload.includes("sn=CV-PLG-4K7M-92XH"));
  });

  test("carries nothing secret", () => {
    // Every unit runs identical firmware with no baked-in credential, so the
    // label cannot contain one. A label that looked like it held a secret
    // would invite somebody to treat scanning it as authentication.
    const payload = labelQrPayload("CV-HUB-1234-5678", "home-hub", "Circuvent-Setup-ab12");
    assert.ok(!/key|secret|token|password|pass=/i.test(payload), payload);
  });

  test("escapes values rather than concatenating them raw", () => {
    const payload = labelQrPayload("CV-GEN-0000-000X", "weird type&x=1");
    assert.ok(payload.includes("weird%20type%26x%3D1"));
    // A raw & would have added a parameter the scanner never expected.
    assert.equal(payload.split("&").length, 2);
  });
});

/**
 * Every device type that ships needs an explicit product code.
 *
 * `productCode()` falls back to the first three letters of the type, which
 * produces a usable serial — so nothing looks wrong. But `typeFromProductCode`
 * only searches the explicit table, so a serial built from a fallback resolves
 * to no type at all and the registry quietly loses the ability to say what a
 * unit is from the number on its label. `anpr-cam` shipped in exactly that
 * state until this was written.
 */
describe("product codes", () => {
  const SHIPPING_TYPES = [
    "home-hub", "smart-plug", "smart-switch", "smart-light", "smart-fan",
    "smart-lock", "touchboard", "sentinel", "camera", "aquaguard", "watertank",
    "guardian", "motion-sensor", "energy-monitor", "agri-starter", "curtain",
    "rfid-gate", "anpr-cam", "facedoor",
  ];

  test("every shipping type reads back from its own code", () => {
    for (const type of SHIPPING_TYPES) {
      assert.equal(
        typeFromProductCode(productCode(type)),
        type,
        `${type} has no explicit PRODUCT_CODES entry — its serial cannot be resolved back to a type`
      );
    }
  });

  test("no two types share a code", () => {
    // A collision would make two different products indistinguishable by
    // serial, which is the one thing a serial exists to do.
    const seen = new Map<string, string>();
    for (const type of SHIPPING_TYPES) {
      const code = productCode(type);
      assert.equal(seen.get(code), undefined, `${type} collides with ${seen.get(code)} on ${code}`);
      seen.set(code, type);
    }
  });

  test("a code is three characters, so the serial format holds", () => {
    for (const type of SHIPPING_TYPES) assert.equal(productCode(type).length, 3, type);
  });

  test("an unknown type still produces a usable serial", () => {
    // The fallback must keep working: an experimental board on a bench should
    // get a label, it just cannot be resolved back to a type.
    const serial = generateSerial("experimental-thing", "a41c9e02");
    assert.ok(isSerial(serial), serial);
    assert.equal(fallbackProductCode("experimental-thing"), "EXP");
  });
});
