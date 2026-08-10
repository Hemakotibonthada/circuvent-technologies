/*
 * Colour conversion for the light picker.
 *
 * Kept apart from the component because this is the part that can be wrong in
 * ways you cannot see: a hue that drifts a degree per round trip looks fine in
 * a screenshot and slowly turns a saved orange into a yellow every time the
 * screen is opened. It is also the only part worth testing directly.
 *
 * Devices speak hex, because that is what the firmware's `color` field has
 * always taken. The picker thinks in HSV, because a 2D grid of hue against
 * saturation is the thing people can actually aim at.
 */

export interface Hsv {
  /** 0–360, wrapping. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Wraps rather than clamps: 361° is 1°, and dragging past the end of the
 *  spectrum should come back round rather than stick on magenta. */
export const wrapHue = (h: number) => ((h % 360) + 360) % 360;

const hex2 = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, "0");

export function hsvToHex({ h, s, v }: Hsv): string {
  const hh = wrapHue(h) / 60;
  const c = clamp01(v) * clamp01(s);
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = clamp01(v) - c;
  const seg = Math.floor(hh) % 6;
  const rgb: [number, number, number] =
    seg === 0 ? [c, x, 0] :
    seg === 1 ? [x, c, 0] :
    seg === 2 ? [0, c, x] :
    seg === 3 ? [0, x, c] :
    seg === 4 ? [x, 0, c] :
                [c, 0, x];
  return `#${hex2(rgb[0] + m)}${hex2(rgb[1] + m)}${hex2(rgb[2] + m)}`;
}

/**
 * Parses `#rgb` and `#rrggbb`, with or without the hash.
 *
 * Returns null rather than a default for anything else. A device that reports
 * something unexpected should leave the pointer where the user put it, not
 * silently yank it to red — which is what falling back to #000000 would do.
 */
export function hexToHsv(hex: string): Hsv | null {
  if (typeof hex !== "string") return null;
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;

  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: wrapHue(h), s: max === 0 ? 0 : d / max, v: max };
}

/*
 * The hue stops the grid is painted with. Six 60° steps plus the wrap back to
 * red, so the gradient is linear in hue and the pointer's x position means
 * exactly what the colour under it is.
 */
export const HUE_STOPS = [0, 60, 120, 180, 240, 300, 360].map((h) =>
  hsvToHex({ h, s: 1, v: 1 })
);

/**
 * Named colours worth one tap.
 *
 * Whites are the reason this exists: fully desaturated is a straight line
 * along the bottom of the grid, so "warm white" is a pixel-hunt on an edge.
 * These are the ones people actually ask a lamp for.
 */
export const COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: "Warm", hex: "#ffd7a0" },
  { label: "White", hex: "#ffffff" },
  { label: "Cool", hex: "#cfe4ff" },
  { label: "Red", hex: "#ff4d4d" },
  { label: "Green", hex: "#4dff88" },
  { label: "Blue", hex: "#4d94ff" },
  { label: "Violet", hex: "#b84dff" },
];
