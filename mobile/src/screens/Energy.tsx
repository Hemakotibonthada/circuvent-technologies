import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native";
import { api, EnergySummary, EnergySeries } from "../api";
import { Screen, Card, SectionLabel, useTheme, Chip } from "../ui";
import { Gauge, LineChart, Donut, Sparkline, HBars } from "../charts";
import { deviceMeta } from "../theme";

const PALETTE = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#14b8a6"];

export default function Energy() {
  const { c } = useTheme();
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [series, setSeries] = useState<EnergySeries | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async () => {
    const r = await api.energySummary();
    if (r.ok) {
      setSummary(r.data);
      setSelected((cur) => cur ?? r.data.byDevice[0]?.id ?? null);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    const t = setInterval(loadSummary, 15000);
    return () => clearInterval(t);
  }, [loadSummary]);

  useEffect(() => {
    if (!selected) return;
    api.deviceEnergy(selected, hours).then((r) => { if (r.ok) setSeries(r.data); });
  }, [selected, hours]);

  const totalW = summary?.liveWatts ?? 0;
  const consumers = (summary?.byDevice ?? []).filter((d) => d.watts > 0);
  const donut = consumers.slice(0, 6).map((d, i) => ({ label: d.name, value: d.watts, color: PALETTE[i % PALETTE.length] }));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={async () => { setRefreshing(true); await loadSummary(); setRefreshing(false); }} />}
      >
        <Text style={{ color: c.text, fontSize: 26, fontWeight: "800", marginBottom: 16 }}>Energy</Text>

        <Card padded style={{ alignItems: "center", marginBottom: 14 }}>
          <Gauge value={totalW} max={Math.max(500, Math.ceil(totalW / 500) * 500)} unit="W" label="live power" />
          <View style={s.kwhRow}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>{(summary?.todayKwh ?? 0).toFixed(2)}</Text>
              <Text style={{ color: c.faint, fontSize: 12 }}>kWh today</Text>
            </View>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>₹{((summary?.todayKwh ?? 0) * 8).toFixed(1)}</Text>
              <Text style={{ color: c.faint, fontSize: 12 }}>est. cost (₹8/kWh)</Text>
            </View>
          </View>
        </Card>

        {donut.length > 0 && (
          <>
            <SectionLabel>DISTRIBUTION</SectionLabel>
            <Card padded style={{ marginBottom: 14, alignItems: "center" }}>
              <Donut segments={donut} />
            </Card>
          </>
        )}

        {consumers.length > 0 && (
          <>
            <SectionLabel>TOP CONSUMERS</SectionLabel>
            <Card padded style={{ marginBottom: 14 }}>
              <HBars items={consumers.slice(0, 6).map((d, i) => ({ name: d.name, value: Math.round(d.watts), color: PALETTE[i % PALETTE.length] }))} unit=" W" />
            </Card>
          </>
        )}

        <SectionLabel>HISTORY</SectionLabel>
        <Card padded style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <Chip label="24 h" active={hours === 24} onPress={() => setHours(24)} />
            <Chip label="7 days" active={hours === 168} onPress={() => setHours(168)} />
            <Chip label="30 days" active={hours === 720} onPress={() => setHours(720)} />
          </View>
          <LineChart data={(series?.series ?? []).map((p) => p.avg)} />
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 8 }}>
            {series ? `${series.kwh.toFixed(2)} kWh over ${hours <= 24 ? "24h" : hours <= 168 ? "7d" : "30d"}` : "Select a device"}
          </Text>
        </Card>

        <SectionLabel>DEVICES</SectionLabel>
        {(summary?.byDevice ?? []).map((d) => {
          const meta = deviceMeta(d.type);
          const on = selected === d.id;
          return (
            <Pressable key={d.id} onPress={() => setSelected(d.id)}>
              <Card padded hi={on} style={[{ marginBottom: 10 }, on && { borderColor: c.accent, borderWidth: 1.5 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={{ fontSize: 20 }}>{meta.glyph}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "700" }} numberOfLines={1}>{d.name}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>{d.online ? "online" : "offline"}</Text>
                  </View>
                  <Text style={{ color: c.accent, fontWeight: "800", fontSize: 16 }}>{d.watts.toFixed(0)} W</Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
        {(summary?.byDevice ?? []).length === 0 && <Text style={{ color: c.faint }}>No devices yet.</Text>}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  kwhRow: { flexDirection: "row", alignItems: "center", marginTop: 14, width: "100%" },
});
