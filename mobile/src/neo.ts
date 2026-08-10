/*
 * Neumorphic shadow geometry, as data rather than JSX.
 *
 * Android cannot cast the shadow this style is made of. `elevation` draws one
 * shadow, downward, in a colour the platform picks; neumorphism needs two, a
 * dark one down-right and a light one up-left, and the light one is the half
 * that makes a surface look extruded rather than merely lifted. So the two
 * halves are painted as gradient layers behind the card face.
 *
 * The subtlety that made this invisible for months: each layer is the card's
 * own rectangle, shifted. The face is then drawn opaque on top of it. So the
 * ONLY part of a layer anyone ever sees is the few pixels sticking out past the
 * card edge on one side -- and the gradients were oriented so that the sliver
 * which sticks out was the transparent end. Both shadows were drawn correctly,
 * entirely underneath an opaque rectangle, with their invisible ends showing.
 * On iOS none of this code runs, which is why the same theme looked right there
 * and flat on Android.
 *
 * Hence `visibleAt`: the corner whose sliver is actually on screen. It is the
 * point a test can ask about, and the answer must never be "transparent".
 *
 * Kept free of react-native imports so it can be tested.
 */

export const NEO_DEPTH = 5;

export interface GradientPoint {
  x: number;
  y: number;
}

export interface NeoLayer {
  /** Absolute inset. Negative pushes the edge out past the card. */
  inset: { left: number; top: number; right: number; bottom: number };
  colors: [string, string, string];
  locations: [number, number, number];
  start: GradientPoint;
  end: GradientPoint;
  /**
   * The corner the visible sliver sits against, in the layer's own 0..1 space.
   * This is what the layer is for; the rest of it is covered.
   */
  visibleAt: GradientPoint;
}

export interface NeoLayers {
  dark: NeoLayer;
  light: NeoLayer;
}

/**
 * The two halves of a neumorphic extrusion.
 *
 * `dark` is drawn first so that where they overlap the light one wins, which is
 * what a single light source up and to the left actually produces.
 */
export function neoLayers(light: string, dark: string, depth: number = NEO_DEPTH): NeoLayers {
  const d = depth;
  return {
    dark: {
      inset: { left: d, top: d, right: -d, bottom: -d },
      colors: [dark, dark, "transparent"],
      locations: [0, 0.55, 1],
      // Solid at the bottom-right, which is the edge that shows, fading back
      // under the face. Reversing these two is what hid it.
      start: { x: 1, y: 1 },
      end: { x: 0.25, y: 0.25 },
      visibleAt: { x: 1, y: 1 },
    },
    light: {
      inset: { left: -d, top: -d, right: d, bottom: d },
      colors: [light, light, "transparent"],
      locations: [0, 0.55, 1],
      start: { x: 0, y: 0 },
      end: { x: 0.75, y: 0.75 },
      visibleAt: { x: 0, y: 0 },
    },
  };
}

/**
 * The colour a layer resolves to at a point, by projecting onto its axis.
 *
 * This is how a linear gradient is defined, and having it here means the
 * question "what does this layer look like where it can be seen" has an answer
 * that does not require a device.
 */
export function colorAt(layer: NeoLayer, at: GradientPoint): string {
  const ax = layer.end.x - layer.start.x;
  const ay = layer.end.y - layer.start.y;
  const len2 = ax * ax + ay * ay;
  if (len2 === 0) return layer.colors[0];

  const t = Math.min(1, Math.max(0, ((at.x - layer.start.x) * ax + (at.y - layer.start.y) * ay) / len2));

  for (let i = 0; i < layer.locations.length - 1; i++) {
    if (t <= layer.locations[i + 1]) {
      // Inside a band whose ends are the same colour, that colour holds.
      return layer.colors[i] === layer.colors[i + 1]
        ? layer.colors[i]
        : t - layer.locations[i] < layer.locations[i + 1] - t
          ? layer.colors[i]
          : layer.colors[i + 1];
    }
  }
  return layer.colors[layer.colors.length - 1];
}
