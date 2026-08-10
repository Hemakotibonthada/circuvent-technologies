"use client";

/**
 * ShopStage — a full-bleed product stage, one product at a time.
 *
 * WHAT THIS IS BUILT FROM
 *
 * Two references, and the brief was "both". They share a structure — one
 * product staged at a time, oversized headline, arrows to move between them —
 * and have opposite palettes: one light and airy with soft colour auras behind
 * floating products, the other a dark showroom with a product in a lit alcove
 * and extruded type.
 *
 * Rather than pick, or average them into something that is neither, the two
 * are mapped onto the theme the site already has: **light mode is the airy
 * one, dark mode is the showroom.** Same geometry, same component, same
 * markup; the alcove's lighting, the type's extrusion and the aura's strength
 * all read from CSS variables. A blend would have produced a washed-out
 * showroom and a muddy airy version — this way each theme gets the reference
 * that was designed for its luminance.
 *
 * WHAT IS DELIBERATELY NOT COPIED
 *
 * Neither reference has to be a real shop. This one does:
 *
 *  - The stage is not the only route to a product. The grid, the filters and
 *    every crawlable category link are still below it, server-rendered. A
 *    carousel is a showcase, never the navigation — a product reachable only
 *    by clicking through five slides is a product nobody buys.
 *  - Auto-advance stops on hover, on focus, and entirely under
 *    prefers-reduced-motion. A carousel that moves while somebody is reading
 *    is the single most complained-about pattern on the web.
 *  - "Add to bag" adds to the real cart, not a mockup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { formatINR, type Product } from "@/lib/shop-data";
import { discountPct, isSoldOut } from "@/lib/shop-filters";
import { useCart } from "./CartProvider";
import { useToast } from "./ToastProvider";
import Tilt3D from "./Tilt3D";

interface ShopStageProps {
  products: Product[];
  eyebrow: string;
  /** Sits behind the stage as the oversized, extruded headline. */
  headline: string;
}

/** Timing from the design system's Stagger List preset (back.out ≈ this cubic). */
const EASE_BACK: [number, number, number, number] = [0.34, 1.3, 0.64, 1];
const AUTO_MS = 6500;

