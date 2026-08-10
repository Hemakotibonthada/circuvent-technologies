"use client";

/**
 * The shop hero — a Bento Grid with a 3D device stage.
 *
 * Bento comes from the design system query for this page: it scored ⚡ Excellent
 * on performance and WCAG AA, which the Immersive pattern (the other candidate)
 * explicitly does not — the database's own note on Immersive is "Performance
 * trade-off. Mobile fallback essential."
 *
 * So the compromise is deliberate: the *layout* is Bento, which is cheap,
 * responsive and readable; the *immersion* is concentrated in one stage tile
 * that is purely decorative and can be ignored entirely by a screen reader, a
 * reduced-motion user, or a phone. Nothing a customer needs is inside the 3D.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No scroll-jacking, no intro animation gating the page, no "skip" button —
 * because there is nothing to skip. The database recommends a skip option for
 * the Immersive pattern precisely because that pattern blocks the content. The
 * better answer is not to block it.
 */

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Star } from "lucide-react";


export interface HeroStat {
  value: string;
  label: string;
  /** Renders a real star icon beside the value, instead of a ★ character. */
  star?: boolean;
}

export interface HeroDevice {
  name: string;
  image: string;
  accent: string;
  href: string;
}

interface ShopHero3DProps {
  title: React.ReactNode;
  blurb: string;
  stats: HeroStat[];
  devices: HeroDevice[];
  bestDiscount: number;
}

/*
 * 300–450ms with a slight overshoot, from the design system's Stagger List
 * preset (`back.out(1.4)`). Expressed here in framer-motion, which the project
 * already ships, rather than pulling in GSAP for one stagger — a new runtime
 * dependency on a commerce page has to earn more than this.
 *
 * The cubic below is the standard back-out approximation: it overshoots ~4%
 * and settles, which is what gives the tiles a sense of weight.
 */
const EASE_BACK: [number, number, number, number] = [0.34, 1.3, 0.64, 1];

