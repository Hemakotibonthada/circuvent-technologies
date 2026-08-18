import { boxBlur, fitWithin, type Gray } from "./image";

/**
 * Finding the plate in the picture.
 *
 * WHY LOCALISATION IS THE WHOLE PROBLEM
 *
 * Handing a full frame to an OCR engine does not work, and it fails in the way
 * that wastes the most time: it returns *something*. A gate camera sees a
 * house number, a delivery van's livery, a road sign and a bumper sticker, and
 * a general text recogniser reads all of them with the same enthusiasm it reads
 * the registration. The plate is then one string among six, and nothing
 * downstream can tell which.
 *
 * A plate has a property almost nothing else in the scene has: a dense run of
 * strong *vertical* edges packed into a short, wide rectangle. Ten high-contrast
 * characters side by side produce twenty-odd near-vertical strokes within a few
 * centimetres. Foliage has edges in every direction, bodywork has almost none,
 * and a long horizontal shadow has the wrong shape. So the detector is built on
 * horizontal gradient — the response to vertical edges — rather than on colour
 * (which varies by plate class and is destroyed by headlights at night) or on
 * template matching (which works on the plate it was tuned against).
 *
 * This is a *proposer*, not a decision. It returns several candidates ranked by
 * plausibility; `plate.ts` decides whether any of them is a registration, and it
 * rejects far more than this stage does. Being generous here is cheap — an
 * extra crop is a few milliseconds of OCR — while being strict is expensive,
 * because a plate this stage misses is a vehicle the gate never read.
 */

export interface PlateBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Higher is more plate-like. Ordering only; not a probability. */
  score: number;
}

/**
 * The frame is analysed at this width, not at capture resolution.
 *
 * Detection needs the *shape* of the edge density, which survives downscaling
 * perfectly well, and the cost of every operation below is linear in pixels. An
 * SVGA frame is 480k pixels and a UXGA one is 1.9M; fixing the working width
 * makes the detector's cost independent of what resolution somebody set. The
 * boxes are scaled back up, and the crop is always taken from the full-
 * resolution original, so nothing is actually recognised at this size.
 */
const WORK_WIDTH = 640;

/** Indian plates are ~4.7:1 single-row and ~2:1 two-row. Bracketed generously. */
const MIN_ASPECT = 1.6;
const MAX_ASPECT = 8.0;

/** As a fraction of frame width/height. A plate filling the frame is a crop. */
const MIN_W_FRAC = 0.06;
const MAX_W_FRAC = 0.95;
const MIN_H_FRAC = 0.015;
const MAX_H_FRAC = 0.45;

/**
 * Horizontal gradient magnitude — the response to vertical edges.
 *
 * A 3x3 Sobel rather than a plain difference, because the vertical smoothing in
 * the kernel is what suppresses single-pixel sensor noise. On a night frame at
 * high gain that noise is dense enough to look like texture, and an unsmoothed
 * difference finds "edges" all over the sky.
 */
function verticalEdges(g: Gray): Gray {
  const { width: w, height: h, data } = g;
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] + data[i - w + 1] +
        -2 * data[i - 1] + 2 * data[i + 1] +
        -data[i + w - 1] + data[i + w + 1];
      const v = gx < 0 ? -gx : gx;
      out[i] = v > 255 ? 255 : v;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Turns the edge image into solid blobs where edges are *dense*.
 *
 * A wide, short blur is the whole trick. Blurring much further horizontally
 * than vertically merges characters that sit side by side into one region while
 * keeping separate lines of text apart — so a plate becomes a single rectangle
 * rather than ten disconnected strokes, and the sign above it does not merge
 * into it. It is the separable-blur equivalent of a morphological closing with
 * a wide flat structuring element, and costs two passes instead of a per-pixel
 * neighbourhood scan.
 */
function densityMap(edges: Gray): Gray {
  const wide = boxBlur(edges, Math.max(3, Math.round(edges.width * 0.02)));
  // A second, taller pass fills the gap between the two rows of a two-line
  // plate without reaching the next object up or down.
  return boxBlur(wide, Math.max(2, Math.round(edges.height * 0.006)));
}

