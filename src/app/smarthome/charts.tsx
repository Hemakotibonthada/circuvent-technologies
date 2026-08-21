"use client";

import { useState } from "react";
import { ScrollableChart } from "@/components/ui/scrollable-chart";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function Sparkline({ data, color = "var(--cv-accent)", width = 100, height = 34 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function LineChart({ data, color = "var(--cv-accent)", height = 180 }: { data: number[]; color?: string; height?: number }) {
  const W = 360;
  const H = height;
  const padB = 24;
  const padT = 10;
  if (!data.length) return <Empty height={height} />;
  const max = niceMax(Math.max(...data, 1));
  const stepX = W / (data.length - 1 || 1);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = data.map((v, i) => `${i * stepX},${y(v)}`).join(" ");
  const area = `0,${H - padB} ${line} ${W},${H - padB}`;
  return (
    <ScrollableChart pointCount={data.length} minPxPerPoint={16}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="energy history">
        <defs>
          <linearGradient id="cv-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".35" />
            <stop offset="1" stopColor={color} stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke="var(--cv-border)" />
        ))}
        <polygon points={area} fill="url(#cv-area)" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </ScrollableChart>
  );
}

export function Gauge({ value, max = 3000, label = "Live power", unit = "W", color = "var(--cv-accent)", size = 170 }: { value: number; max?: number; label?: string; unit?: string; color?: string; size?: number }) {
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const arc = (a0: number, a1: number) => {
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size / 2 + 18}>
        <path d={arc(Math.PI, 2 * Math.PI)} stroke="var(--cv-border)" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d={arc(Math.PI, Math.PI + Math.PI * pct)} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" />
      </svg>
      <div className="absolute top-10 text-center">
        <div className="text-3xl font-extrabold text-white">{Math.round(value)}<span className="text-sm text-slate-400">{unit}</span></div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function Donut({ segments, size = 150 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  let acc = -Math.PI / 2;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} role="img" aria-label="consumption split">
        {segments.map((seg) => {
          const frac = seg.value / total;
          const a0 = acc;
          const a1 = acc + frac * 2 * Math.PI;
          acc = a1;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          return <path key={seg.label} d={`M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`} stroke={seg.color} strokeWidth="16" fill="none" />;
        })}
      </svg>
      <div className="space-y-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded" style={{ background: seg.color }} />
            <span className="text-slate-300">{seg.label}</span>
            <span className="font-bold text-white">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------- enhanced widget suite ---
const CV_AXIS = "#94a3b8";
const CV_GRID = "var(--cv-border)";
export const PALETTE = ["#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#a855f7", "#eab308"];
export function abbr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(1) + "Cr";
  if (a >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}
export interface Series { name: string; data: number[]; color?: string }

export function Legend({ items }: { items: { name: string; value?: number; color: string }[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-2 text-xs">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, display: "inline-block" }} />
          <span className="text-slate-300">{it.name}</span>
          {it.value !== undefined && <span className="text-slate-500">· {it.value.toLocaleString("en-IN")}</span>}
        </div>
      ))}
    </div>
  );
}

