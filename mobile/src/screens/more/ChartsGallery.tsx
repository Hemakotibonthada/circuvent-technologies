import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import {
  Sparkline, LineChart, BarChart, Gauge, Donut, PieChart, ProgressRing, CalendarHeatmap,
  StatCard, Legend, MultiLineChart, GroupedBar, StackedBar, HBars, RadarChart, Bullet, PALETTE,
} from "../../charts";

const wave = (n: number, base: number, amp: number, phase = 0) =>
  Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + amp * Math.sin(i / 2 + phase) + amp * 0.25 * Math.cos(i / 1.3))));

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Card padded style={{ marginBottom: 14 }}>
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, marginBottom: 10 }}>{title.toUpperCase()}</Text>
      {children}
    </Card>
  );
}

export default function ChartsGallery({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const days = useMemo(() => Array.from({ length: 35 }, (_, i) => ({ date: `d${i}`, value: Math.round(Math.abs(Math.sin(i / 3)) * 5) })), []);
  const series = useMemo(() => [
    { name: "Living", data: wave(24, 120, 60, 0), color: PALETTE[0] },
    { name: "Bedroom", data: wave(24, 80, 40, 1.5), color: PALETTE[1] },
    { name: "Kitchen", data: wave(24, 60, 50, 3), color: PALETTE[2] },
  ], []);
  const shown = series.filter((s) => !hidden[s.name]);
  const labels = useMemo(() => Array.from({ length: 24 }, (_, i) => `${i}:00`), []);
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const grouped = useMemo(() => [
    { name: "This week", data: [3.1, 4.4, 2.8, 5.1, 3.6, 4.9, 4.2], color: PALETTE[0] },
    { name: "Last week", data: [2.8, 3.9, 3.2, 4.4, 3.1, 5.2, 3.8], color: PALETTE[4] },
  ], []);
  const stacked = useMemo(() => [
    { name: "AC", data: [1.8, 2.1, 1.4, 2.6, 1.9, 2.4, 2.0], color: PALETTE[0] },
    { name: "Lights", data: [0.7, 0.9, 0.6, 0.8, 0.7, 1.0, 0.8], color: PALETTE[3] },
    { name: "Others", data: [0.6, 0.7, 0.5, 0.9, 0.6, 0.8, 0.7], color: PALETTE[1] },
  ], []);
  const radar = useMemo(() => [
    { name: "Home", data: [80, 65, 90, 70, 60, 85], color: PALETTE[1] },
    { name: "Away", data: [40, 30, 55, 35, 80, 45], color: PALETTE[2] },
  ], []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 110 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>Charts & Widgets</Title>
        </View>

        <SectionLabel>Kpi tiles</SectionLabel>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
          <StatCard label="Live Power" value={248} unit="W" delta={4.2} data={wave(16, 200, 60)} color={PALETTE[0]} glyph="⚡" />
          <StatCard label="Today" value={4.2} unit="kWh" delta={-2.1} data={wave(16, 4, 1)} color={PALETTE[4]} glyph="🔋" />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
          <StatCard label="Devices" value={12} delta={0} data={wave(16, 10, 2)} color={PALETTE[1]} glyph="🧩" />
          <StatCard label="Est. Cost" value={"₹34"} delta={1.4} data={wave(16, 30, 8)} color={PALETTE[3]} glyph="💰" />
        </View>

        <SectionLabel style={{ marginTop: 8 }}>MULTI-SERIES LINE (TAP TO INSPECT)</SectionLabel>
        <Block title="Per-room load · tap the chart">
          <Legend
            items={series.map((s) => ({ name: s.name, color: s.color! }))}
            hidden={hidden}
            onToggle={(name) => setHidden((h) => ({ ...h, [name]: !h[name] }))}
          />
          <MultiLineChart series={shown} labels={labels} unit=" W" height={200} />
        </Block>

        <SectionLabel>Line / area · Bar</SectionLabel>
        <Block title="Single-series area line"><LineChart data={wave(30, 150, 70)} /></Block>
        <Block title="Bar chart"><BarChart data={[2, 5, 3, 8, 4, 6, 7, 5, 9, 4]} /></Block>

        <SectionLabel>Grouped · Stacked</SectionLabel>
        <Block title="Grouped bars — week vs last week (kWh)"><GroupedBar series={grouped} labels={weekLabels} /></Block>
        <Block title="Stacked bars — usage by category (kWh)"><StackedBar series={stacked} labels={weekLabels} /></Block>

        <SectionLabel>Distribution</SectionLabel>
        <Block title="Donut"><Donut segments={[{ label: "AC", value: 48, color: PALETTE[0] }, { label: "Lights", value: 22, color: PALETTE[3] }, { label: "Appliances", value: 18, color: PALETTE[1] }, { label: "Others", value: 12, color: PALETTE[2] }]} /></Block>
        <Block title="Pie"><PieChart segments={[{ label: "Lights", value: 4 }, { label: "Sensors", value: 3 }, { label: "Energy", value: 2 }]} /></Block>
        <Block title="Ranked horizontal bars"><HBars items={[{ name: "Air Conditioner", value: 480 }, { name: "Geyser", value: 320 }, { name: "Fridge", value: 180 }, { name: "Lights", value: 90 }]} unit=" W" /></Block>

        <SectionLabel>Gauges & progress</SectionLabel>
        <Block title="Semicircular gauge"><View style={{ alignItems: "center" }}><Gauge value={248} max={500} unit="W" label="live power" /></View></Block>
        <Block title="Progress ring"><View style={{ alignItems: "center" }}><ProgressRing value={64} label="Comfort" /></View></Block>
        <Block title="Bullet — value vs target">
          <Bullet label="Daily budget" value={4.2} target={5} max={7} unit=" kWh" color={PALETTE[4]} />
          <Bullet label="Water" value={180} target={150} max={250} unit=" L" color={PALETTE[0]} />
        </Block>

        <SectionLabel>Radar · Sparkline · Heatmap</SectionLabel>
        <Block title="Radar — Home vs Away profile"><RadarChart axes={["Comfort", "Energy", "Security", "Air", "Water", "Lights"]} series={radar} /></Block>
        <Block title="Sparklines">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <Sparkline data={wave(20, 40, 20)} color={PALETTE[0]} />
            <Sparkline data={wave(20, 40, 30, 2)} color={PALETTE[2]} />
            <Sparkline data={wave(20, 40, 10, 4)} color={PALETTE[4]} />
          </View>
        </Block>
        <Block title="Calendar heatmap (5 weeks)"><CalendarHeatmap days={days} /></Block>
      </ScrollView>
    </Screen>
  );
}