/**
 * Threshold for "dense enough to be text", derived from the image.
 *
 * Mean plus a multiple of the standard deviation rather than a constant: a
 * flat, foggy frame and a harsh sunlit one have completely different absolute
 * gradient levels, and any fixed number selects everything in one and nothing
 * in the other.
 */
function densityThreshold(d: Gray): number {
  let sum = 0;
  for (let i = 0; i < d.data.length; i++) sum += d.data[i];
  const mean = sum / d.data.length;

  let varSum = 0;
  for (let i = 0; i < d.data.length; i++) {
    const dv = d.data[i] - mean;
    varSum += dv * dv;
  }
  const sd = Math.sqrt(varSum / d.data.length);
  return Math.max(12, mean + sd * 0.9);
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

/**
 * Connected components over the thresholded density map.
 *
 * Iterative flood fill with an explicit stack, not recursion: a single
 * component can span a large fraction of a 640-wide frame, and a recursive fill
 * over tens of thousands of pixels overflows the call stack — which crashes the
 * process rather than failing the read.
 */
function components(mask: Uint8Array, w: number, h: number, minPixels: number): Component[] {
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;

    seen[start] = 1;
    stack.length = 0;
    stack.push(start);

    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let pixels = 0;

    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      pixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 4-connectivity. 8 merges a plate with anything touching it diagonally,
      // which at this blur radius is frequently the car's own trim.
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }

    if (pixels >= minPixels) out.push({ minX, minY, maxX, maxY, pixels });
  }
  return out;
}

/**
 * Ranks the plate candidates in a frame, best first.
 *
 * Returns an empty array when nothing is plausible — which is a real answer.
 * "A vehicle arrived and no plate was visible" is a fact worth recording, and
 * inventing a crop from the middle of the frame to avoid returning nothing
 * would turn it into a confident misread.
 */
export function findPlates(full: Gray, limit = 3): PlateBox[] {
  const work = fitWithin(full, WORK_WIDTH);
  const scale = full.width / work.width;

  const density = densityMap(verticalEdges(work));
  const t = densityThreshold(density);

  const mask = new Uint8Array(density.data.length);
  for (let i = 0; i < density.data.length; i++) mask[i] = density.data[i] >= t ? 1 : 0;

  const minPixels = Math.max(40, Math.round(work.width * work.height * 0.0004));
  const boxes: PlateBox[] = [];

  for (const c of components(mask, work.width, work.height, minPixels)) {
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    const aspect = w / h;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
    if (w < work.width * MIN_W_FRAC || w > work.width * MAX_W_FRAC) continue;
    if (h < work.height * MIN_H_FRAC || h > work.height * MAX_H_FRAC) continue;

    /*
     * How solidly the component fills its own bounding box. A plate blurs into
     * a nearly solid rectangle; a branch or a cable produces a long straggly
     * component whose box is mostly empty. This is the single most useful
     * discriminator after aspect ratio.
     */
    const fill = c.pixels / (w * h);
    if (fill < 0.45) continue;

    /*
     * Preference for the classic single-row proportions, and for a candidate
     * low in the frame — a plate is on a vehicle, and a vehicle is on the
     * ground, whereas signage and windows are above it. Both are gentle
     * nudges, not filters: a camera mounted low looking up at a gate sees the
     * plate high in frame, and rejecting on that would break that install
     * entirely.
     */
    const aspectScore = 1 - Math.min(1, Math.abs(aspect - 4.5) / 4.5);
    const lowInFrame = (c.minY + c.maxY) / 2 / work.height;
    const areaScore = Math.min(1, (w * h) / (work.width * work.height * 0.05));

    boxes.push({
      x: c.minX * scale,
      y: c.minY * scale,
      w: w * scale,
      h: h * scale,
      score: aspectScore * 0.45 + fill * 0.25 + lowInFrame * 0.15 + areaScore * 0.15,
    });
  }

  return boxes.sort((a, b) => b.score - a.score).slice(0, limit);
}