export default function ShopHero3D({
  title,
  blurb,
  stats,
  devices,
  bestDiscount,
}: ShopHero3DProps) {
  const reduce = useReducedMotion();

  const container = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.04 },
      },
    }),
    [reduce]
  );

  const tile = useMemo(
    () => ({
      hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.96 },
      show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: reduce ? 0 : 0.42, ease: EASE_BACK },
      },
    }),
    [reduce]
  );

  // Three is the most that stays legible on the stage at tablet width; beyond
  // that the cards overlap into a pile rather than a fan.
  const stage = devices.slice(0, 3);

  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12"
      aria-labelledby="shop-hero-title"
    >
      {/* ---- Headline tile ------------------------------------------------ */}
      <motion.div
        variants={tile}
        className="relative overflow-hidden rounded-3xl border p-5 sm:p-7 lg:col-span-7"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            background:
              "radial-gradient(90% 120% at 8% 0%, var(--accent-cyan-muted), transparent 58%)",
          }}
        />
        <div className="relative">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{
              borderColor: "var(--border-accent)",
              background: "var(--accent-cyan-muted)",
              color: "var(--accent-cyan-text)",
            }}
          >
            Made in India
          </span>

          <h1
            id="shop-hero-title"
            className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h1>

          <p
            className="mt-2.5 max-w-xl text-[13px] leading-relaxed sm:mt-3 sm:text-base"
            style={{ color: "var(--text-tertiary)" }}
          >
            {blurb}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-4 sm:gap-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span
                    className="flex items-center gap-1 text-xl font-extrabold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {s.value}
                    {/*
                      * A real icon, not a "★" in the string. The checklist bans
                      * emoji-as-icon for a practical reason as well as a
                      * stylistic one: a screen reader announces U+2605 as
                      * "black star", so "4.7★" is read aloud as "four point
                      * seven black star". The label already says "Average
                      * rating", so this is decorative and hidden.
                      */}
                    {s.star && (
                      <Star
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                        style={{ color: "var(--accent-cyan)", fill: "var(--accent-cyan)" }}
                      />
                    )}
                  </span>
                  {/*
                    * --text-tertiary, not --text-muted. In the dark theme
                    * --text-muted is #475569 on a #0f1729 surface, which
                    * measures 2.36:1 — well under the 4.5:1 floor. Tertiary is
                    * 7.0:1 on the same surface.
                    */}
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.div>

      {/* ---- 3D stage ------------------------------------------------------
        *
        * Decorative in the strict sense: aria-hidden, no links, no text a
        * customer needs. Every device shown here is also a real, focusable
        * card in the grid below, so hiding this from assistive technology
        * removes nothing — it only spares a screen reader three duplicate
        * product names before it reaches the listing.
        *
        * Shorter on phones. It is the one part of this hero that sells nothing
        * and cannot be tapped, and on a 375px screen every 100px it occupies
        * is 100px of delay before the first product. It earns its space on a
        * wide screen, where it sits beside the headline rather than above the
        * catalogue.
        */}
      <motion.div
        variants={tile}
        aria-hidden="true"
        className="relative min-h-[168px] overflow-hidden rounded-3xl border sm:min-h-[260px] lg:col-span-5 lg:min-h-[300px]"
        style={{
          background:
            "linear-gradient(150deg, var(--bg-secondary), var(--bg-surface) 60%)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border-primary) 1px, transparent 1px), linear-gradient(90deg, var(--border-primary) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(80% 80% at 50% 40%, #000, transparent 78%)",
          }}
        />

        <div
          className="absolute inset-0 grid place-items-center"
          style={{ perspective: 1100, transformStyle: "preserve-3d" }}
        >
          {stage.map((d, i) => {
            // A fan: each card sits further back and further to the side, so
            // the perspective divide makes it genuinely smaller rather than
            // scaled down by hand.
            const offset = i - (stage.length - 1) / 2;
            return (
              <motion.div
                key={d.name}
                className="absolute h-[104px] w-[104px] overflow-hidden rounded-2xl border shadow-xl sm:h-[150px] sm:w-[150px]"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-primary)",
                  transformStyle: "preserve-3d",
                }}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{
                  opacity: 1,
                  y: reduce ? 0 : [0, -7, 0],
                  // 20°, not 26°: past about 22° the artwork foreshortens
                  // enough that the outer two cards stop reading as products
                  // and start reading as grey slivers.
                  rotateY: offset * 20,
                  rotateX: -6,
                  x: offset * 104,
                  z: -Math.abs(offset) * 80,
                }}
                transition={{
                  opacity: { duration: 0.5, delay: 0.1 + i * 0.08 },
                  rotateY: { duration: 0.6, ease: EASE_BACK, delay: 0.1 + i * 0.08 },
                  rotateX: { duration: 0.6, ease: EASE_BACK, delay: 0.1 + i * 0.08 },
                  x: { duration: 0.6, ease: EASE_BACK, delay: 0.1 + i * 0.08 },
                  z: { duration: 0.6, ease: EASE_BACK, delay: 0.1 + i * 0.08 },
                  // Only the idle bob repeats, and only when motion is allowed.
                  y: reduce
                    ? { duration: 0 }
                    : { duration: 4.5 + i * 0.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 },
                }}
              >
                <div
                  className="absolute inset-0 rounded-2xl opacity-70"
                  style={{ background: `radial-gradient(70% 70% at 50% 30%, ${d.accent}2e, transparent 70%)` }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full rounded-2xl object-contain p-3"
                />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/*
        * No trust tiles here.
        *
        * The first version of this hero carried "Free delivery / 6-month
        * warranty / Flashed in our lab", which sat about 150px above the
        * page's existing "Free shipping / 6-month warranty / COD & wallet /
        * Made in India" row. Two of the three claims were repeated verbatim,
        * inside one screen. The existing row is server-rendered, already
        * covers payment, and is the one a crawler reads — so the duplicate
        * came out of the hero rather than out of the page.
        */}

      {bestDiscount > 0 && (
        <motion.div variants={tile} className="lg:col-span-12">
          <Link
            href="/shop?sort=discount"
            className="group flex min-h-[44px] items-center justify-between gap-4 rounded-2xl border px-5 py-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              borderColor: "var(--border-accent)",
              background: "var(--accent-cyan-muted)",
              color: "var(--accent-cyan-text)",
            }}
          >
            <span>Save up to {bestDiscount}% on this month&apos;s launch offers</span>
            <ArrowRight
              className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
              aria-hidden="true"
            />
          </Link>
        </motion.div>
      )}
    </motion.section>
  );
}
