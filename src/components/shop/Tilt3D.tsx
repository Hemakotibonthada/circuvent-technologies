"use client";

/**
 * Tilt3D — real perspective projection for a card.
 *
 * WHY CSS 3D AND NOT WEBGL
 *
 * The obvious reading of "make it 3D" is three.js. It was rejected, and the
 * reasoning matters more than the result:
 *
 *  1. **There is nothing to render.** Every product ships as flat SVG or raster
 *     art (`public/img/product-*.svg`). There is no GLTF, no mesh, no material.
 *     Standing up a WebGL renderer to texture a quad with a flat SVG is a
 *     ~600 kB dependency doing what a `transform` does for free.
 *  2. **This is a commerce surface.** `/shop` is `force-dynamic`, server-
 *     rendered, and carries JSON-LD, canonicals and robots directives. Its LCP
 *     is revenue. The design database's own note on the Immersive pattern is
 *     "Performance trade-off. Mobile fallback essential."
 *  3. **Nothing here needs a depth buffer.** Card tilt, parallax layers and a
 *     specular sweep are affine transforms in a perspective projection — which
 *     is precisely what the compositor already does, on the GPU, without
 *     blocking the main thread.
 *
 * So this is genuine 3D — a perspective frustum, layers at real Z offsets,
 * rotation about X and Y — implemented in the layer the browser is already
 * running. Only `transform` and `opacity` are animated, which is the one rule
 * the UX database marks explicitly under Transform Performance.
 *
 * WHERE IT TURNS ITSELF OFF
 *
 * - `prefers-reduced-motion` — parallax and tilt are the classic vestibular
 *   trigger. The card renders completely flat, not "a bit less tilted".
 * - Coarse pointers — a finger has no hover position, so tilt driven by
 *   pointer coordinates would fire once on tap and stick. Touch devices get
 *   the flat card, which is also the cheapest one.
 * - No pointer yet — the resting state is the flat state, so nothing moves
 *   until the user actually points at it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tilt3DProps {
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees at the far edge. */
  max?: number;
  /**
   * Distance from the viewer to the projection plane, in px.
   *
   * Smaller is a wider frustum and a stronger effect. 900 keeps a ~360px card
   * believable; below ~600 the near corner distorts enough to read as a bug.
   */
  perspective?: number;
  /** Lifts the whole card toward the viewer on hover. */
  lift?: number;
  /** Adds a pointer-tracking specular sweep across the surface. */
  sheen?: boolean;
}

/** True when the device can actually hover — i.e. tilt has a meaning. */
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return fine;
}

export default function Tilt3D({
  children,
  className,
  max = 9,
  perspective = 900,
  lift = 14,
  sheen = true,
}: Tilt3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const enabled = fine && !reduce;

  // -0.5 … 0.5 across the card, so the resting position is the centre.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const hoverAmt = useMotionValue(0);

  /*
   * Springs, not linear tweens.
   *
   * A pointer produces jittery, irregularly-spaced samples; mapping them
   * straight to rotation makes the card twitch on every mousemove. The spring
   * gives the surface mass, so it reads as a physical panel being tipped
   * rather than a value being assigned.
   */
  const spring = { stiffness: 220, damping: 26, mass: 0.6 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);
  const sLift = useSpring(hoverAmt, { stiffness: 260, damping: 30 });

  // Pointer right ⇒ card turns right: rotateY follows +x, rotateX opposes +y.
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);
  const z = useTransform(sLift, [0, 1], [0, lift]);
  const sheenX = useTransform(sx, [-0.5, 0.5], ["18%", "82%"]);
  const sheenY = useTransform(sy, [-0.5, 0.5], ["12%", "88%"]);
  const sheenOpacity = useTransform(sLift, [0, 1], [0, 0.55]);
  /*
   * Hoisted deliberately. Built inside the `sheen && (...)` branch it would be
   * a conditionally-called hook — React would keep the hook order stable only
   * while `sheen` never changed, and break the moment it did.
   */
  const sheenGradient = useTransform(
    [sheenX, sheenY],
    ([x, y]: string[]) =>
      `radial-gradient(38% 46% at ${x} ${y}, rgba(255,255,255,0.34), transparent 70%)`
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      px.set((e.clientX - r.left) / r.width - 0.5);
      py.set((e.clientY - r.top) / r.height - 0.5);
    },
    [enabled, px, py]
  );

  const onEnter = useCallback(() => enabled && hoverAmt.set(1), [enabled, hoverAmt]);

  const onLeave = useCallback(() => {
    // Always returns to flat, so a card can never be left tilted — including
    // when the pointer leaves during a scroll.
    hoverAmt.set(0);
    px.set(0);
    py.set(0);
  }, [hoverAmt, px, py]);

  if (!enabled) {
    // Flat, and with no motion values subscribed: the reduced-motion and touch
    // paths cost nothing rather than costing a disabled animation.
    return <div className={cn("relative", className)}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={cn("relative", className)}
      style={{ perspective, transformStyle: "preserve-3d" }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          z,
          transformStyle: "preserve-3d",
          // Without this the browser rasterises children at their pre-rotation
          // resolution, so text inside a tilted card goes soft.
          willChange: "transform",
        }}
        className="relative h-full w-full"
      >
        {children}

        {sheen && (
          /*
           * The specular highlight. It is what sells the surface as a physical
           * object: a flat panel that tilts but reflects nothing reads as a
           * picture of a card, not a card.
           *
           * pointer-events-none so it never intercepts a click on the CTA
           * underneath, and mix-blend-plus-lighter so it brightens the artwork
           * rather than fogging it grey.
           */
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-plus-lighter"
            style={{
              opacity: sheenOpacity,
              background: sheenGradient,
              transform: "translateZ(1px)",
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

/**
 * A child that sits at a real Z offset inside a Tilt3D.
 *
 * This is what makes the effect read as depth rather than as a skew: when the
 * card rotates, layers at different Z values sweep across each other by
 * different amounts, which is parallax and is the cue the eye actually reads.
 * A card whose contents are all coplanar just looks bent.
 *
 * `className` is passed through untouched rather than merged onto a hardcoded
 * `relative`, because callers need to position these absolutely (a badge
 * strip, a hover CTA) and a baked-in `relative` would fight them. The
 * `translateZ` already establishes a containing block, so absolutely
 * positioned descendants still resolve against this element.
 */
export function Depth({
  z = 24,
  className,
  children,
}: {
  z?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className}
      style={{ transform: `translateZ(${z}px)`, transformStyle: "preserve-3d" }}
    >
      {children}
    </div>
  );
}
