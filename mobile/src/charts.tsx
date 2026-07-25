import React, { useState } from "react";
import { View, Text } from "react-native";
import Svg, { Polyline, Polygon, Rect, Path, Circle, Line, Defs, LinearGradient as SvgGrad, Stop, G, Text as SvgText } from "react-native-svg";
import { useTheme } from "./ui";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

/** Compact inline trend line (no axes). */
export function Sparkline({ data, color, width = 90, height = 30 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const { c } = useTheme();
  const stroke = color ?? c.accent;
  if (!data.length) return <View style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1 || 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** Filled area line chart with a light baseline grid. */
export function LineChart({ data, color, height = 160 }: { data: number[]; color?: string; height?: number }) {
  const { c } = useTheme();
  const stroke = color ?? c.accent;
  const W = 320;
  const H = height;
  const padB = 22;
  const padT = 10;
  if (!data.length) return <EmptyChart height={height} />;
  const max = niceMax(Math.max(...data, 1));
  const stepX = W / (data.length - 1 || 1);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = data.map((v, i) => `${i * stepX},${y(v)}`).join(" ");
  const area = `0,${H - padB} ${line} ${W},${H - padB}`;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <SvgGrad id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.35} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
        </SvgGrad>
      </Defs>
      {[0, 0.5, 1].map((f, i) => (
        <Line key={i} x1={0} x2={W} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke={c.border} strokeWidth={1} />
      ))}
      <Polygon points={area} fill="url(#area)" />
      <Polyline points={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

export function BarChart({ data, color, height = 160 }: { data: number[]; color?: string; height?: number }) {
  const { c } = useTheme();
  const fill = color ?? c.accent;
  const W = 320;
  const H = height;
  const padB = 22;
  const padT = 10;
  if (!data.length) return <EmptyChart height={height} />;
  const max = niceMax(Math.max(...data, 1));
  const gap = 4;
  const bw = W / data.length - gap;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0, 0.5, 1].map((f, i) => (
        <Line key={i} x1={0} x2={W} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke={c.border} strokeWidth={1} />
      ))}
      {data.map((v, i) => {
        const h = (v / max) * (H - padT - padB);
        return <Rect key={i} x={i * (bw + gap) + gap / 2} y={H - padB - h} width={bw} height={Math.max(1, h)} rx={3} fill={fill} opacity={0.9} />;
      })}
    </Svg>
  );
}

/** Semicircular gauge (0..max). */
export function Gauge({ value, max, label, unit, color, size = 160 }: { value: number; max: number; label?: string; unit?: string; color?: string; size?: number }) {
  const { c } = useTheme();
  const stroke = color ?? c.accent;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const start = Math.PI;
  const end = Math.PI + Math.PI * pct;
  const arc = (a0: number, a1: number) => {
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size / 2 + 16}>
        <Path d={arc(Math.PI, 2 * Math.PI)} stroke={c.border} strokeWidth={12} fill="none" strokeLinecap="round" />
        <Path d={arc(start, end)} stroke={stroke} strokeWidth={12} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: "absolute", top: size / 4, alignItems: "center" }}>
        <Text style={{ color: c.text, fontSize: 26, fontWeight: "800" }}>{Math.round(value)}{unit ? <Text style={{ fontSize: 14, color: c.textDim }}>{unit}</Text> : null}</Text>
        {!!label && <Text style={{ color: c.faint, fontSize: 12 }}>{label}</Text>}
      </View>
    </View>
  );
}

