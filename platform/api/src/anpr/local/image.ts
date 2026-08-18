import jpeg from "jpeg-js";

/**
 * The image primitives the local recogniser needs, and nothing else.
 *
 * WHY THIS IS HAND-WRITTEN
 *
 * The obvious answer is `sharp`, and it is the wrong one here. It is a native
 * addon: the control plane ships as `node:20-alpine`, so it would need a musl
 * build, and a native binary that fails to load takes the whole API down at
 * `require` time rather than degrading the one feature that wanted it. What is
 * actually needed is a greyscale plane, a crop, a bilinear resize and a
 * threshold — four functions over a `Uint8Array`, none of which is subtle.
 *
 * `jpeg-js` is the single dependency, and only for the decode. It is pure
 * JavaScript with no transitive dependencies, which is the property that
 * matters: nothing new can fail to compile on the deployment target.
 *
 * Everything here works on an 8-bit greyscale plane. Colour is discarded at the
 * door because every later stage — edge density, thresholding, character
 * shape — is a luminance operation, and carrying three channels through them
 * would triple the memory on a VM with 400 MB free.
 */

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Largest frame decoded. A camera publishing something enormous is a fault. */
const MAX_PIXELS = 12_000_000;

/**
 * Decodes a JPEG to a greyscale plane.
 *
 * Returns null rather than throwing: this runs on the ANPR path, where a
 * corrupt frame must cost that frame and nothing else.
 */
export function decodeGray(buf: Buffer): Gray | null {
  let raw: { data: Uint8Array; width: number; height: number };
  try {
    // `useTArray` keeps the output a Uint8Array rather than a Node Buffer, and
    // `maxMemoryUsageInMB` bounds a malformed header claiming a huge canvas.
    raw = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 128 });
  } catch {
    return null;
  }
  if (!raw?.width || !raw?.height || raw.width * raw.height > MAX_PIXELS) return null;

  const n = raw.width * raw.height;
  const out = new Uint8Array(n);
  // Rec. 601 luma. Integer arithmetic, because this runs over every pixel of
  // every frame and the fractional precision buys nothing downstream.
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = (raw.data[p] * 77 + raw.data[p + 1] * 150 + raw.data[p + 2] * 29) >> 8;
  }
  return { data: out, width: raw.width, height: raw.height };
}

