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
  /** Alpha of the innermost, strongest layer of the dark half. */
  strength: number;
  /**
   * The light half, separately.
   *
   * On a pale canvas a white shadow at the same alpha as the dark one reads as
   * a bright ring hugging the card rather than as light falling on it — which
   * is exactly how the first Android version differed from iOS.
   */
  lightStrength: number;
}

/*
 * These numbers are chosen against iOS, not in the abstract.
 *
 * A real gaussian blur redistributes a shadow's alpha across its whole radius,
 * so the darkest pixel is far fainter than the source colour. Stacked layers do
 * not: whatever `strength` says lands at full value right against the card
 * edge. Carrying iOS's shadowOpacity of 1 across to this technique is what made
 * Android look embossed and hard next to the same theme on an iPhone.
 *
 * So the strengths are low and the step count is high. Nine steps over
 * fourteen points is about 1.5pt per band, which is below what reads as a
 * ring; six steps over ten was 1.7pt at three times the alpha, and the bands
 * were visible as contour lines around every tile.
 */
export const NEO: NeoSpec = { depth: 5, blur: 14, steps: 9, strength: 0.22, lightStrength: 0.4 };

/** Small controls get a shallower, cheaper version of the same treatment. */
export const NEO_SMALL: NeoSpec = { depth: 3, blur: 7, steps: 5, strength: 0.18, lightStrength: 0.34 };

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
  const { depth, blur, steps } = spec;
  // The light half is the one that has to stay subtle; see NeoSpec.
  const strength = dir === 1 ? spec.strength : spec.lightStrength;
  const out: NeoShadowLayer[] = [];

  for (let i = 0; i < steps; i++) {
    // 0 at the outer edge, 1 at the core.
    const t = steps === 1 ? 1 : i / (steps - 1);
    const grow = blur * (1 - t);

    /*
     * Cubic, not linear and not quadratic.
     *
     * The falloff decides whether this reads as a shadow or as a ring. A linear
     * ramp leaves the outermost layer carrying a visible fraction of the alpha,
     * so the shadow ends on a step you can see. Quadratic fixed the outer edge
     * but still stacked enough alpha in the middle bands to show contour lines
     * around every tile, which is what made Android look embossed beside iOS.
     * Cubing pushes almost all of the weight into the last band or two, which
     * is where a real blur puts it as well.
     */
    const opacity = strength * t * t * t;

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
