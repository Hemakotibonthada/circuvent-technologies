// Must come first: these modules reach config.ts, which process.exit(1)s on an
// incomplete environment before any assertion runs.
import "../../test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jpeg from "jpeg-js";
import {
  binariseForOcr,
  boxBlur,
  crop,
  decodeGray,
  fitWithin,
  otsuThreshold,
  resize,
  toPgm,
  type Gray,
} from "./image";
import { findPlates } from "./locate";

/**
 * The local recogniser's image stages.
 *
 * Everything here is pure and deterministic, and none of it needs Tesseract —
 * which is the point of splitting it out. The classifier is a black box that
 * can only be judged on real photographs; localisation, scaling and
 * thresholding are arithmetic, and arithmetic that is quietly wrong is the
 * failure mode this pipeline hides best.
 *
 * A plate that is never found produces "no plate read", which is
 * indistinguishable from a vehicle that genuinely had no visible plate. A
 * threshold with the polarity inverted produces white-on-black, which the
 * classifier reads as noise and reports as an empty result — again,
 * indistinguishable. Both look exactly like a working system watching an empty
 * driveway.
 */

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

interface Canvas {
  data: Uint8Array;
  width: number;
  height: number;
}

function canvas(width: number, height: number, level = 110): Canvas {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = level;
    data[i * 4 + 1] = level;
    data[i * 4 + 2] = level;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function fill(c: Canvas, x: number, y: number, w: number, h: number, level: number): void {
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= c.height) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= c.width) continue;
      const i = (yy * c.width + xx) * 4;
      c.data[i] = level;
      c.data[i + 1] = level;
      c.data[i + 2] = level;
    }
  }
}

/**
 * A plate-like target: a light rectangle carrying a run of dark bars.
 *
 * The bars are what matters. The detector keys on a dense run of *vertical*
 * edges packed into a wide, short box, which is the one property a row of
 * characters has and a plain light rectangle does not — so a fixture without
 * them would pass a detector that had stopped working.
 */
function drawPlate(c: Canvas, x: number, y: number, w: number, h: number, bars = 10): void {
  fill(c, x, y, w, h, 240);
  const pitch = w / bars;
  const barW = Math.max(2, Math.round(pitch * 0.45));
  for (let i = 0; i < bars; i++) {
    fill(c, Math.round(x + i * pitch + pitch * 0.25), y + Math.round(h * 0.15), barW, Math.round(h * 0.7), 20);
  }
}

function toJpeg(c: Canvas, quality = 85): Buffer {
  return jpeg.encode({ data: Buffer.from(c.data), width: c.width, height: c.height }, quality).data;
}

function gray(width: number, height: number, fillWith: (x: number, y: number) => number): Gray {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fillWith(x, y);
  return { data, width, height };
}

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

describe("decoding", () => {
  it("returns a greyscale plane of the right size", () => {
    const c = canvas(160, 120, 100);
    const g = decodeGray(toJpeg(c));
    assert.ok(g);
    assert.equal(g.width, 160);
    assert.equal(g.height, 120);
    assert.equal(g.data.length, 160 * 120);
    // A uniform grey stays that grey, within JPEG's rounding.
    assert.ok(Math.abs(g.data[0] - 100) <= 3, `got ${g.data[0]}`);
  });

  it("returns null for something that is not a JPEG", () => {
    /*
     * A camera publishing rubbish on the capture topic must cost that frame and
     * nothing else. Throwing here would reject the whole burst, and on the ANPR
     * path that means the arrival is lost rather than the picture.
     */
    assert.equal(decodeGray(Buffer.from("not an image at all")), null);
    assert.equal(decodeGray(Buffer.alloc(0)), null);
    assert.equal(decodeGray(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), null);
  });
});

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

