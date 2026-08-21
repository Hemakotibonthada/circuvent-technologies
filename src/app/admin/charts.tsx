"use client";
// Dependency-free, themeable SVG chart primitives for the admin analytics suite.
import React, { useState } from "react";
import { ScrollableChart } from "@/components/ui/scrollable-chart";

const AXIS = "var(--text-muted)";
const GRID = "var(--border-primary)";
export const PALETTE = ["#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#a855f7", "#eab308"];

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
export function abbr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(1) + "Cr";
  if (a >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

export interface Series { name: string; data: number[]; color?: string }

// ---------------------------------------------------------------- Line/Area
export function LineChart({ labels, series, height = 220, area = false, yFmt = abbr, currency = false, legend }: {
  labels: string[]; series: Series[]; height?: number; area?: boolean; yFmt?: (n: number) => string; currency?: boolean;
  /**
   * Force the standing legend on or off.
   *
   * Defaults to showing it only for multi-series charts, because on a single
   * line the card title already names it and a one-item key is noise. The
   * override exists for charts where the series name IS the information —
   * "Sev 1" on its own tells you which severity occurred, and without it a
   * lone line could be any of five.
   */
  legend?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  const allVals = series.flatMap((s) => s.data);
  const max = niceMax(Math.max(1, ...allVals));
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = 4;

  return (
    <div className="w-full">
      <ScrollableChart pointCount={n} minPxPerPoint={22}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (max / ticks) * i;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={0.5} opacity={0.5} />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{currency ? "₹" + yFmt(v) : yFmt(v)}</text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const color = s.color || PALETTE[si % PALETTE.length];
          const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const areaPts = `${padL},${y(0)} ${pts} ${x(n - 1)},${y(0)}`;
          return (
            <g key={s.name}>
              {area && <polygon points={areaPts} fill={color} opacity={0.12} />}
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.data.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 3.5 : 0} fill={color} />
              ))}
            </g>
          );
        })}
        {labels.map((l, i) => (
          (i % Math.ceil(n / 8) === 0 || i === n - 1) &&
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>{l}</text>
        ))}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - (W / n) / 2} y={padT} width={W / n} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={AXIS} strokeDasharray="3 3" opacity={0.5} />
        )}
      </svg>
      </ScrollableChart>
      {hover !== null ? (
        <div className="mt-1 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-muted)" }}>{labels[hover]}:</span>
          {series.map((s, si) => (
            <span key={s.name} className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: 8, background: s.color || PALETTE[si % PALETTE.length], display: "inline-block" }} />
              {s.name} <b style={{ color: "var(--text-primary)" }}>{currency ? "₹" + (s.data[hover] ?? 0).toLocaleString("en-IN") : (s.data[hover] ?? 0).toLocaleString("en-IN")}</b>
            </span>
          ))}
        </div>
      ) : (
        /*
         * A legend that is there before you touch anything.
         *
         * This chart previously named its series only while the pointer was
         * over the plot, unlike every other multi-series chart here — GroupedBar
         * and the rest render a standing Legend. Hover-only naming fails three
         * ways: there is no hover on a touchscreen, a screenshot pasted into an
         * incident review carries no key at all, and a keyboard user never sees
         * it. The values stay on hover, where they belong; only the names come
         * out.
         */
        (legend ?? series.length > 1) && (
          <div className="mt-2">
            <Legend items={series.map((s, si) => ({ name: s.name, color: s.color || PALETTE[si % PALETTE.length] }))} />
          </div>
        )
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Bar
export function BarChart({ labels, data, color = PALETTE[0], height = 220, currency = false }: {
  labels: string[]; data: number[]; color?: string; height?: number; currency?: boolean;
}) {
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = data.length || 1;
  const max = niceMax(Math.max(1, ...data));
  const bw = (W - padL - padR) / n;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <ScrollableChart pointCount={n} minPxPerPoint={20}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke={GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{currency ? "₹" + abbr(max * f) : abbr(max * f)}</text>
          </g>
        ))}
        {data.map((v, i) => (
          <g key={i}>
            <rect x={padL + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(0, y(0) - y(v))} rx={3} fill={color} opacity={0.85} />
            {(i % Math.ceil(n / 10) === 0 || i === n - 1) && <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>{labels[i]}</text>}
          </g>
        ))}
      </svg>
    </ScrollableChart>
  );
}