/** Clamps a rectangle to the image. */
export function clampRect(
  g: Gray,
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const x0 = Math.max(0, Math.min(g.width - 1, Math.round(x)));
  const y0 = Math.max(0, Math.min(g.height - 1, Math.round(y)));
  const x1 = Math.max(x0 + 1, Math.min(g.width, Math.round(x + w)));
  const y1 = Math.max(y0 + 1, Math.min(g.height, Math.round(y + h)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function crop(g: Gray, x: number, y: number, w: number, h: number): Gray {
  const r = clampRect(g, x, y, w, h);
  const out = new Uint8Array(r.w * r.h);
  for (let row = 0; row < r.h; row++) {
    out.set(g.data.subarray((r.y + row) * g.width + r.x, (r.y + row) * g.width + r.x + r.w), row * r.w);
  }
  return { data: out, width: r.w, height: r.h };
}

/**
 * Bilinear resize.
 *
 * Bilinear rather than nearest-neighbour because this is used to *enlarge* a
 * small plate before recognition, and nearest-neighbour enlargement produces
 * hard stair-stepped strokes that a character classifier reads as texture.
 * Bilinear leaves a smooth edge for the threshold to cut cleanly.
 */
export function resize(g: Gray, width: number, height: number): Gray {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w === g.width && h === g.height) return g;

  const out = new Uint8Array(w * h);
  const sx = g.width / w;
  const sy = g.height / h;

  for (let y = 0; y < h; y++) {
    const fy = Math.min(g.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(g.height - 1, y0 + 1);
    const wy = fy - y0;

    for (let x = 0; x < w; x++) {
      const fx = Math.min(g.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(g.width - 1, x0 + 1);
      const wx = fx - x0;

      const a = g.data[y0 * g.width + x0];
      const b = g.data[y0 * g.width + x1];
      const c = g.data[y1 * g.width + x0];
      const d = g.data[y1 * g.width + x1];
      out[y * w + x] =
        (a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy) | 0;
    }
  }
  return { data: out, width: w, height: h };
}

/** Scales so the longest side is at most `max`. Never enlarges. */
export function fitWithin(g: Gray, max: number): Gray {
  const longest = Math.max(g.width, g.height);
  if (longest <= max) return g;
  const k = max / longest;
  return resize(g, g.width * k, g.height * k);
}

/**
 * Otsu's threshold: the level that best separates the histogram into two
 * classes.
 *
 * A fixed threshold cannot work here. The same gate is a bright overexposed
 * scene at noon and a dark one lit by headlights at night, and any constant
 * turns one of those entirely black or entirely white. Otsu derives the level
 * from the image in front of it, which is the whole reason it is used rather
 * than a number somebody tuned once.
 */
export function otsuThreshold(g: Gray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;

  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/**
 * Evens out illumination before thresholding.
 *
 * A single global threshold fails on the picture this system actually gets: a
 * plate half in shadow from a gate post, or one corner blown out by a
 * headlight. Dividing by a heavily blurred copy of the image removes the slow
 * background gradient and leaves the local contrast — the characters — which a
 * global threshold can then cut correctly.
 *
 * The blur radius is proportional to the strip height, so it tracks the size of
 * the illumination change rather than the size of the characters. A radius near
 * the stroke width would erase the very thing being kept.
 */
export function normaliseIllumination(g: Gray): Gray {
  const radius = Math.max(4, Math.round(g.height * 0.6));
  const blurred = boxBlur(g, radius);
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < g.data.length; i++) {
    // +1 so a black background cannot divide by zero; x128 keeps mid-grey mid.
    const v = ((g.data[i] + 1) / (blurred.data[i] + 1)) * 128;
    out[i] = v > 255 ? 255 : v < 0 ? 0 : v | 0;
  }
  return { data: out, width: g.width, height: g.height };
}

/**
 * Separable box blur with a running sum — O(pixels), independent of radius.
 *
 * The naive form is O(pixels x radius^2), and the radius here is a fraction of
 * the image height, so on an SVGA frame that is the difference between a few
 * milliseconds and several seconds on a 2 vCPU VM.
 */
export function boxBlur(g: Gray, radius: number): Gray {
  const r = Math.max(1, Math.round(radius));
  const { width: w, height: h } = g;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += g.data[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (sum / (2 * r + 1)) | 0;
      sum -= g.data[row + Math.min(w - 1, Math.max(0, x - r))];
      sum += g.data[row + Math.min(w - 1, Math.max(0, x + r + 1))];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / (2 * r + 1)) | 0;
      sum -= tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x];
      sum += tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Binarises to black text on a white background, whichever way round it began.
 *
 * Indian plates are dark characters on white, yellow or green, so the common
 * case is already right — but a crop that caught mostly dark bodywork, or a
 * night shot where the retro-reflective plate is the brightest thing in frame,
 * inverts it. Tesseract is trained on dark-on-light and reads the inverse as
 * noise, so the polarity is decided from the image rather than assumed.
 *
 * The decision is made on the *border* pixels, not the whole crop: the border
 * of a plate crop is the plate's background, while the middle is whatever
 * fraction of it happens to be ink.
 */
export function binariseForOcr(g: Gray): Gray {
  const norm = normaliseIllumination(g);
  const t = otsuThreshold(norm);

  let borderSum = 0;
  let borderCount = 0;
  const band = Math.max(1, Math.round(g.height * 0.12));
  for (let y = 0; y < norm.height; y++) {
    const edgeRow = y < band || y >= norm.height - band;
    for (let x = 0; x < norm.width; x++) {
      if (edgeRow || x < band || x >= norm.width - band) {
        borderSum += norm.data[y * norm.width + x];
        borderCount++;
      }
    }
  }
  const borderIsLight = borderCount > 0 && borderSum / borderCount > t;

  const out = new Uint8Array(norm.data.length);
  for (let i = 0; i < norm.data.length; i++) {
    const above = norm.data[i] > t;
    // Background must end up white (255), ink black (0).
    out[i] = (borderIsLight ? above : !above) ? 255 : 0;
  }
  return { data: out, width: norm.width, height: norm.height };
}

/**
 * Encodes a greyscale plane as binary PGM (P5).
 *
 * PGM because leptonica reads it natively and it is a 15-byte header followed
 * by the plane — no encoder, no dependency, and no compression step on an image
 * that is about to be read back by a process on the same machine. Writing a
 * JPEG here would add a lossy round trip between the thresholding and the
 * classifier, which is precisely where losing a thin stroke costs a character.
 */
export function toPgm(g: Gray): Buffer {
  const header = Buffer.from(`P5\n${g.width} ${g.height}\n255\n`, "latin1");
  return Buffer.concat([header, Buffer.from(g.data.buffer, g.data.byteOffset, g.data.length)]);
}
