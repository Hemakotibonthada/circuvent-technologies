import React from "react";
import { View, Text } from "react-native";
import Svg, { Polyline, Polygon, Rect, Path, Circle, Line, Defs, LinearGradient as SvgGrad, Stop, G } from "react-native-svg";
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
