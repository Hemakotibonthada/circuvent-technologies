/*
 * Neumorphism on Android, built out of what Android actually gives us.
 *
 * The style is one claim: the surface is not drawn on the background, it is
 * pushed out of it. That reads only if there are two shadows in the palette's
 * own colours — dark below-right, light above-left — and only if both are soft.
 * Hard edges read as a sticker with a border.
 *
 * Android offers none of that. `elevation` is a single grey drop shadow whose
 * colour and offset are the platform's business, not ours. react-native-svg is
 * installed but this version ships no filter primitives at all, so there is no
 * feGaussianBlur to lean on. expo-blur blurs what is *behind* a view, which is
 * a different thing entirely.
 *
 * Two previous attempts failed here, and both failed silently, which is the
 * part worth remembering:
 *
 *   1. Two LinearGradients offset behind the card. Each layer was the card's
 *      own rectangle, so all that ever showed was a few pixels past one edge —
 *      and the gradients were oriented so that the visible sliver was their
 *      transparent end. Correct, invisible.
 *   2. The same, oriented correctly. Now visible, but a 5px band of flat colour
 *      with a hard outer edge, which is a bevel, not a shadow.
 *
 * So the blur is built rather than borrowed: the same rounded rectangle drawn
 * several times, each a little larger and a little more transparent. Where the
 * layers overlap the alpha accumulates, which is a falloff — quadratic here,
 * because a linear ramp still shows its outermost edge. It is a real gradient
 * of light, not a band, and being ordinary Views it cannot fail to render.
 *
 * Cost is honest: `steps` Views per shadow, so 12 for a card at the default.
 * Cheap for cards and panels, deliberately not for something drawn per list row
 * — hence `steps` being a parameter rather than a constant.
 *
 * iOS is left alone. shadowColor/shadowOffset accept any colour there, two
 * nested Views give the real thing, and imitating it would be worse.
 */

export interface NeoShadowLayer {
  /** Absolute inset from the surface's own box. Negative extends past the edge. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  borderRadius: number;
  /** 0..1, before compositing with the layers over it. */
  opacity: number;
}

export interface NeoSpec {
  /** How far the surface sits off the background. */
  depth: number;
  /** How far the shadow spreads past the offset before it is gone. */
  blur: number;
  /** Layers per shadow. More is smoother and costs a View each. */
  steps: number;
  /** Alpha of the innermost, strongest layer. */
  strength: number;
}

export const NEO: NeoSpec = { depth: 6, blur: 10, steps: 6, strength: 0.5 };

/** Small controls get a shallower, cheaper version of the same treatment. */
export const NEO_SMALL: NeoSpec = { depth: 3, blur: 5, steps: 4, strength: 0.45 };

/**
 * The stack for one shadow.
 *
 * `dir` is +1 for the dark shadow, which falls down and to the right, and -1
 * for the light one, which falls up and to the left — a single light source
 * above and to the left, which is the whole convention the style rests on.
 *
 * Layers run outermost-first so they can be rendered in order: the faintest,
 * widest one is furthest back, and each stronger layer sits on top.
 */
export function shadowLayers(dir: 1 | -1, radius: number, spec: NeoSpec = NEO): NeoShadowLayer[] {
  const { depth, blur, steps, strength } = spec;
  const out: NeoShadowLayer[] = [];

  for (let i = 0; i < steps; i++) {
    // 0 at the outer edge, 1 at the core.
    const t = steps === 1 ? 1 : i / (steps - 1);
    const grow = blur * (1 - t);

    /*
     * Quadratic, not linear.
     *
     * With a linear ramp the outermost layer still carries a visible fraction
     * of the alpha, so the shadow ends on a step you can see — which is the
     * hard edge this exists to avoid. Squaring pulls the outer layers close
     * enough to nothing that the edge disappears into the background.
     */
    const opacity = strength * t * t;

    const offset = depth * dir;
    out.push({
      left: offset - grow,
      top: offset - grow,
      right: -offset - grow,
      bottom: -offset - grow,
      borderRadius: radius + grow,
      opacity,
    });
  }

  return out;
}

/** How far past the surface the shadows reach, for a parent that must not clip. */
export function shadowExtent(spec: NeoSpec = NEO): number {
  return spec.depth + spec.blur;
}

/**
 * `rgba()` for a #rrggbb colour.
 *
 * The layers need per-layer alpha, and React Native will not accept a separate
 * opacity on a background colour without allocating an animated node for it.
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((ch) => ch + ch).join("") : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(0,0,0,${clamp01(alpha)})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
