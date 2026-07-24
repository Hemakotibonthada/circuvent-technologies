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
