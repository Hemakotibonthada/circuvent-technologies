"use client";

/**
 * A time-range brush — the scrubber under a chart.
 *
 * Azure's availability blade puts one of these below the graph: a second, flat
 * copy of the same series with two handles you drag inward to narrow the
 * window. It is the difference between "availability was 99.2% today" and
 * "availability was 41% between 03:10 and 03:25", which is the only version of
 * that number anybody can act on.
 *
 * WHY IT IS NOT A PAIR OF DATE INPUTS
 *
 * The question being asked is always "what happened *there*" — pointed at a
 * dip the user can already see. Making them read two timestamps off the axis
 * and type them into fields is a transcription step between noticing something
 * and looking at it, and it is where the wrong window gets typed.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not refetch. The brush narrows what is *shown* from data already
 * loaded, so dragging is instant and cannot fail. Widening past the loaded
 * window is the time-range control's job, and that one does refetch — two
 * controls, two jobs, neither pretending to be the other.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface BrushRange {
  /** Fractions of the loaded window, 0..1, start <= end. */
  start: number;
  end: number;
}

export const FULL_RANGE: BrushRange = { start: 0, end: 1 };

export function isFullRange(r: BrushRange): boolean {
  return r.start <= 0.0001 && r.end >= 0.9999;
}

/** Index range into an array of `length`, inclusive, for a brush selection. */
export function sliceFor(length: number, r: BrushRange): { from: number; to: number } {
  if (length <= 0) return { from: 0, to: 0 };
  const from = Math.max(0, Math.floor(r.start * (length - 1)));
  const to = Math.min(length - 1, Math.ceil(r.end * (length - 1)));
  return { from, to: Math.max(from, to) };
}

/**
 * Whether a timestamp falls inside the brushed window.
 *
 * Takes the window's own bounds rather than deriving them from the points, so
 * a caller filtering a *different* series (individual check results, say)
 * against the same brush cannot land on a slightly different window than the
 * chart is drawing.
 */
export function withinRange(at: string, firstMs: number, lastMs: number, r: BrushRange): boolean {
  const t = Date.parse(at);
  if (!Number.isFinite(t) || !(lastMs > firstMs)) return true;
  const span = lastMs - firstMs;
  const lo = firstMs + r.start * span;
  const hi = firstMs + r.end * span;
  return t >= lo && t <= hi;
}

const HANDLE = 10;