describe("geometry", () => {
  it("crops within the image even when asked for more", () => {
    // The crop is taken around a detected box plus padding, so it routinely
    // asks for pixels past the edge. Reading out of bounds would either throw
    // on the hot path or silently wrap a row and feed the classifier a
    // scrambled strip.
    const g = gray(40, 30, (x) => x * 4);
    const c = crop(g, -10, -10, 100, 100);
    assert.equal(c.width, 40);
    assert.equal(c.height, 30);
    assert.equal(crop(g, 35, 25, 20, 20).width, 5);
  });

  it("enlarges without losing the picture", () => {
    const g = gray(20, 10, (x) => (x < 10 ? 0 : 255));
    const big = resize(g, 60, 30);
    assert.equal(big.width, 60);
    assert.equal(big.height, 30);
    // The dark half stays dark and the light half light: an upscale that
    // shifted or wrapped would show up immediately here.
    assert.ok(big.data[15 * 60 + 5] < 60);
    assert.ok(big.data[15 * 60 + 55] > 200);
  });

  it("never enlarges when only asked to fit", () => {
    // fitWithin bounds detector cost. If it enlarged, a small frame would cost
    // *more* to analyse than a large one.
    const g = gray(100, 50, () => 128);
    assert.equal(fitWithin(g, 640), g);
    assert.equal(fitWithin(g, 50).width, 50);
  });

  it("blurs in time that does not depend on the radius", () => {
    /*
     * The running-sum form is the reason the detector is usable at all: the
     * radius is a fraction of the image width, so the naive kernel is
     * O(pixels x radius^2) and takes seconds on a frame. This asserts the
     * result is still a blur — a uniform field must survive it unchanged,
     * including at the borders, where a mishandled edge clamp shows up as a
     * dark frame around the image.
     */
    const g = gray(64, 64, () => 200);
    const b = boxBlur(g, 9);
    for (const v of b.data) assert.ok(Math.abs(v - 200) <= 1, `border artefact: ${v}`);
  });
});

/* ------------------------------------------------------------------ */
/* Thresholding                                                        */
/* ------------------------------------------------------------------ */

describe("thresholding", () => {
  it("separates the two peaks of a bimodal image", () => {
    /*
     * Otsu is used instead of a constant because the same gate is a bright
     * scene at noon and a dark one at midnight, and any fixed level turns one
     * of them entirely black.
     *
     * The assertion is about *separation*, not about landing midway. Otsu
     * returns the level t for which `<= t` is one class and `> t` the other,
     * and with only two grey values every t in [40, 209] scores identically —
     * so it legitimately returns the first, 40. What matters is that the two
     * modes end up on opposite sides of the comparison the caller makes.
     */
    const dark = 40;
    const light = 210;
    const g = gray(100, 100, (x) => (x < 50 ? dark : light));
    const t = otsuThreshold(g);
    assert.ok(dark <= t && t < light, `threshold ${t} does not separate ${dark} from ${light}`);
    assert.equal(dark > t, false, "the dark mode must fall below the threshold");
    assert.equal(light > t, true, "the light mode must fall above the threshold");
  });

  it("produces only black and white", () => {
    const g = gray(80, 40, (x, y) => (x + y) % 256);
    for (const v of binariseForOcr(g).data) assert.ok(v === 0 || v === 255, `got ${v}`);
  });

  it("puts ink black and background white however it started", () => {
    /*
     * The polarity decision, and the reason it is made from the border rather
     * than the whole crop. Tesseract is trained on dark-on-light and reads the
     * inverse as noise — it does not fail loudly, it returns nothing, which is
     * indistinguishable from a vehicle with no plate.
     *
     * A night capture of a retro-reflective plate, or a crop that caught mostly
     * dark bodywork, arrives inverted.
     */
    const darkOnLight = gray(120, 40, (x, y) => (y > 8 && y < 32 && x % 12 < 5 ? 30 : 230));
    const lightOnDark = gray(120, 40, (x, y) => (y > 8 && y < 32 && x % 12 < 5 ? 230 : 30));

    for (const [name, g] of [["dark on light", darkOnLight], ["light on dark", lightOnDark]] as const) {
      const b = binariseForOcr(g);
      let white = 0;
      for (const v of b.data) if (v === 255) white++;
      const whiteFraction = white / b.data.length;
      assert.ok(
        whiteFraction > 0.5,
        `${name}: background should end up white, got ${(whiteFraction * 100).toFixed(0)}% white`
      );
    }
  });

  it("survives a lighting gradient across the strip", () => {
    /*
     * A plate half in shadow from a gate post is the everyday case, and a
     * single global threshold cuts the shadowed half entirely to black. The
     * illumination normalisation is what keeps the characters in the dark half.
     */
    const g = gray(160, 40, (x, y) => {
      const ink = y > 8 && y < 32 && x % 16 < 6;
      const light = 60 + (x / 160) * 180; // dark at the left, bright at the right
      return ink ? light * 0.25 : light;
    });
    const b = binariseForOcr(g);

    // Ink must be found at both ends, not just the well-lit one.
    const inkAt = (x: number) => b.data[20 * 160 + x] === 0;
    assert.ok(inkAt(2) || inkAt(3) || inkAt(4), "characters lost in the shadowed half");
    assert.ok(inkAt(146) || inkAt(147) || inkAt(148), "characters lost in the bright half");
  });
});

/* ------------------------------------------------------------------ */
/* PGM                                                                 */
/* ------------------------------------------------------------------ */

