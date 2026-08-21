"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Every chart in this app is hand-rolled SVG/CSS with no charting library,
 * and every one of them sizes its plot area to "however wide the container
 * happens to be" (a viewBox stretched via w-full, or a flex row of bars).
 * That is fine for a handful of points; it is how a 96-bucket, 24h series
 * ends up as an unreadable flat line with all the movement crushed into the
 * last few pixels. This wraps a chart's plotting area so it gets a minimum
 * width proportional to its own data density, scrolling horizontally
 * instead of squeezing once that minimum exceeds the container.
 *
 * One wrapper, used everywhere a chart plots something indexed by position
 * (bars/points along an x-axis), rather than a scroll div copy-pasted per
 * chart. Deliberately NOT used for circular/fixed-size charts (donut, gauge,
 * radar, sparkline) or spatial layouts (network/floorplan diagrams) --
 * those don't get more legible with extra horizontal room.
 */

/** Edge-fade width in px -- enough to read as "more content", not enough to hide a whole bar. */
const FADE_PX = 28;

function edgeMask(fadeStart: boolean, fadeEnd: boolean): string {
  if (!fadeStart && !fadeEnd) return "none";
  const from = fadeStart ? `transparent 0, black ${FADE_PX}px` : "black 0";
  const to = fadeEnd ? `black calc(100% - ${FADE_PX}px), transparent 100%` : "black 100%";
  return `linear-gradient(to right, ${from}, ${to})`;
}

export interface ScrollableChartProps {
  children: ReactNode;
  /**
   * Number of x-axis points/bars/categories being plotted. Drives the
   * minimum content width so dense series get real room instead of being
   * squeezed, while a short series still fills the container -- no
   * scrollbar, no pointless stretching.
   */
  pointCount: number;
  /** Min px reserved per point before the chart scrolls instead of compressing further. */
  minPxPerPoint?: number;
  className?: string;
  style?: CSSProperties;
  /** Announced only once the region is actually scrollable -- an inert wrapper shouldn't steal a tab stop. */
  label?: string;
}

export function ScrollableChart({
  children,
  pointCount,
  minPxPerPoint = 24,
  className,
  style,
  label = "Scroll to see more of this chart",
}: ScrollableChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const canScroll = el.scrollWidth - el.clientWidth > 1;
    setScrollable((prev) => (prev === canScroll ? prev : canScroll));

    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    // Mutated directly on the node rather than through React state: this
    // runs on every scroll tick, and re-rendering the chart underneath it
    // on each of those ticks would be the actual perf/jank problem.
    const mask = edgeMask(canScroll && !atStart, canScroll && !atEnd);
    el.style.maskImage = mask;
    el.style.setProperty("-webkit-mask-image", mask);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    // Watches both the viewport (container resizes, e.g. sidebar toggling)
    // and the content (min-width changing when pointCount/minPxPerPoint change).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure, pointCount, minPxPerPoint]);

  const minWidth = Math.max(1, pointCount) * Math.max(1, minPxPerPoint);

  return (
    <div
      ref={ref}
      onScroll={measure}
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? label : undefined}
      className={cn("cv-scroll-chart", className)}
      style={style}
    >
      {/* width: 100% keeps short series filling the container exactly (no
          stretch beyond it, no scrollbar); min-width overrides that once the
          data needs more room than the container has. */}
      <div style={{ minWidth, width: "100%" }}>{children}</div>
    </div>
  );
}