export default function RangeBrush({
  points,
  value,
  onChange,
  label = "Time range",
  formatAt,
}: {
  /** The same series the chart above is drawing. `null` means "no data here". */
  points: { at: string; value: number | null }[];
  value: BrushRange;
  onChange: (next: BrushRange) => void;
  label?: string;
  formatAt?: (iso: string) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const fmt = useCallback(
    (iso: string | undefined) => {
      if (!iso) return "—";
      if (formatAt) return formatAt(iso);
      const d = new Date(iso);
      return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },
    [formatAt],
  );

  const fractionFromClientX = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  /*
   * Dragging is tracked on the window, not on the handle.
   *
   * A pointer that leaves the element mid-drag still belongs to the drag —
   * without this, dragging quickly to the edge (which is exactly how somebody
   * selects "everything after the spike") drops the handle where the cursor
   * happened to exit.
   */
  useEffect(() => {
    if (!dragging) return;

    const move = (e: PointerEvent) => {
      const f = fractionFromClientX(e.clientX);
      if (dragging === "start") {
        onChange({ start: Math.min(f, value.end - 0.01), end: value.end });
      } else {
        onChange({ start: value.start, end: Math.max(f, value.start + 0.01) });
      }
    };
    const up = () => setDragging(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, fractionFromClientX, onChange, value.start, value.end]);

  const nudge = (which: "start" | "end", delta: number) => {
    if (which === "start") {
      onChange({ start: Math.min(Math.max(0, value.start + delta), value.end - 0.01), end: value.end });
    } else {
      onChange({ start: value.start, end: Math.max(Math.min(1, value.end + delta), value.start + 0.01) });
    }
  };

  const first = points[0]?.at;
  const last = points[points.length - 1]?.at;
  const firstMs = first ? Date.parse(first) : NaN;
  const lastMs = last ? Date.parse(last) : NaN;
  const atFraction = (f: number): string => {
    if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs) || lastMs <= firstMs) return "—";
    return fmt(new Date(firstMs + f * (lastMs - firstMs)).toISOString());
  };

  const leftPct = value.start * 100;
  const widthPct = Math.max(0.5, (value.end - value.start) * 100);

  /* The context sparkline. Same shape as the chart above so the brush reads as
     a smaller copy of it rather than an unrelated strip. */
  const W = 600;
  const H = 34;
  const len = Math.max(1, points.length);
  const px = (i: number) => (i / Math.max(1, len - 1)) * W;
  const py = (v: number) => H - 2 - v * (H - 4);
  const segments: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) segments.push(run);
      run = [];
    } else {
      run.push({ i, v: Math.min(1, Math.max(0, p.value)) });
    }
  });
  if (run.length) segments.push(run);

  return (
    <div className="rounded-xl border cv-border cv-surface p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide cv-text-muted">{label}</span>
        <span className="text-[11px] cv-text-secondary tabular-nums">
          {atFraction(value.start)} — {atFraction(value.end)}
          {!isFullRange(value) && (
            <button
              onClick={() => onChange(FULL_RANGE)}
              className="ml-2 font-semibold text-cyan-600 hover:underline"
            >
              reset
            </button>
          )}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-[38px] w-full select-none rounded-lg"
        style={{ background: "var(--bg-glass)", touchAction: "none" }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {segments.map((seg, si) => (
            <polyline
              key={si}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              points={seg.map((p) => `${px(p.i)},${py(p.v)}`).join(" ")}
            />
          ))}
        </svg>

        {/* Everything outside the selection is dimmed rather than hidden, so
            the shape of the whole window stays readable while zoomed in. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg" style={{ width: `${leftPct}%`, background: "var(--bg-surface)", opacity: 0.62 }} />
        <div className="pointer-events-none absolute inset-y-0 rounded-r-lg" style={{ left: `${value.end * 100}%`, right: 0, background: "var(--bg-surface)", opacity: 0.62 }} />
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2"
          style={{ left: `${leftPct}%`, width: `${widthPct}%`, borderColor: "var(--accent-cyan)", background: "rgba(6,182,212,0.10)" }}
        />

        {(["start", "end"] as const).map((which) => {
          const f = which === "start" ? value.start : value.end;
          return (
            <button
              key={which}
              type="button"
              role="slider"
              aria-label={`${which === "start" ? "Range start" : "Range end"} for ${label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(f * 100)}
              aria-valuetext={atFraction(f)}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(which);
              }}
              onKeyDown={(e) => {
                // Dragging is not something a keyboard can do, so the handles
                // are also steppers. Without this the brush is decorative for
                // anyone not using a mouse.
                const step = e.shiftKey ? 0.1 : 0.02;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  nudge(which, -step);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  nudge(which, step);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  onChange(which === "start" ? { ...value, start: 0 } : { ...value, end: value.start + 0.01 });
                } else if (e.key === "End") {
                  e.preventDefault();
                  onChange(which === "start" ? { ...value, start: value.end - 0.01 } : { ...value, end: 1 });
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onChange(FULL_RANGE);
                }
              }}
              /* 44px tall hit area on a 38px track: the visual handle is thin
                 because a fat one hides the data it is selecting, but the
                 target it presents is not. */
              className="absolute top-1/2 z-10 -translate-y-1/2 cursor-ew-resize rounded focus:outline-none focus-visible:ring-2"
              style={{
                left: `calc(${f * 100}% - ${HANDLE / 2}px)`,
                width: HANDLE,
                height: 44,
                background: "transparent",
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ width: 4, height: 26, background: "var(--accent-cyan)" }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
