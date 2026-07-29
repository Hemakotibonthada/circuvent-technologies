"use client";

/**
 * Circuvent Console — charts.
 *
 * Hand-rolled SVG rather than a charting dependency. Three reasons:
 *  1. Every colour resolves from the console's CSS custom properties, so charts
 *     re-paint correctly across all six theme combinations with no JS.
 *  2. No runtime cost added to a console that already polls several endpoints.
 *  3. Every series is fed from the control plane. When a series has no data the
 *     chart renders an explicit "no data" state instead of a plausible-looking
 *     curve — the console must never draw a number the API did not return.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface Point {
  /** Epoch milliseconds. */
  t: number;
  v: number;
}

export interface Series {
  name: string;
  color: string;
  points: Point[];
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Distinct hues used when a caller does not pin colours itself. */
export const CHART_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#22d3ee",
  "#f472b6",
  "#4ade80",
];

function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function extent(series: Series[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series)
    for (const p of s.points) {
      if (!Number.isFinite(p.v)) continue;
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  return { min, max };
}

function ChartFrame({
  title,
  right,
  children,
  height = 220,
  empty,
  emptyLabel = "No data for this window",
  footer,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  height?: number;
  empty?: boolean;
  emptyLabel?: string;
  footer?: ReactNode;
}) {
  return (
    <div className="cv-card rounded-2xl p-4 sm:p-5">
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h3 className="text-[17px] font-semibold" style={{ color: "var(--cv-text)" }}>
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      {empty ? (
        <div
          className="flex items-center justify-center rounded-xl border border-dashed text-xs"
          style={{ height, borderColor: "var(--cv-border)", color: "var(--cv-muted)" }}
        >
          {emptyLabel}
        </div>
      ) : (
        children
      )}
      {footer && !empty && <div className="mt-3">{footer}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.name}
          {i.value && (
            <b className="tabular-nums" style={{ color: "var(--cv-text)" }}>
              {i.value}
            </b>
          )}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({
  points,
  color = "var(--cv-accent)",
  height = 36,
  width = 120,
  fill = true,
  strokeWidth = 1.8,
}: {
  points: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const path = useMemo(() => {
    const vals = points.filter((n) => Number.isFinite(n));
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const dx = width / (vals.length - 1);
    const xy = vals.map((v, i) => [i * dx, height - ((v - min) / span) * (height - 4) - 2] as const);
    const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { line, area: `${line} L${width},${height} L0,${height} Z` };
  }, [points, height, width]);

  if (!path) return <div style={{ width, height }} aria-hidden />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={`sp${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={path.area} fill={`url(#sp${gid})`} />
        </>
      )}
      <path d={path.line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Line / area chart with crosshair                                    */
/* ------------------------------------------------------------------ */

/**
 * Multi-series time chart with a hover crosshair.
 *
 * The X axis is real time (not index), so series sampled at different
 * cadences — a 5-minute energy rollup next to per-event latency samples —
 * still line up correctly.
 */
export function LineChart({
  series,
  height = 240,
  title,
  right,
  unit = "",
  area = true,
  yMin,
  yMax,
  valueFormat,
  footer,
}: {
  series: Series[];
  height?: number;
  title?: string;
  right?: ReactNode;
  unit?: string;
  area?: boolean;
  yMin?: number;
  yMax?: number;
  valueFormat?: (v: number) => string;
  footer?: ReactNode;
}) {
  const gid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const W = 1000;
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 26;

  const live = series.filter((s) => s.points.length > 0);
  const empty = live.length === 0;

  const model = useMemo(() => {
    if (empty) return null;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const s of live)
      for (const p of s.points) {
        if (p.t < tMin) tMin = p.t;
        if (p.t > tMax) tMax = p.t;
      }
    const tSpan = tMax - tMin || 1;
    const ex = extent(live);
    const lo = yMin ?? Math.min(0, ex.min);
    const hi = yMax ?? niceCeil(ex.max > lo ? ex.max : lo + 1);
    const vSpan = hi - lo || 1;
    const x = (t: number) => padL + ((t - tMin) / tSpan) * (W - padL - padR);
    const y = (v: number) => padT + (1 - (v - lo) / vSpan) * (H - padT - padB);
    const paths = live.map((s) => {
      const pts = [...s.points].sort((a, b) => a.t - b.t);
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
      const last = pts[pts.length - 1];
      return {
        s,
        d,
        areaD: `${d} L${x(last.t).toFixed(1)},${(H - padB).toFixed(1)} L${x(pts[0].t).toFixed(1)},${(H - padB).toFixed(1)} Z`,
        pts,
      };
    });
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: lo + vSpan * f, y: y(lo + vSpan * f) }));
    return { tMin, tMax, lo, hi, x, y, paths, ticks };
  }, [live, empty, yMin, yMax, H]);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverX(((e.clientX - rect.left) / rect.width) * W);
  }, []);

  const fmt = valueFormat ?? ((v: number) => `${v.toFixed(v >= 100 ? 0 : 1)}${unit}`);

  const cursor = useMemo(() => {
    if (!model || hoverX == null) return null;
    const frac = (hoverX - padL) / (W - padL - padR);
    if (frac < 0 || frac > 1) return null;
    const t = model.tMin + frac * (model.tMax - model.tMin);
    const readings = model.paths.map(({ s, pts }) => {
      let best = pts[0];
      let bestD = Math.abs(pts[0].t - t);
      for (const p of pts) {
        const d = Math.abs(p.t - t);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return { name: s.name, color: s.color, point: best };
    });
    return { x: model.x(readings[0].point.t), t: readings[0].point.t, readings };
  }, [model, hoverX]);

  return (
    <ChartFrame title={title} right={right} height={height} empty={empty} footer={footer}>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height }}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverX(null)}
          role="img"
          aria-label={title ? `${title} chart` : "Time series chart"}
        >
          <defs>
            {model?.paths.map(({ s }, i) => (
              <linearGradient key={i} id={`ln${gid}${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {model?.ticks.map((tk, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={tk.y}
                y2={tk.y}
                stroke="var(--cv-border)"
                strokeWidth="1"
                strokeDasharray={i === 0 ? "" : "3 5"}
                opacity={0.65}
              />
              <text x={padL - 8} y={tk.y + 3.5} textAnchor="end" fontSize="10" fill="var(--cv-muted)">
                {tk.v >= 1000 ? `${(tk.v / 1000).toFixed(1)}k` : tk.v.toFixed(tk.v < 10 ? 1 : 0)}
              </text>
            </g>
          ))}

          {model?.paths.map(({ s, d, areaD }, i) => (
            <g key={s.name}>
              {area && <path d={areaD} fill={`url(#ln${gid}${i})`} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          ))}

          {cursor && (
            <>
              <line x1={cursor.x} x2={cursor.x} y1={padT} y2={H - padB} stroke="var(--cv-accent)" strokeWidth="1" opacity={0.7} />
              {cursor.readings.map((r) => (
                <circle key={r.name} cx={model!.x(r.point.t)} cy={model!.y(r.point.v)} r="3.5" fill={r.color} stroke="var(--cv-card)" strokeWidth="1.5" />
              ))}
            </>
          )}
        </svg>

        {cursor && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg px-2.5 py-2 text-[11px] shadow-lg"
            style={{
              left: `${Math.min(78, Math.max(2, ((cursor.x - padL) / (W - padL - padR)) * 100))}%`,
              background: "var(--cv-card-hi)",
              border: "1px solid var(--cv-border)",
              color: "var(--cv-text)",
            }}
          >
            <div className="mb-1 font-semibold" style={{ color: "var(--cv-muted)" }}>
              {new Date(cursor.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
            {cursor.readings.map((r) => (
              <div key={r.name} className="flex items-center gap-2 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                <span style={{ color: "var(--cv-muted)" }}>{r.name}</span>
                <b className="ml-auto tabular-nums">{fmt(r.point.v)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      {live.length > 1 && (
        <div className="mt-3">
          <Legend items={live.map((s) => ({ name: s.name, color: s.color }))} />
        </div>
      )}
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Bars                                                                */
/* ------------------------------------------------------------------ */

export function BarChart({
  data,
  height = 220,
  title,
  right,
  unit = "",
  horizontal = false,
  color = "var(--cv-accent)",
  onSelect,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  title?: string;
  right?: ReactNode;
  unit?: string;
  horizontal?: boolean;
  color?: string;
  onSelect?: (label: string) => void;
}) {
  const max = useMemo(() => niceCeil(Math.max(0, ...data.map((d) => d.value))), [data]);
  const empty = data.length === 0;

  if (horizontal) {
    return (
      <ChartFrame title={title} right={right} height={height} empty={empty}>
        <div className="space-y-2.5">
          {data.map((d) => (
            <button
              key={d.label}
              onClick={onSelect ? () => onSelect(d.label) : undefined}
              className={`block w-full text-left ${onSelect ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate" style={{ color: "var(--cv-muted)" }}>
                  {d.label}
                </span>
                <b className="tabular-nums" style={{ color: "var(--cv-text)" }}>
                  {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value.toFixed(d.value < 10 ? 2 : 0)}
                  {unit}
                </b>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--cv-input-bg)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${max ? (d.value / max) * 100 : 0}%`, background: d.color ?? "var(--cv-gradient)" }}
                />
              </div>
            </button>
          ))}
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={title} right={right} height={height} empty={empty}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d) => (
          <button
            key={d.label}
            onClick={onSelect ? () => onSelect(d.label) : undefined}
            title={`${d.label}: ${d.value}${unit}`}
            className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            style={{ height: "100%" }}
          >
            <span className="text-[10px] font-bold tabular-nums opacity-0 transition group-hover:opacity-100" style={{ color: "var(--cv-text)" }}>
              {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value.toFixed(d.value < 10 ? 1 : 0)}
            </span>
            <div
              className="w-full rounded-t-md transition-all duration-500 motion-reduce:transition-none"
              style={{
                height: `${max ? Math.max(2, (d.value / max) * 100) : 2}%`,
                background: d.color ?? color,
                opacity: 0.9,
              }}
            />
            <span className="w-full truncate text-center text-[9px]" style={{ color: "var(--cv-muted)" }}>
              {d.label}
            </span>
          </button>
        ))}
      </div>
    </ChartFrame>
  );
}

/** Stacked bars — e.g. energy per room broken down by device type. */
export function StackedBars({
  categories,
  keys,
  height = 240,
  title,
  right,
  unit = "",
}: {
  categories: { label: string; values: Record<string, number> }[];
  keys: { key: string; name: string; color: string }[];
  height?: number;
  title?: string;
  right?: ReactNode;
  unit?: string;
}) {
  const totals = categories.map((c) => keys.reduce((a, k) => a + (c.values[k.key] || 0), 0));
  const max = niceCeil(Math.max(0, ...totals));
  return (
    <ChartFrame title={title} right={right} height={height} empty={categories.length === 0}>
      <div className="flex items-end gap-2" style={{ height }}>
        {categories.map((c, ci) => (
          <div key={c.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
            <div className="flex w-full flex-col-reverse justify-start overflow-hidden rounded-t-md" style={{ height: `${max ? (totals[ci] / max) * 100 : 0}%` }}>
              {keys.map((k) => {
                const v = c.values[k.key] || 0;
                if (v <= 0) return null;
                return (
                  <div
                    key={k.key}
                    title={`${c.label} · ${k.name}: ${v.toFixed(2)}${unit}`}
                    style={{ height: `${totals[ci] ? (v / totals[ci]) * 100 : 0}%`, background: k.color }}
                  />
                );
              })}
            </div>
            <span className="w-full truncate text-center text-[9px]" style={{ color: "var(--cv-muted)" }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Legend items={keys.map((k) => ({ name: k.name, color: k.color }))} />
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

export function Donut({
  data,
  size = 168,
  thickness = 20,
  title,
  centerLabel,
  centerValue,
  right,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  title?: string;
  centerLabel?: string;
  centerValue?: string;
  right?: ReactNode;
}) {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;

  // Precompute each arc with its cumulative start offset. Accumulating inside
  // the render map would mutate across re-evaluations of the same render.
  const arcs = data.reduce<{ d: (typeof data)[number]; frac: number; dash: number; offset: number }[]>((acc, d) => {
    const frac = total ? Math.max(0, d.value) / total : 0;
    const dash = frac * circ;
    const prev = acc[acc.length - 1];
    acc.push({ d, frac, dash, offset: prev ? prev.offset + prev.dash : 0 });
    return acc;
  }, []);

  return (
    <ChartFrame title={title} right={right} height={size} empty={total <= 0} emptyLabel="Nothing recorded yet">
      <div className="flex flex-wrap items-center justify-center gap-6">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label={title ?? "Breakdown"}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cv-input-bg)" strokeWidth={thickness} />
          {arcs.map(({ d, frac, dash, offset }) => (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            >
              <title>{`${d.label}: ${((frac * 100) || 0).toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
        <div className="min-w-0">
          {(centerValue || centerLabel) && (
            <div className="mb-3">
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--cv-text)" }}>
                {centerValue}
              </div>
              <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                {centerLabel}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {data.map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-[11px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--cv-muted)" }}>
                  {d.label}
                </span>
                <b className="tabular-nums" style={{ color: "var(--cv-text)" }}>
                  {total ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge                                                               */
/* ------------------------------------------------------------------ */

export function Gauge({
  value,
  max = 100,
  size = 150,
  label,
  unit = "%",
  color,
  thresholds,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  unit?: string;
  color?: string;
  /** Ascending cut-points that recolour the arc, e.g. AQI or tank level bands. */
  thresholds?: { at: number; color: string }[];
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = size / 2 - 14;
  const circ = Math.PI * r; // half circle
  const stroke =
    color ??
    (thresholds ? [...thresholds].sort((a, b) => a.at - b.at).reduce((acc, t) => (value >= t.at ? t.color : acc), thresholds[0]?.color ?? "var(--cv-accent)") : "var(--cv-accent)");

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} role="img" aria-label={label ?? "Gauge"}>
        <path
          d={`M 14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`}
          fill="none"
          stroke="var(--cv-input-bg)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={`M 14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`}
          fill="none"
          stroke={stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          className="transition-all duration-700 motion-reduce:transition-none"
        />
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--cv-text)">
          {Number.isFinite(value) ? Math.round(value) : "—"}
          <tspan fontSize="12" fill="var(--cv-muted)">
            {unit}
          </tspan>
        </text>
      </svg>
      {label && (
        <span className="mt-1 text-[11px] font-semibold" style={{ color: "var(--cv-muted)" }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap                                                             */
/* ------------------------------------------------------------------ */

/** Day × hour activity grid. `cells` is keyed `"{day}-{hour}"` with a count. */
export function Heatmap({
  cells,
  title,
  right,
  colorFor,
  unitLabel = "events",
}: {
  cells: Record<string, number>;
  title?: string;
  right?: ReactNode;
  colorFor?: (intensity: number) => string;
  unitLabel?: string;
}) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(1, ...Object.values(cells));
  const tint = colorFor ?? ((i: number) => `color-mix(in srgb, var(--cv-accent) ${Math.round(i * 100)}%, transparent)`);
  return (
    <ChartFrame title={title} right={right} height={190} empty={Object.keys(cells).length === 0}>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="mb-1 flex gap-[3px] pl-9">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[8px]" style={{ color: "var(--cv-muted)" }}>
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          {days.map((d, di) => (
            <div key={d} className="mb-[3px] flex items-center gap-[3px]">
              <div className="w-9 text-[9px]" style={{ color: "var(--cv-muted)" }}>
                {d}
              </div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = cells[`${di}-${h}`] || 0;
                return (
                  <div
                    key={h}
                    title={`${d} ${String(h).padStart(2, "0")}:00 — ${v} ${unitLabel}`}
                    className="h-4 flex-1 rounded-[3px]"
                    style={{ background: v > 0 ? tint(0.15 + (v / max) * 0.85) : "var(--cv-input-bg)" }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Distribution / histogram                                            */
/* ------------------------------------------------------------------ */

/**
 * Latency histogram with p50/p95 markers. Buckets are derived from real
 * samples; an empty sample set renders the empty frame rather than a shape.
 */
export function Histogram({
  samples,
  buckets = 16,
  title,
  right,
  unit = "ms",
  color = "var(--cv-accent)",
}: {
  samples: number[];
  buckets?: number;
  title?: string;
  right?: ReactNode;
  unit?: string;
  color?: string;
}) {
  const model = useMemo(() => {
    const vals = samples.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const min = vals[0];
    const max = vals[vals.length - 1];
    const span = max - min || 1;
    const w = span / buckets;
    const bins = Array.from({ length: buckets }, () => 0);
    for (const v of vals) bins[Math.min(buckets - 1, Math.floor((v - min) / w))]++;
    const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
    return { bins, min, max, w, peak: Math.max(...bins), p50: q(0.5), p95: q(0.95), p99: q(0.99), n: vals.length };
  }, [samples, buckets]);

  return (
    <ChartFrame
      title={title}
      right={right}
      height={200}
      empty={!model}
      emptyLabel="No samples collected yet"
      footer={
        model && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
            <span>
              n=<b style={{ color: "var(--cv-text)" }}>{model.n}</b>
            </span>
            <span>
              p50 <b style={{ color: "var(--cv-text)" }}>{Math.round(model.p50)}{unit}</b>
            </span>
            <span>
              p95 <b style={{ color: "var(--cv-text)" }}>{Math.round(model.p95)}{unit}</b>
            </span>
            <span>
              p99 <b style={{ color: "var(--cv-text)" }}>{Math.round(model.p99)}{unit}</b>
            </span>
            <span>
              max <b style={{ color: "var(--cv-text)" }}>{Math.round(model.max)}{unit}</b>
            </span>
          </div>
        )
      }
    >
      {model && (
        <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
          {model.bins.map((b, i) => {
            const lo = model.min + i * model.w;
            return (
              <div
                key={i}
                title={`${Math.round(lo)}–${Math.round(lo + model.w)}${unit}: ${b}`}
                className="flex-1 rounded-t-sm transition-all duration-500 motion-reduce:transition-none"
                style={{ height: `${Math.max(1, (b / model.peak) * 100)}%`, background: color, opacity: 0.85 }}
              />
            );
          })}
        </div>
      )}
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Status timeline                                                     */
/* ------------------------------------------------------------------ */

/** Horizontal availability ribbon — one segment per bucketed interval. */
export function StatusRibbon({
  segments,
  title,
  right,
  legend,
}: {
  segments: { at: number; tone: string; label: string }[];
  title?: string;
  right?: ReactNode;
  legend?: { name: string; color: string }[];
}) {
  return (
    <ChartFrame title={title} right={right} height={70} empty={segments.length === 0}>
      <div className="flex h-9 gap-[2px] overflow-hidden rounded-lg">
        {segments.map((s, i) => (
          <div key={i} title={s.label} className="flex-1 rounded-[2px]" style={{ background: s.tone }} />
        ))}
      </div>
      {segments.length > 1 && (
        <div className="mt-1.5 flex justify-between text-[10px]" style={{ color: "var(--cv-muted)" }}>
          <span>{new Date(segments[0].at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })}</span>
          <span>{new Date(segments[segments.length - 1].at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })}</span>
        </div>
      )}
      {legend && (
        <div className="mt-2">
          <Legend items={legend} />
        </div>
      )}
    </ChartFrame>
  );
}