/** Multi-series line/area chart with hover crosshair + readout. */
export function MultiLineChart({ labels, series, height = 220, area = false, yFmt = abbr, unit = "" }: { labels: string[]; series: Series[]; height?: number; area?: boolean; yFmt?: (n: number) => string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="w-full">
      <ScrollableChart pointCount={n} minPxPerPoint={22}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        <defs>{series.map((s, si) => (
          <linearGradient key={si} id={`cvml${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.color || PALETTE[si % PALETTE.length]} stopOpacity="0.25" />
            <stop offset="1" stopColor={s.color || PALETTE[si % PALETTE.length]} stopOpacity="0.02" />
          </linearGradient>
        ))}</defs>
        {[0, 1, 2, 3, 4].map((i) => { const v = (max / 4) * i; return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={CV_GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={CV_AXIS}>{yFmt(v)}</text>
          </g>
        ); })}
        {series.map((s, si) => {
          const color = s.color || PALETTE[si % PALETTE.length];
          const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const areaPts = `${x(0)},${y(0)} ${pts} ${x(s.data.length - 1)},${y(0)}`;
          return (
            <g key={s.name}>
              {area && <polygon points={areaPts} fill={`url(#cvml${si})`} />}
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && s.data[hover] !== undefined && <circle cx={x(hover)} cy={y(s.data[hover])} r={3.5} fill={color} />}
            </g>
          );
        })}
        {labels.map((l, i) => ((i % Math.ceil(n / 8) === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={CV_AXIS}>{l}</text>))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={CV_AXIS} strokeDasharray="3 3" opacity={0.5} />}
        {labels.map((_, i) => (<rect key={i} x={x(i) - (W / n) / 2} y={padT} width={W / n} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />))}
      </svg>
      </ScrollableChart>
      {hover !== null && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-300">
          <span className="text-slate-500">{labels[hover]}:</span>
          {series.map((s, si) => (
            <span key={s.name} className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: 8, background: s.color || PALETTE[si % PALETTE.length], display: "inline-block" }} />
              {s.name} <b className="text-white">{(s.data[hover] ?? 0).toLocaleString("en-IN")}{unit}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarChart({ labels, data, color = PALETTE[0], height = 220, unit = "" }: { labels: string[]; data: number[]; color?: string; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = data.length || 1;
  const max = niceMax(Math.max(1, ...data));
  const bw = (W - padL - padR) / n;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="w-full">
      <ScrollableChart pointCount={n} minPxPerPoint={20}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke={CV_GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill={CV_AXIS}>{abbr(max * f)}</text>
          </g>
        ))}
        {data.map((v, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={padL + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(0, y(0) - y(v))} rx={3} fill={color} opacity={hover === i ? 1 : 0.85} />
            {(i % Math.ceil(n / 10) === 0 || i === n - 1) && <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={CV_AXIS}>{labels[i]}</text>}
          </g>
        ))}
      </svg>
      </ScrollableChart>
      {hover !== null && <div className="mt-1 text-xs text-slate-300">{labels[hover]}: <b className="text-white">{data[hover].toLocaleString("en-IN")}{unit}</b></div>}
    </div>
  );
}

export function GroupedBar({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 720, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
  const groupW = (W - padL - padR) / n;
  const bw = (groupW * 0.7) / Math.max(1, series.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="w-full">
      <ScrollableChart pointCount={n} minPxPerPoint={Math.max(24, series.length * 14)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke={CV_GRID} strokeWidth={0.5} opacity={0.5} />
            <text x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill={CV_AXIS}>{abbr(max * f)}</text>
          </g>
        ))}
        {labels.map((l, gi) => (
          <g key={gi}>
            {series.map((s, si) => { const v = s.data[gi] || 0; const gx = padL + gi * groupW + groupW * 0.15 + si * bw; return <rect key={si} x={gx} y={y(v)} width={bw * 0.9} height={Math.max(0, y(0) - y(v))} rx={2} fill={s.color || PALETTE[si % PALETTE.length]} />; })}
            <text x={padL + gi * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={CV_AXIS}>{l}</text>
          </g>
        ))}
      </svg>
      </ScrollableChart>
      <div className="mt-2"><Legend items={series.map((s, si) => ({ name: s.name, color: s.color || PALETTE[si % PALETTE.length] }))} /></div>
    </div>
  );
}

export function StackedBar({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 720, H = height, padL = 30, padR = 12, padT = 12, padB = 26;
  const n = labels.length || 1;
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.data[i] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const bw = (W - padL - padR) / n;
  const h = (v: number) => (H - padT - padB) * (v / max);
  return (
    <div className="w-full">
      <ScrollableChart pointCount={n} minPxPerPoint={24}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {labels.map((l, i) => { let acc = 0; return (
          <g key={i}>
            {series.map((s, si) => { const val = s.data[i] || 0; const yTop = padT + (H - padT - padB) - h(acc) - h(val); acc += val; return <rect key={si} x={padL + i * bw + bw * 0.15} y={yTop} width={bw * 0.7} height={h(val)} fill={s.color || PALETTE[si % PALETTE.length]} opacity={0.9} />; })}
            {(i % Math.ceil(n / 10) === 0 || i === n - 1) && <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={CV_AXIS}>{l}</text>}
          </g>
        ); })}
      </svg>
      </ScrollableChart>
      <div className="mt-2"><Legend items={series.map((s, si) => ({ name: s.name, color: s.color || PALETTE[si % PALETTE.length] }))} /></div>
    </div>
  );
}

export function HBar({ items, unit = "" }: { items: { name: string; value: number; color?: string }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.name}>
          <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-300">{it.name}</span><span className="text-white">{it.value.toLocaleString("en-IN")}{unit}</span></div>
          <div className="h-2 rounded-full" style={{ background: "var(--cv-border)" }}><div className="h-2 rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: it.color || PALETTE[i % PALETTE.length] }} /></div>
        </div>
      ))}
    </div>
  );
}

