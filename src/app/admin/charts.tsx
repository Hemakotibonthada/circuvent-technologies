"use client";
// Dependency-free, themeable SVG chart primitives for the admin analytics suite.
import React, { useState } from "react";

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
export function LineChart({ labels, series, height = 220, area = false, yFmt = abbr, currency = false }: {
  labels: string[]; series: Series[]; height?: number; area?: boolean; yFmt?: (n: number) => string; currency?: boolean;
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
    <div className="w-full overflow-hidden">
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
      {hover !== null && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-muted)" }}>{labels[hover]}:</span>
          {series.map((s, si) => (
            <span key={s.name} className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: 8, background: s.color || PALETTE[si % PALETTE.length], display: "inline-block" }} />
              {s.name} <b style={{ color: "var(--text-primary)" }}>{currency ? "₹" + (s.data[hover] ?? 0).toLocaleString("en-IN") : (s.data[hover] ?? 0).toLocaleString("en-IN")}</b>
            </span>
          ))}
        </div>
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