export default function ShopStage({ products, eyebrow, headline }: ShopStageProps) {
  const reduce = useReducedMotion();
  const { add } = useCart();
  const { toast } = useToast();

  const slides = useMemo(() => products.filter((p) => !!p.image).slice(0, 6), [products]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Direction drives which side a slide enters from, so forward and backward
  // read as movement along a track rather than as an arbitrary swap.
  const [dir, setDir] = useState(1);
  const regionRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => {
      if (slides.length === 0) return;
      setDir(delta);
      setIndex((i) => (i + delta + slides.length) % slides.length);
    },
    [slides.length]
  );

  /*
   * Auto-advance, with three separate ways to stop it.
   *
   * Reduced motion disables it outright — this is exactly the "content moves
   * without my input" case that guideline exists for. Hover and focus pause
   * it, because a carousel that advances while somebody is reading a price or
   * tabbing toward the buy button is actively hostile.
   */
  useEffect(() => {
    if (reduce || paused || slides.length < 2) return;
    const t = setInterval(() => go(1), AUTO_MS);
    return () => clearInterval(t);
  }, [reduce, paused, slides.length, go]);

  // Arrow keys, but only while the stage has focus inside it — binding them
  // globally would hijack arrow keys for the whole page.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    },
    [go]
  );

  if (!slides.length) return null;

  const p = slides[index]!;
  const discount = discountPct(p);
  const soldOut = isSoldOut(p);

  const handleAdd = () => {
    if (soldOut) return;
    add(p, 1, { silent: true });
    toast({
      title: `${p.name} added to cart`,
      description: formatINR(p.price),
      action: { label: "View cart", href: "/cart" },
    });
  };

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-label="Featured products"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
      className="cv-stage relative overflow-hidden rounded-[28px] border"
      style={{ borderColor: "var(--border-primary)", background: "var(--stage-bg)" }}
    >
      {/*
        * The oversized headline, extruded.
        *
        * Layered text-shadow rather than a WebGL or SVG extrusion: it is one
        * property, it scales with the font, it inherits the theme's colour,
        * and it costs nothing. `aria-hidden` because it repeats the eyebrow
        * and the section label — a screen reader announcing "Smart home"
        * twice before reaching the product is noise.
        *
        * Anchored to the top with the content padded below it. The first
        * version centred it vertically, where the glass panel covered all but
        * two letters — the single largest element on the page, illegible.
        */}
      <div
        aria-hidden="true"
        className="cv-stage-type pointer-events-none absolute inset-x-0 top-3 select-none px-4 text-center font-extrabold tracking-tight sm:top-5"
      >
        {headline}
      </div>

      {/* Soft aura behind the product. Strong and colourful in light mode,
          reduced to a faint glow in dark, where the alcove does the work. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(42% 46% at 68% 58%, ${p.accent}2b, transparent 70%)`,
        }}
      />

      <div className="relative grid gap-6 p-5 pt-[clamp(3.5rem,11vw,8rem)] sm:p-8 sm:pt-[clamp(4rem,11vw,9rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-8">
        {/* ---- info panel ------------------------------------------------ */}
        <div className="order-2 lg:order-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={p.id}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: reduce ? 0 : 0.34, ease: EASE_BACK }}
              className="cv-stage-panel rounded-3xl p-5 sm:p-6"
            >
              <span
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--accent-cyan-text)" }}
              >
                {eyebrow} · {p.category}
              </span>

              <h2
                className="mt-2 text-2xl font-bold leading-tight sm:text-3xl"
                style={{ color: "var(--text-primary)" }}
              >
                <Link href={`/shop/${p.slug}`} className="rounded focus-visible:outline-none focus-visible:ring-2">
                  {p.name}
                </Link>
              </h2>

              <p
                className="mt-2 max-w-md text-[13px] leading-relaxed sm:text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                {p.tagline}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="text-3xl font-extrabold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {formatINR(p.price)}
                </span>
                {p.compareAt && discount > 0 && (
                  <>
                    <span className="text-sm line-through" style={{ color: "var(--text-muted)" }}>
                      {formatINR(p.compareAt)}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                      style={{ background: "var(--accent-violet)" }}
                    >
                      {discount}% off
                    </span>
                  </>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={soldOut}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ background: "var(--accent-cyan)", color: "#fff" }}
                >
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {soldOut ? "Sold out" : "Add to bag"}
                  <span className="sr-only"> — {p.name}</span>
                </button>
                <Link
                  href={`/shop/${p.slug}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ borderColor: "var(--border-hover)", color: "var(--text-secondary)" }}
                >
                  Details
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ---- controls --------------------------------------------- */}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous product"
              className="grid h-[44px] w-[44px] place-items-center rounded-full border transition-transform hover:scale-105 active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2"
              style={{ borderColor: "var(--border-hover)", background: "var(--bg-glass)" }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" style={{ color: "var(--text-secondary)" }} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next product"
              className="grid h-[44px] w-[44px] place-items-center rounded-full border transition-transform hover:scale-105 active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2"
              style={{ borderColor: "var(--border-hover)", background: "var(--bg-glass)" }}
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" style={{ color: "var(--text-secondary)" }} />
            </button>

            {/*
              * Thumbnails double as the slide indicators. Real buttons with
              * names, not dots: "go to slide 3" tells a screen-reader user
              * nothing, and a 6px dot is under any sane touch target.
              */}
            <div className="ml-1 flex flex-wrap gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setDir(i > index ? 1 : -1); setIndex(i); }}
                  aria-label={s.name}
                  aria-current={i === index ? "true" : undefined}
                  className="relative h-[44px] w-[44px] overflow-hidden rounded-xl border transition-transform hover:scale-105 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    borderColor: i === index ? "var(--accent-cyan)" : "var(--border-primary)",
                    background: "var(--bg-surface)",
                    opacity: i === index ? 1 : 0.65,
                  }}
                >
                  <Image src={s.image!} alt="" fill sizes="44px" className="object-cover" unoptimized={s.image!.endsWith(".svg")} />
                </button>
              ))}
            </div>
          </div>

          {/* Live region so a screen reader hears the slide change without
              the whole panel being re-announced on every frame. */}
          <p aria-live="polite" className="sr-only">
            {p.name}, {index + 1} of {slides.length}
          </p>
        </div>

        {/* ---- the alcove ------------------------------------------------- */}
        <div className="order-1 lg:order-2">
          <Tilt3D max={6} perspective={1000} lift={10} sheen={false}>
            <div className="cv-alcove relative aspect-[4/3] overflow-hidden rounded-[24px]">
              {/* The light bar: the single cue that turns a rounded rectangle
                  into a lit display niche. Dimmed to nothing in light mode,
                  where the aura is doing the work instead. */}
              <div aria-hidden="true" className="cv-alcove-light pointer-events-none absolute left-1/2 top-4 z-10 h-1.5 w-1/2 -translate-x-1/2 rounded-full" />

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={p.id}
                  initial={reduce ? false : { opacity: 0, x: dir * 36, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, x: dir * -36, scale: 0.97 }}
                  transition={{ duration: reduce ? 0 : 0.42, ease: EASE_BACK }}
                  className="absolute inset-0"
                >
                  <Image
                    src={p.image!}
                    alt={p.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    // The first slide is the page's LCP element on most
                    // viewports, so it is fetched eagerly; the rest are not.
                    priority={index === 0}
                    unoptimized={p.image!.endsWith(".svg")}
                    /*
                     * `object-cover`, filling the alcove edge to edge.
                     *
                     * `object-contain` with padding left the photograph's own
                     * background visible as a hard rectangle inside the niche
                     * — a box in a box, and in light mode a dark grey slab
                     * floating in a pale panel. These products are already
                     * photographed on a surface, so letting that surface *be*
                     * the niche is what makes the staging read as one scene.
                     */
                    className="object-cover"
                  />
                </motion.div>
              </AnimatePresence>

              {p.badge && (
                <span
                  className="absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] font-bold text-white shadow"
                  style={{ background: "var(--accent-violet)" }}
                >
                  {p.badge}
                </span>
              )}
            </div>
          </Tilt3D>
        </div>
      </div>
    </section>
  );
}