export function ProgressRing({ value, max = 100, size = 100, thickness = 10, label, color = "var(--cv-accent)" }: { value: number; max?: number; size?: number; thickness?: number; label?: string; color?: string }) {
  const r = size / 2 - thickness / 2, cc = size / 2, circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={cc} cy={cc} r={r} fill="none" stroke="var(--cv-border)" strokeWidth={thickness} />
      <circle cx={cc} cy={cc} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${frac * circ} ${circ}`} transform={`rotate(-90 ${cc} ${cc})`} />
      <text x={cc} y={cc - 1} textAnchor="middle" fontSize={17} fontWeight={700} fill="#fff">{Math.round(frac * 100)}%</text>
      {label && <text x={cc} y={cc + 16} textAnchor="middle" fontSize={9} fill={CV_AXIS}>{label}</text>}
    </svg>
  );
}

export function RadarChart({ axes, series, size = 220 }: { axes: string[]; series: Series[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 28;
  const n = axes.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, val: number) => ({ x: cx + r * (val / max) * Math.cos(ang(i)), y: cy + r * (val / max) * Math.sin(ang(i)) });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {[0.25, 0.5, 0.75, 1].map((f, gi) => <polygon key={gi} points={axes.map((_, i) => { const p = pt(i, max * f); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="var(--cv-border)" />)}
        {axes.map((_, i) => { const p = pt(i, max); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--cv-border)" />; })}
        {series.map((s, si) => { const col = s.color || PALETTE[si % PALETTE.length]; const pts = s.data.map((v, i) => { const p = pt(i, v); return `${p.x},${p.y}`; }).join(" "); return <polygon key={s.name} points={pts} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={2} />; })}
        {axes.map((a, i) => { const p = pt(i, max * 1.18); return <text key={i} x={p.x} y={p.y + 3} fontSize={9} fill={CV_AXIS} textAnchor="middle">{a}</text>; })}
      </svg>
      <Legend items={series.map((s, si) => ({ name: s.name, color: s.color || PALETTE[si % PALETTE.length] }))} />
    </div>
  );
}

export function Heatmap({ grid, rows, cols, color = "#06b6d4" }: { grid: number[][]; rows: string[]; cols: string[]; color?: string }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              <td className="pr-2 text-right text-[10px] text-slate-400">{rows[ri]}</td>
              {row.map((v, ci) => (<td key={ci} title={`${rows[ri]} ${cols[ci]}: ${v}`} style={{ width: 16, height: 16, borderRadius: 3, background: color, opacity: 0.12 + 0.88 * (v / max) }} />))}
            </tr>
          ))}
          <tr><td />{cols.map((cl, i) => (i % 3 === 0 ? <td key={i} className="text-center text-[9px] text-slate-400">{cl}</td> : <td key={i} />))}</tr>
        </tbody>
      </table>
    </div>
  );
}

export function KpiCard({ label, value, delta, spark, color = PALETTE[0], prefix = "" }: { label: string; value: string | number; delta?: number; spark?: number[]; color?: string; prefix?: string }) {
  const dv = delta ?? 0;
  return (
    <div className="rounded-2xl cv-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between">
        <p className="text-2xl font-bold text-white">{prefix}{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
        {spark && <Sparkline data={spark} color={color} width={70} height={28} />}
      </div>
      {delta !== undefined && <p className="mt-1 text-xs" style={{ color: dv >= 0 ? "#10b981" : "#ef4444" }}>{dv >= 0 ? "▲" : "▼"} {Math.abs(dv).toFixed(1)}% vs prev.</p>}
    </div>
  );
}

export function Pie({ segments, size = 160 }: { segments: { label: string; value: number; color?: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = -Math.PI / 2;
  const r = size / 2 - 4, cx = size / 2, cy = size / 2;
  const slice = (a0: number, a1: number) => { const s = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }; const e = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }; const large = a1 - a0 > Math.PI ? 1 : 0; return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`; };
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {segments.map((seg, i) => { const a0 = acc; const a1 = acc + (seg.value / total) * Math.PI * 2; acc = a1; return <path key={i} d={slice(a0, a1)} fill={seg.color || PALETTE[i % PALETTE.length]} />; })}
      </svg>
      <Legend items={segments.map((s, i) => ({ name: s.label, value: s.value, color: s.color || PALETTE[i % PALETTE.length] }))} />
    </div>
  );
}

function Empty({ height }: { height: number }) {
  return <div className="flex items-center justify-center text-sm text-slate-500" style={{ height }}>No data yet — collecting…</div>;
}