// --------------------------------------------------------------- Stacked bar
export function StackedBar({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 720, H = height, padL = 30, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.data[i] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const bw = (W - padL - padR) / n;
  const h = (v: number) => (H - padT - padB) * (v / max);
  return (
    <ScrollableChart pointCount={n} minPxPerPoint={24}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {labels.map((l, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const val = s.data[i] || 0;
                const yTop = padT + (H - padT - padB) - h(acc) - h(val);
                acc += val;
                return <rect key={si} x={padL + i * bw + bw * 0.15} y={yTop} width={bw * 0.7} height={h(val)} fill={s.color || PALETTE[si % PALETTE.length]} opacity={0.9} />;
              })}
              {(i % Math.ceil(n / 10) === 0 || i === n - 1) && <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>{l}</text>}
            </g>
          );
        })}
      </svg>
    </ScrollableChart>
  );
}

// ------------------------------------------------------------------ Donut
export function DonutChart({ data, size = 180, thickness = 26, centerLabel, centerSub }: {
  data: { name: string; value: number; color?: string }[]; size?: number; thickness?: number; centerLabel?: string; centerSub?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const c = size / 2;
  let acc = 0;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={thickness} opacity={0.3} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const el = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={d.color || PALETTE[i % PALETTE.length]} strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-acc * circ} transform={`rotate(-90 ${c} ${c})`} />
          );
          acc += frac;
          return el;
        })}
        {centerLabel && <text x={c} y={c - 2} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--text-primary)">{centerLabel}</text>}
        {centerSub && <text x={c} y={c + 16} textAnchor="middle" fontSize={10} fill={AXIS}>{centerSub}</text>}
      </svg>
      <Legend items={data.map((d, i) => ({ name: d.name, value: d.value, color: d.color || PALETTE[i % PALETTE.length] }))} />
    </div>
  );
}