describe("the PGM handed to the classifier", () => {
  it("is a valid P5 with the plane appended", () => {
    // PGM because leptonica reads it natively and it needs no encoder. Writing
    // a JPEG here would add a lossy round trip immediately after thresholding,
    // which is exactly where losing a thin stroke costs a character.
    const g = gray(7, 3, (x) => x * 30);
    const pgm = toPgm(g);
    const header = "P5\n7 3\n255\n";
    assert.equal(pgm.subarray(0, header.length).toString("latin1"), header);
    assert.equal(pgm.length, header.length + 21);
    assert.equal(pgm[header.length + 2], 60);
  });
});

/* ------------------------------------------------------------------ */
/* Localisation                                                        */
/* ------------------------------------------------------------------ */

describe("finding the plate", () => {
  it("finds a plate-shaped run of characters", () => {
    /*
     * The stage the whole recogniser rests on. Handing a full frame to an OCR
     * engine does not fail cleanly — it returns the house number, the livery
     * and the road sign with equal confidence, and nothing downstream can tell
     * which one was the registration.
     */
    const c = canvas(800, 600, 105);
    fill(c, 0, 360, 800, 240, 55); // road
    fill(c, 150, 180, 500, 230, 90); // vehicle
    drawPlate(c, 300, 300, 260, 62);

    const g = decodeGray(toJpeg(c))!;
    const boxes = findPlates(g);
    assert.ok(boxes.length > 0, "the plate was not found at all");

    const best = boxes[0];
    const cx = best.x + best.w / 2;
    const cy = best.y + best.h / 2;
    assert.ok(Math.abs(cx - 430) < 90, `centre x ${cx.toFixed(0)} is not near the plate`);
    assert.ok(Math.abs(cy - 331) < 70, `centre y ${cy.toFixed(0)} is not near the plate`);
  });

  it("finds nothing in a frame with nothing in it", () => {
    /*
     * A real answer, and one worth protecting. Inventing a crop from the middle
     * of the frame rather than returning nothing would convert "no vehicle" into
     * a confident misread of whatever happened to be there.
     */
    const c = canvas(640, 480, 120);
    fill(c, 0, 300, 640, 180, 70);
    const g = decodeGray(toJpeg(c))!;
    assert.deepEqual(findPlates(g), []);
  });

  it("ignores a tall block of texture that is not plate-shaped", () => {
    // A radiator grille, a garden fence, a stack of shelving behind the gate:
    // all produce dense edges, and only the aspect ratio separates them from a
    // registration.
    const c = canvas(640, 480, 110);
    for (let i = 0; i < 12; i++) fill(c, 300, 100 + i * 22, 120, 10, 20);
    const g = decodeGray(toJpeg(c))!;
    for (const b of findPlates(g)) {
      assert.ok(b.w / b.h >= 1.6, `accepted a box with aspect ${(b.w / b.h).toFixed(2)}`);
    }
  });

  it("ranks the plate above a smaller patch of text", () => {
    /*
     * A gate camera sees signage, and the sign is often sharper than the plate.
     * The ranking is what makes the early exit in index.ts safe: the first
     * region tried should be the registration, so a successful read usually
     * costs one subprocess rather than three.
     */
    const c = canvas(800, 600, 105);
    fill(c, 0, 360, 800, 240, 55);
    fill(c, 150, 180, 500, 230, 90);
    drawPlate(c, 300, 300, 260, 62); // the plate
    drawPlate(c, 200, 205, 90, 22, 5); // small lettering higher up

    const g = decodeGray(toJpeg(c))!;
    const boxes = findPlates(g);
    assert.ok(boxes.length > 0);
    const cy = boxes[0].y + boxes[0].h / 2;
    assert.ok(cy > 270, `the top-ranked box at y=${cy.toFixed(0)} is not the plate`);
  });

  it("returns boxes in the full frame's coordinates, not the working size", () => {
    /*
     * Detection runs at a fixed 640px width so its cost does not depend on the
     * resolution somebody set, but the crop is taken from the original. If the
     * scale-back were missed, every crop on a camera above 640px wide would be
     * taken from the top-left corner — a bug that produces plausible-looking
     * strips of bodywork and never an error.
     */
    const c = canvas(1600, 1200, 105);
    fill(c, 0, 720, 1600, 480, 55);
    drawPlate(c, 600, 600, 520, 124);

    const g = decodeGray(toJpeg(c))!;
    const boxes = findPlates(g);
    assert.ok(boxes.length > 0);
    assert.ok(boxes[0].x > 400, `box x=${boxes[0].x.toFixed(0)} looks like working-size coordinates`);
    assert.ok(boxes[0].w > 300, `box w=${boxes[0].w.toFixed(0)} was not scaled back up`);
  });
});