/** Donut with legend segments. */
export function Donut({ segments, size = 140 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const { c } = useTheme();
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  let acc = -Math.PI / 2;
  const arcs = segments.map((seg, i) => {
    const frac = seg.value / total;
    const a0 = acc;
    const a1 = acc + frac * 2 * Math.PI;
    acc = a1;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return <Path key={i} d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`} stroke={seg.color} strokeWidth={14} fill="none" strokeLinecap="butt" />;
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <Svg width={size} height={size}>
        <G>{arcs}</G>
        <Circle cx={cx} cy={cy} r={r - 8} fill="transparent" />
      </Svg>
      <View style={{ gap: 6 }}>
        {segments.map((seg, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seg.color }} />
            <Text style={{ color: c.textDim, fontSize: 13 }}>{seg.label}</Text>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: "700" }}>{Math.round((seg.value / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyChart({ height }: { height: number }) {
  const { c } = useTheme();
  return (
    <View style={{ height, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: c.faint, fontSize: 13 }}>No data yet — collecting…</Text>
    </View>
  );
}


// ------------------------------------------------------------- extra charts ---

function polar(cx: number, cy: number, r: number, a: number) { return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
function slicePath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = polar(cx, cy, r, a0); const e = polar(cx, cy, r, a1); const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

export function PieChart({ segments, size = 150 }: { segments: { label: string; value: number; color?: string }[]; size?: number }) {
  const { c } = useTheme(); const colors = [c.accent, c.violet, c.cyan, c.green, c.amber, c.red]; const total = segments.reduce((s, x) => s + x.value, 0) || 1; let acc = -Math.PI / 2; const r = size / 2 - 4;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}><Svg width={size} height={size}>{segments.map((seg, i) => { const a0 = acc; const a1 = acc + (seg.value / total) * Math.PI * 2; acc = a1; return <Path key={i} d={slicePath(size / 2, size / 2, r, a0, a1)} fill={seg.color ?? colors[i % colors.length]} />; })}</Svg><View style={{ gap: 6, flex: 1 }}>{segments.map((seg, i) => <Text key={seg.label} style={{ color: c.textDim, fontSize: 12 }}>● <Text style={{ color: seg.color ?? colors[i % colors.length] }}> </Text>{seg.label} <Text style={{ color: c.text, fontWeight: "800" }}>{Math.round((seg.value / total) * 100)}%</Text></Text>)}</View></View>;
}

export function ProgressRing({ value, max = 100, label, size = 128, color }: { value: number; max?: number; label?: string; size?: number; color?: string }) {
  const { c } = useTheme(); const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)); const stroke = 12; const r = (size - stroke) / 2; const circ = 2 * Math.PI * r;
  return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}><Svg width={size} height={size} style={{ position: "absolute" }}><Circle cx={size / 2} cy={size / 2} r={r} stroke={c.borderHi} strokeWidth={stroke} fill="none" /><Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? c.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - pct)} rotation="-90" origin={`${size / 2}, ${size / 2}`} /></Svg><Text style={{ color: c.text, fontWeight: "900", fontSize: 22 }}>{Math.round(pct * 100)}%</Text>{label ? <Text style={{ color: c.faint, fontSize: 12 }}>{label}</Text> : null}</View>;
}

export function CalendarHeatmap({ days }: { days: { date: string; value: number }[] }) {
  const { c } = useTheme(); const cell = 11; const gap = 4; const cols = Math.max(1, Math.ceil(days.length / 7)); const max = Math.max(1, ...days.map((d) => d.value));
  const color = (v: number) => v <= 0 ? c.cardHi : v / max > 0.66 ? c.accent : v / max > 0.33 ? c.cyan : c.borderHi;
  return <Svg width="100%" height={7 * (cell + gap)} viewBox={`0 0 ${cols * (cell + gap)} ${7 * (cell + gap)}`}>{days.map((d, i) => <Rect key={`${d.date}-${i}`} x={Math.floor(i / 7) * (cell + gap)} y={(i % 7) * (cell + gap)} width={cell} height={cell} rx={3} fill={color(d.value)} />)}</Svg>;
}

// ---------------------------------------------------- enhanced widget suite ---
export const PALETTE = ["#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
export interface Series { name: string; data: number[]; color?: string }
const fmtK = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)));

/** Themed legend; tap an item to toggle when onToggle is supplied. */
export function Legend({ items, onToggle, hidden }: { items: { name: string; color: string; value?: string }[]; onToggle?: (name: string) => void; hidden?: Record<string, boolean> }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
      {items.map((it) => (
        <Text key={it.name} onPress={onToggle ? () => onToggle(it.name) : undefined}
          style={{ color: hidden?.[it.name] ? c.faint : c.textDim, fontSize: 12, textDecorationLine: hidden?.[it.name] ? "line-through" : "none" }}>
          <Text style={{ color: it.color }}>{"\u25CF "}</Text>{it.name}{it.value ? ` \u00b7 ${it.value}` : ""}
        </Text>
      ))}
    </View>
  );
}

/** Compact KPI tile: value, optional unit, delta and inline sparkline. */
export function StatCard({ label, value, unit, delta, data, color, glyph }: { label: string; value: string | number; unit?: string; delta?: number; data?: number[]; color?: string; glyph?: string }) {
  const { c } = useTheme();
  const col = color ?? c.accent;
  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: c.faint, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{String(label).toUpperCase()}</Text>
        {glyph ? <Text style={{ fontSize: 15 }}>{glyph}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 6 }}>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
        {unit ? <Text style={{ color: c.textDim, fontSize: 13, marginBottom: 3 }}>{unit}</Text> : null}
      </View>
      {data && data.length ? <View style={{ marginTop: 6 }}><Sparkline data={data} color={col} width={130} height={26} /></View> : null}
      {delta !== undefined ? <Text style={{ color: delta >= 0 ? c.green : c.red, fontSize: 12, marginTop: 4 }}>{delta >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(delta).toFixed(1)}%</Text> : null}
    </View>
  );
}

/** Multi-series line/area chart with tap-to-inspect crosshair + value readout. */
export function MultiLineChart({ series, labels, height = 190, area = true, unit = "", fmt }: { series: Series[]; labels?: string[]; height?: number; area?: boolean; unit?: string; fmt?: (n: number) => string }) {
  const { c } = useTheme();
  const [w, setW] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const padL = 36, padR = 10, padT = 14, padB = labels ? 22 : 12;
  const n = Math.max(1, ...series.map((s) => s.data.length));
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
  const f = fmt ?? fmtK;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  if (!series.length || !series.some((s) => s.data.length)) return <EmptyChart height={height} />;
  return (
    <View onLayout={(e) => setW(Math.max(220, e.nativeEvent.layout.width))}>
      {sel !== null && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
          <Text style={{ color: c.faint, fontSize: 12 }}>{labels?.[sel] ?? `#${sel + 1}`}:</Text>
          {series.map((s, si) => (
            <Text key={s.name} style={{ color: c.textDim, fontSize: 12 }}>
              <Text style={{ color: s.color ?? PALETTE[si % PALETTE.length] }}>{"\u25CF "}</Text>
              {s.name} <Text style={{ color: c.text, fontWeight: "800" }}>{f(s.data[sel] ?? 0)}{unit}</Text>
            </Text>
          ))}
        </View>
      )}
      <Svg width={w} height={height}>
        <Defs>
          {series.map((s, si) => (
            <SvgGrad key={si} id={`ml${si}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={s.color ?? PALETTE[si % PALETTE.length]} stopOpacity={0.28} />
              <Stop offset="1" stopColor={s.color ?? PALETTE[si % PALETTE.length]} stopOpacity={0.02} />
            </SvgGrad>
          ))}
        </Defs>
        {[0, 0.5, 1].map((t, i) => (
          <G key={i}>
            <Line x1={padL} x2={w - padR} y1={padT + t * (height - padT - padB)} y2={padT + t * (height - padT - padB)} stroke={c.border} strokeWidth={1} />
            <SvgText x={padL - 6} y={padT + t * (height - padT - padB) + 3} fontSize={9} fill={c.faint} textAnchor="end">{f(max * (1 - t))}</SvgText>
          </G>
        ))}
        {series.map((s, si) => {
          const col = s.color ?? PALETTE[si % PALETTE.length];
          const line = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const areaPts = `${x(0)},${y(0)} ${line} ${x(s.data.length - 1)},${y(0)}`;
          return (
            <G key={s.name}>
              {area && <Polygon points={areaPts} fill={`url(#ml${si})`} />}
              <Polyline points={line} fill="none" stroke={col} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
              {sel !== null && s.data[sel] !== undefined && <Circle cx={x(sel)} cy={y(s.data[sel])} r={4} fill={col} stroke={c.card} strokeWidth={1.5} />}
            </G>
          );
        })}
        {sel !== null && <Line x1={x(sel)} x2={x(sel)} y1={padT} y2={height - padB} stroke={c.faint} strokeWidth={1} strokeDasharray="3 3" />}
        {labels && labels.map((l, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) ? <SvgText key={i} x={x(i)} y={height - 6} fontSize={9} fill={c.faint} textAnchor="middle">{l}</SvgText> : null)}
        {Array.from({ length: n }).map((_, i) => (
          <Rect key={i} x={x(i) - (w - padL - padR) / n / 2} y={padT} width={(w - padL - padR) / n} height={height - padT - padB} fill="transparent" onPress={() => setSel(i === sel ? null : i)} />
        ))}
      </Svg>
    </View>
  );
}

/** Grouped bars across categories, one bar per series. */
export function GroupedBar({ series, labels, height = 180 }: { series: Series[]; labels: string[]; height?: number }) {
  const { c } = useTheme();
  const [w, setW] = useState(320);
  const padL = 34, padR = 8, padT = 12, padB = 24;
  const n = labels.length || 1;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
  const groupW = (w - padL - padR) / n;
  const bw = (groupW * 0.7) / Math.max(1, series.length);
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  return (
    <View onLayout={(e) => setW(Math.max(220, e.nativeEvent.layout.width))}>
      <Svg width={w} height={height}>
        {[0, 0.5, 1].map((t, i) => <Line key={i} x1={padL} x2={w - padR} y1={padT + t * (height - padT - padB)} y2={padT + t * (height - padT - padB)} stroke={c.border} strokeWidth={1} />)}
        {labels.map((l, gi) => (
          <G key={gi}>
            {series.map((s, si) => {
              const v = s.data[gi] || 0;
              const gx = padL + gi * groupW + groupW * 0.15 + si * bw;
              return <Rect key={si} x={gx} y={y(v)} width={bw * 0.9} height={Math.max(1, y(0) - y(v))} rx={2} fill={s.color ?? PALETTE[si % PALETTE.length]} />;
            })}
            <SvgText x={padL + gi * groupW + groupW / 2} y={height - 8} fontSize={9} fill={c.faint} textAnchor="middle">{l}</SvgText>
          </G>
        ))}
      </Svg>
      <Legend items={series.map((s, si) => ({ name: s.name, color: s.color ?? PALETTE[si % PALETTE.length] }))} />
    </View>
  );
}

/** Stacked bars across categories. */
export function StackedBar({ series, labels, height = 180 }: { series: Series[]; labels: string[]; height?: number }) {
  const { c } = useTheme();
  const [w, setW] = useState(320);
  const padL = 30, padR = 8, padT = 12, padB = 24;
  const n = labels.length || 1;
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.data[i] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const groupW = (w - padL - padR) / n;
  const bw = groupW * 0.6;
  const hh = (v: number) => (height - padT - padB) * (v / max);
  return (
    <View onLayout={(e) => setW(Math.max(220, e.nativeEvent.layout.width))}>
      <Svg width={w} height={height}>
        {[0, 0.5, 1].map((t, i) => <Line key={i} x1={padL} x2={w - padR} y1={padT + t * (height - padT - padB)} y2={padT + t * (height - padT - padB)} stroke={c.border} strokeWidth={1} />)}
        {labels.map((l, i) => {
          let acc = 0;
          return (
            <G key={i}>
              {series.map((s, si) => {
                const v = s.data[i] || 0;
                const yTop = padT + (height - padT - padB) - hh(acc) - hh(v);
                acc += v;
                return <Rect key={si} x={padL + i * groupW + (groupW - bw) / 2} y={yTop} width={bw} height={hh(v)} fill={s.color ?? PALETTE[si % PALETTE.length]} />;
              })}
              <SvgText x={padL + i * groupW + groupW / 2} y={height - 8} fontSize={9} fill={c.faint} textAnchor="middle">{l}</SvgText>
            </G>
          );
        })}
      </Svg>
      <Legend items={series.map((s, si) => ({ name: s.name, color: s.color ?? PALETTE[si % PALETTE.length] }))} />
    </View>
  );
}

/** Ranked horizontal bars. */
export function HBars({ items, unit = "" }: { items: { name: string; value: number; color?: string }[]; unit?: string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ gap: 10 }}>
      {items.map((it, i) => (
        <View key={it.name}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: c.textDim, fontSize: 13 }}>{it.name}</Text>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: "700" }}>{it.value.toLocaleString()}{unit}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border }}>
            <View style={{ height: 8, borderRadius: 4, width: `${(it.value / max) * 100}%`, backgroundColor: it.color ?? PALETTE[i % PALETTE.length] }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Radar / spider chart for multi-metric comparison. */
export function RadarChart({ axes, series, size = 220 }: { axes: string[]; series: Series[]; size?: number }) {
  const { c } = useTheme();
  const cx = size / 2, cy = size / 2, r = size / 2 - 26;
  const n = axes.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, val: number) => ({ x: cx + r * (val / max) * Math.cos(ang(i)), y: cy + r * (val / max) * Math.sin(ang(i)) });
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map((frac, gi) => (
          <Polygon key={gi} points={axes.map((_, i) => { const p = pt(i, max * frac); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={c.border} strokeWidth={1} />
        ))}
        {axes.map((_, i) => { const p = pt(i, max); return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={c.border} strokeWidth={1} />; })}
        {series.map((s, si) => {
          const col = s.color ?? PALETTE[si % PALETTE.length];
          const pts = s.data.map((v, i) => { const p = pt(i, v); return `${p.x},${p.y}`; }).join(" ");
          return <Polygon key={s.name} points={pts} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={2} />;
        })}
        {axes.map((a, i) => { const p = pt(i, max * 1.18); return <SvgText key={i} x={p.x} y={p.y + 3} fontSize={9} fill={c.faint} textAnchor="middle">{a}</SvgText>; })}
      </Svg>
      <Legend items={series.map((s, si) => ({ name: s.name, color: s.color ?? PALETTE[si % PALETTE.length] }))} />
    </View>
  );
}

/** Bullet gauge: actual value vs a target marker. */
export function Bullet({ label, value, target, max, unit = "", color }: { label: string; value: number; target?: number; max?: number; unit?: string; color?: string }) {
  const { c } = useTheme();
  const m = max ?? (Math.max(value, target ?? 0) * 1.25 || 1);
  const col = color ?? c.accent;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: c.textDim, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: "700" }}>{value.toLocaleString()}{unit}{target !== undefined ? ` / ${target.toLocaleString()}${unit}` : ""}</Text>
      </View>
      <View style={{ height: 12, borderRadius: 6, backgroundColor: c.border, overflow: "hidden", position: "relative" }}>
        <View style={{ height: 12, width: `${Math.min(100, (value / m) * 100)}%`, backgroundColor: col }} />
        {target !== undefined && <View style={{ position: "absolute", left: `${Math.min(100, (target / m) * 100)}%`, top: 0, bottom: 0, width: 2, backgroundColor: c.text }} />}
      </View>
    </View>
  );
}