export function Legend({ items }: { items: { name: string; value?: number; color: string }[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-2 text-xs">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, display: "inline-block" }} />
          <span style={{ color: "var(--text-secondary)" }}>{it.name}</span>
          {it.value !== undefined && <span style={{ color: "var(--text-muted)" }}>· {it.value.toLocaleString("en-IN")}</span>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ Horizontal bars
export function HBar({ items, currency = false }: { items: { name: string; value: number; color?: string }[]; currency?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.name}>
          <div className="mb-0.5 flex justify-between text-xs">
            <span style={{ color: "var(--text-secondary)" }}>{it.name}</span>
            <span style={{ color: "var(--text-primary)" }}>{currency ? "₹" + it.value.toLocaleString("en-IN") : it.value.toLocaleString("en-IN")}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: "var(--bg-glass)" }}>
            <div className="h-2 rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: it.color || PALETTE[i % PALETTE.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- Sparkline
export function Sparkline({ data, color = PALETTE[0], height = 34, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const x = (i: number) => (i * width) / Math.max(1, data.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / rng) * (height - 4);
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ------------------------------------------------------------ Progress ring
export function ProgressRing({ value, max = 100, size = 90, thickness = 9, label, color = PALETTE[0] }: {
  value: number; max?: number; size?: number; thickness?: number; label?: string; color?: string;
}) {
  const r = size / 2 - thickness / 2, c = size / 2, circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={thickness} opacity={0.3} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
        strokeDasharray={`${frac * circ} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />
      <text x={c} y={c - 1} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--text-primary)">{Math.round(frac * 100)}%</text>
      {label && <text x={c} y={c + 15} textAnchor="middle" fontSize={9} fill={AXIS}>{label}</text>}
    </svg>
  );
}

// --------------------------------------------------------------- Heatmap
export function Heatmap({ grid, rows, cols, color = "#06b6d4" }: { grid: number[][]; rows: string[]; cols: string[]; color?: string }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              <td className="pr-2 text-right text-[10px]" style={{ color: AXIS }}>{rows[ri]}</td>
              {row.map((v, ci) => (
                <td key={ci} title={`${rows[ri]} ${cols[ci]}: ${v}`}
                  style={{ width: 16, height: 16, borderRadius: 3, background: color, opacity: 0.12 + 0.88 * (v / max) }} />
              ))}
            </tr>
          ))}
          <tr>
            <td />
            {cols.map((c, i) => (i % 3 === 0 ? <td key={i} className="text-center text-[9px]" style={{ color: AXIS }}>{c}</td> : <td key={i} />))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------- KPI card
export function KpiCard({ label, value, delta, spark, color = PALETTE[0], prefix = "" }: {
  label: string; value: string | number; delta?: number; spark?: number[]; color?: string; prefix?: string;
}) {
  const dv = delta ?? 0;
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="mt-1 flex items-end justify-between">
        <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{prefix}{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
        {spark && <Sparkline data={spark} color={color} width={70} height={28} />}
      </div>
      {delta !== undefined && (
        <p className="mt-1 text-xs" style={{ color: dv >= 0 ? "#10b981" : "#ef4444" }}>
          {dv >= 0 ? "▲" : "▼"} {Math.abs(dv).toFixed(1)}% vs prev.
        </p>
      )}
    </div>
  );
}

/** Semicircular gauge — value against a max, with a color band and center label. */
export function GaugeChart({
  value,
  max = 100,
  label,
  size = 160,
  color = PALETTE[0],
  suffix = "",
}: {
  value: number;
  max?: number;
  label?: string;
  size?: number;
  color?: string;
  suffix?: string;
}) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  // Semicircle from 180° (left) to 0° (right).
  const pt = (frac: number) => {
    const ang = Math.PI * (1 - frac);
    return [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
  };
  const [sx, sy] = pt(0);
  const [ex, ey] = pt(1);
  const [vx, vy] = pt(pct);
  const arc = (x1: number, y1: number, x2: number, y2: number, large = 0) =>
    `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
        <path d={arc(sx, sy, ex, ey)} fill="none" stroke="var(--border-primary)" strokeWidth={12} strokeLinecap="round" />
        <path d={arc(sx, sy, vx, vy, pct > 0.5 ? 1 : 0)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.16} fontWeight={800} fill="var(--text-primary)">
          {Math.round(value).toLocaleString("en-IN")}{suffix}
        </text>
      </svg>
      {label && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</p>}
    </div>
  );
}

// ------------------------------------------------------------ Grouped bars
export function GroupedBar({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
  const groupW = (W - padL - padR) / n;
  const bw = (groupW * 0.7) / Math.max(1, series.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div>
      {/* Each group needs room for series.length bars, not just one — the
          per-point minimum scales with how many bars share a group. */}
      <ScrollableChart pointCount={n} minPxPerPoint={Math.max(24, series.length * 14)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke={GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{abbr(max * f)}</text>
            </g>
          ))}
          {labels.map((l, gi) => (
            <g key={gi}>
            {series.map((s, si) => { const v = s.data[gi] || 0; const gx = padL + gi * groupW + groupW * 0.15 + si * bw; return <rect key={si} x={gx} y={y(v)} width={bw * 0.9} height={Math.max(0, y(0) - y(v))} rx={2} fill={s.color || PALETTE[si % PALETTE.length]} />; })}
            <text x={padL + gi * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>{l}</text>
            </g>
          ))}
        </svg>
      </ScrollableChart>
      <div className="mt-2"><Legend items={series.map((s, si) => ({ name: s.name, color: s.color || PALETTE[si % PALETTE.length] }))} /></div>
    </div>
  );
}

// ------------------------------------------------------------------ Radar
export function RadarChart({ axes, series, size = 240 }: { axes: string[]; series: Series[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 30;
  const n = axes.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, val: number) => ({ x: cx + r * (val / max) * Math.cos(ang(i)), y: cy + r * (val / max) * Math.sin(ang(i)) });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {[0.25, 0.5, 0.75, 1].map((f, gi) => <polygon key={gi} points={axes.map((_, i) => { const p = pt(i, max * f); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={GRID} opacity={0.6} />)}
        {axes.map((_, i) => { const p = pt(i, max); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={GRID} opacity={0.6} />; })}
        {series.map((s, si) => { const col = s.color || PALETTE[si % PALETTE.length]; const pts = s.data.map((v, i) => { const p = pt(i, v); return `${p.x},${p.y}`; }).join(" "); return <polygon key={s.name} points={pts} fill={col} fillOpacity={0.16} stroke={col} strokeWidth={2} />; })}
        {axes.map((a, i) => { const p = pt(i, max * 1.16); return <text key={i} x={p.x} y={p.y + 3} fontSize={9} fill={AXIS} textAnchor="middle">{a}</text>; })}
      </svg>
      <Legend items={series.map((s, si) => ({ name: s.name, color: s.color || PALETTE[si % PALETTE.length] }))} />
    </div>
  );
}

// ---------------------------------------------------------------- Scatter
export function ScatterChart({ points, height = 220, xLabel }: { points: { x: number; y: number; r?: number; color?: string; label?: string }[]; height?: number; xLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 30;
  const maxX = niceMax(Math.max(1, ...points.map((p) => p.x)));
  const maxY = niceMax(Math.max(1, ...points.map((p) => p.y)));
  const x = (v: number) => padL + (v / maxX) * (W - padL - padR);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / maxY);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(maxY * f)} y2={y(maxY * f)} stroke={GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(maxY * f) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{abbr(maxY * f)}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((f, i) => <text key={i} x={x(maxX * f)} y={H - 12} textAnchor="middle" fontSize={9} fill={AXIS}>{abbr(maxX * f)}</text>)}
        {points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={hover === i ? (p.r || 5) + 2 : (p.r || 5)} fill={p.color || PALETTE[i % PALETTE.length]} opacity={0.75} onMouseEnter={() => setHover(i)} />)}
        {xLabel && <text x={W / 2} y={H - 1} textAnchor="middle" fontSize={9} fill={AXIS}>{xLabel}</text>}
      </svg>
      {hover !== null && <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{points[hover].label || `Point ${hover + 1}`}: <b style={{ color: "var(--text-primary)" }}>({points[hover].x.toLocaleString("en-IN")}, {points[hover].y.toLocaleString("en-IN")})</b></div>}
    </div>
  );
}

// ------------------------------------------------------- Combo (bar + line)
export function ComboChart({ labels, bars, line, height = 220, barColor = PALETTE[0], lineColor = PALETTE[1] }: { labels: string[]; bars: number[]; line: number[]; height?: number; barColor?: string; lineColor?: string }) {
  const W = 720, H = height, padL = 44, padR = 40, padT = 12, padB = 26;
  const n = labels.length || 1;
  const maxB = niceMax(Math.max(1, ...bars));
  const maxL = niceMax(Math.max(1, ...line));
  const bw = (W - padL - padR) / n;
  const yB = (v: number) => padT + (H - padT - padB) * (1 - v / maxB);
  const yL = (v: number) => padT + (H - padT - padB) * (1 - v / maxL);
  const x = (i: number) => padL + i * bw + bw / 2;
  const linePts = line.map((v, i) => `${x(i)},${yL(v)}`).join(" ");
  return (
    <ScrollableChart pointCount={n} minPxPerPoint={26}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yB(maxB * f)} y2={yB(maxB * f)} stroke={GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={yB(maxB * f) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{abbr(maxB * f)}</text>
            <text x={W - padR + 6} y={yL(maxL * f) + 3} textAnchor="start" fontSize={9} fill={lineColor}>{abbr(maxL * f)}</text>
          </g>
        ))}
        {bars.map((v, i) => <rect key={i} x={padL + i * bw + bw * 0.2} y={yB(v)} width={bw * 0.6} height={Math.max(0, yB(0) - yB(v))} rx={3} fill={barColor} opacity={0.8} />)}
        {labels.map((l, i) => ((i % Math.ceil(n / 10) === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>{l}</text>))}
        <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth={2.4} strokeLinejoin="round" />
        {line.map((v, i) => <circle key={i} cx={x(i)} cy={yL(v)} r={2.5} fill={lineColor} />)}
      </svg>
    </ScrollableChart>
  );
}

// ------------------------------------------------------------------ Bullet
export function BulletChart({ label, value, target, max, color = PALETTE[0], unit = "" }: { label: string; value: number; target?: number; max?: number; color?: string; unit?: string }) {
  const m = max ?? (Math.max(value, target ?? 0) * 1.25 || 1);
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs"><span style={{ color: "var(--text-secondary)" }}>{label}</span><span style={{ color: "var(--text-primary)" }}>{value.toLocaleString("en-IN")}{unit}{target !== undefined ? ` / ${target.toLocaleString("en-IN")}${unit}` : ""}</span></div>
      <div className="relative h-3 rounded-full" style={{ background: "var(--bg-glass)" }}>
        <div className="h-3 rounded-full" style={{ width: `${Math.min(100, (value / m) * 100)}%`, background: color }} />
        {target !== undefined && <div className="absolute top-0 bottom-0" style={{ left: `${Math.min(100, (target / m) * 100)}%`, width: 2, background: "var(--text-primary)" }} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Funnel
export function FunnelChart({ stages }: { stages: { name: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => {
        const w = (s.value / max) * 100;
        const conv = i > 0 && stages[i - 1].value > 0 ? ((s.value / stages[i - 1].value) * 100).toFixed(0) + "%" : "";
        return (
          <div key={s.name}>
            <div className="mb-0.5 flex justify-between text-xs"><span style={{ color: "var(--text-secondary)" }}>{s.name}</span><span style={{ color: "var(--text-primary)" }}>{s.value.toLocaleString("en-IN")}{conv && <span style={{ color: "var(--text-muted)" }}> · {conv}</span>}</span></div>
            <div className="mx-auto h-7 rounded" style={{ width: `${w}%`, background: s.color || PALETTE[i % PALETTE.length], opacity: 0.85 }} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Waterfall
export function WaterfallChart({ labels, deltas, height = 220 }: { labels: string[]; deltas: number[]; height?: number }) {
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  let running = 0; const cum: number[] = [];
  deltas.forEach((d) => { cum.push(running); running += d; });
  const total = running;
  const maxV = niceMax(Math.max(1, ...cum.map((c, i) => c + Math.max(0, deltas[i])), total));
  const minV = Math.min(0, ...cum.map((c, i) => c + Math.min(0, deltas[i])));
  const range = maxV - minV || 1;
  const bw = (W - padL - padR) / (n + 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - minV) / range);
  return (
    // +1 point: the trailing "Total" bar needs its own share of width too.
    <ScrollableChart pointCount={n + 1} minPxPerPoint={26}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => { const v = minV + range * f; return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={AXIS}>{abbr(v)}</text>
          </g>
        ); })}
        {deltas.map((d, i) => { const base = cum[i]; const top = base + d; const yTop = y(Math.max(base, top)); const hgt = Math.abs(y(base) - y(top)); return (
          <g key={i}>
            <rect x={padL + i * bw + bw * 0.2} y={yTop} width={bw * 0.6} height={Math.max(1, hgt)} rx={2} fill={d >= 0 ? "#10b981" : "#ef4444"} opacity={0.85} />
            <text x={padL + i * bw + bw * 0.5} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>{labels[i]}</text>
          </g>
        ); })}
        <rect x={padL + n * bw + bw * 0.2} y={y(Math.max(0, total))} width={bw * 0.6} height={Math.max(1, Math.abs(y(0) - y(total)))} rx={2} fill={PALETTE[0]} />
        <text x={padL + n * bw + bw * 0.5} y={H - 8} textAnchor="middle" fontSize={9} fill={AXIS}>Total</text>
      </svg>
    </ScrollableChart>
  );
}

// -------------------------------------------------------------- Radial bars
export function RadialBars({ items, size = 200 }: { items: { name: string; value: number; max?: number; color?: string }[]; size?: number }) {
  const cx = size / 2, cy = size / 2;
  const thickness = Math.max(8, (size / 2 - 14) / Math.max(1, items.length) - 4);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {items.map((it, i) => {
          const r = size / 2 - 14 - i * (thickness + 4);
          const circ = 2 * Math.PI * r;
          const frac = Math.max(0, Math.min(1, it.value / (it.max || 100)));
          const col = it.color || PALETTE[i % PALETTE.length];
          return (
            <g key={it.name}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={GRID} strokeWidth={thickness} opacity={0.3} />
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${frac * circ} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
            </g>
          );
        })}
      </svg>
      <Legend items={items.map((it, i) => ({ name: `${it.name} · ${Math.round((it.value / (it.max || 100)) * 100)}%`, color: it.color || PALETTE[i % PALETTE.length] }))} />
    </div>
  );
}

// ------------------------------------------------------------ Calendar heatmap
export function CalendarHeatmap({ days, color = "#06b6d4" }: { days: { date: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...days.map((d) => d.value));
  const cell = 13, gap = 3, cols = Math.ceil(days.length / 7);
  // A year of days (cols ~53) previously just shrank to fit — width:100%
  // with only a maxWidth cap, no floor — squeezing every cell below legibility
  // on anything narrower than the natural size. minPxPerPoint matches the
  // chart's own cell+gap so the scrollable width equals its natural size.
  return (
    <ScrollableChart pointCount={cols} minPxPerPoint={cell + gap}>
      <svg viewBox={`0 0 ${cols * (cell + gap)} ${7 * (cell + gap)}`} style={{ width: "100%" }}>
        {days.map((d, i) => (
          <rect key={i} x={Math.floor(i / 7) * (cell + gap)} y={(i % 7) * (cell + gap)} width={cell} height={cell} rx={3} fill={color} opacity={d.value <= 0 ? 0.08 : 0.15 + 0.85 * (d.value / max)}>
            <title>{`${d.date}: ${d.value}`}</title>
          </rect>
        ))}
      </svg>
    </ScrollableChart>
  );
}

// ------------------------------------------------------------------ Treemap
type TmNode = { name: string; value: number; color: string; area: number };
export function Treemap({ items, width = 720, height = 260 }: { items: { name: string; value: number; color?: string }[]; width?: number; height?: number }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const scale = (width * height) / total;
  const nodes: TmNode[] = items.map((it, i) => ({ name: it.name, value: it.value, color: it.color || PALETTE[i % PALETTE.length], area: it.value * scale }));
  const rects: { x: number; y: number; w: number; h: number; name: string; value: number; color: string }[] = [];
  let x = 0, y = 0, w = width, h = height;
  const worst = (row: TmNode[], len: number) => {
    if (!row.length) return Infinity;
    const areas = row.map((r) => r.area);
    const sum = areas.reduce((a, b) => a + b, 0);
    const mx = Math.max(...areas), mn = Math.min(...areas);
    return Math.max((len * len * mx) / (sum * sum), (sum * sum) / (len * len * mn));
  };
  const remaining = [...nodes];
  while (remaining.length) {
    const horizontal = w >= h;
    const len = horizontal ? w : h;
    const cur: TmNode[] = [];
    while (remaining.length) {
      const test = [...cur, remaining[0]];
      if (cur.length && worst(test, len) > worst(cur, len)) break;
      cur.push(remaining.shift()!);
    }
    const sum = cur.reduce((a, b) => a + b.area, 0);
    if (horizontal) {
      const rh = w ? sum / w : 0; let rx = x;
      cur.forEach((r) => { const rw = rh ? r.area / rh : 0; rects.push({ x: rx, y, w: rw, h: rh, name: r.name, value: r.value, color: r.color }); rx += rw; });
      y += rh; h -= rh;
    } else {
      const rw = h ? sum / h : 0; let ry = y;
      cur.forEach((r) => { const rh2 = rw ? r.area / rw : 0; rects.push({ x, y: ry, w: rw, h: rh2, name: r.name, value: r.value, color: r.color }); ry += rh2; });
      x += rw; w -= rw;
    }
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {rects.map((r, i) => (
        <g key={i}>
          <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} fill={r.color} opacity={0.85} />
          {r.w > 60 && r.h > 24 && <text x={r.x + 8} y={r.y + 18} fontSize={11} fontWeight={700} fill="#fff">{r.name}</text>}
          {r.w > 60 && r.h > 42 && <text x={r.x + 8} y={r.y + 34} fontSize={10} fill="rgba(255,255,255,0.85)">{abbr(r.value)}</text>}
        </g>
      ))}
    </svg>
  );
}
