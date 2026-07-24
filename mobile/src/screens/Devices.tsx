import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Switch } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api, Device } from "../api";
import { useAuth } from "../auth";
import { useLive } from "../live";
import AddDevice from "./AddDevice";
import { C, GRAD, deviceMeta, greeting } from "../theme";

export default function Devices({ onOpen, onAutomations }: { onOpen: (d: Device) => void; onAutomations: () => void }) {
  const { account, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await api.devices();
    if (r.ok) setDevices(r.data.devices || []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useLive((u) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== u.deviceId) return d;
        if (u.kind === "status") return { ...d, online: !!u.payload?.online };
        if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
        return { ...d, online: true };
      })
    );
  });

  const toggle = (d: Device, field: string, v: boolean) => {
    setDevices((prev) => prev.map((x) => (x.id === d.id ? { ...x, state: { ...x.state, [field]: v } } : x)));
    api.command(d.id, { action: "set", [field]: v });
  };

  if (adding) return <AddDevice onClose={(added) => { setAdding(false); if (added) load(); }} />;

  const online = devices.filter((d) => d.online).length;
  const firstName = (account?.name || "").trim().split(" ")[0];

  const header = (
    <View>
      <View style={s.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>{greeting()}{firstName ? `, ${firstName}` : ""}</Text>
          <Text style={s.h1}>Your devices</Text>
        </View>
        <Pressable onPress={logout} hitSlop={8} style={s.iconBtn}><Text style={s.iconBtnT}>⎋</Text></Pressable>
      </View>

      <View style={s.summaryRow}>
        <Stat label="Devices" value={String(devices.length)} grad={GRAD.violet} glyph="📟" />
        <Stat label="Online" value={String(online)} grad={GRAD.green} glyph="🟢" />
        <Stat label="Offline" value={String(devices.length - online)} grad={GRAD.slate} glyph="⚪" />
      </View>

      <Pressable onPress={onAutomations}>
        <LinearGradient colors={GRAD.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.automations}>
          <Text style={s.autoGlyph}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.autoTitle}>Automations</Text>
            <Text style={s.autoSub}>Rules that run on events or a schedule</Text>
          </View>
          <Text style={s.autoChev}>›</Text>
        </LinearGradient>
      </Pressable>

      <Text style={s.sectionLabel}>DEVICES</Text>
    </View>
  );

  return (
    <LinearGradient colors={GRAD.screen} style={s.wrap}>
      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.cyanHi} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<EmptyState onAdd={() => setAdding(true)} />}
        renderItem={({ item }) => <DeviceCard device={item} onOpen={onOpen} onToggle={toggle} />}
        ListFooterComponent={devices.length ? <AddCard onAdd={() => setAdding(true)} /> : null}
      />
    </LinearGradient>
  );
}

function DeviceCard({ device, onOpen, onToggle }: { device: Device; onOpen: (d: Device) => void; onToggle: (d: Device, f: string, v: boolean) => void }) {
  const meta = deviceMeta(device.type);
  return (
    <Pressable style={s.card} onPress={() => onOpen(device)}>
      <View style={s.cardTop}>
        <LinearGradient colors={meta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pill}>
          <Text style={s.pillGlyph}>{meta.glyph}</Text>
        </LinearGradient>
        <View style={[s.statusDot, { backgroundColor: device.online ? C.green : C.faint }]} />
      </View>
      <Text style={s.cardName} numberOfLines={1}>{device.name || device.id}</Text>
      <Text style={s.cardType} numberOfLines={1}>{meta.label}</Text>

      <View style={s.cardBottom}>
        <Text style={[s.metric, { color: meta.accent }]}>{metric(device)}</Text>
        {meta.toggle ? (
          <Switch
            value={!!device.state[meta.toggle.field]}
            onValueChange={(v) => onToggle(device, meta.toggle!.field, v)}
            trackColor={{ true: meta.accent, false: "#334155" }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
          />
        ) : (
          <Text style={s.chev}>›</Text>
        )}
      </View>
    </Pressable>
  );
}

function metric(d: Device): string {
  switch (d.type) {
    case "aquaguard": return `${Number(d.state.level ?? 0)}%`;
    case "smart-plug":
    case "energy-monitor": return `${Number(d.state.watts ?? 0).toFixed(0)} W`;
    case "guardian": return d.state.sos ? "SOS" : d.state.armed ? "Armed" : "Disarmed";
    case "motion-sensor": return d.state.motion ? "Motion" : d.state.armed ? "Armed" : "Clear";
    case "smart-switch": return `${[d.state.power, d.state.power2].filter(Boolean).length}/2 on`;
    case "home-hub": return `${[d.state.power, d.state.power2, d.state.power3, d.state.power4].filter(Boolean).length}/4 on`;
    case "agri-starter": return d.state.pump ? "Pump on" : "Pump off";
    default: return d.online ? "online" : "offline";
  }
}

function Stat({ label, value, grad, glyph }: { label: string; value: string; grad: readonly [string, string]; glyph: string }) {
  return (
    <View style={s.stat}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.statPill}>
        <Text style={{ fontSize: 13 }}>{glyph}</Text>
      </LinearGradient>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function AddCard({ onAdd }: { onAdd: () => void }) {
  return (
    <Pressable style={s.addCard} onPress={onAdd}>
      <Text style={s.addPlus}>＋</Text>
      <Text style={s.addText}>Add a device</Text>
    </Pressable>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={s.empty}>
      <LinearGradient colors={GRAD.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.emptyPill}>
        <Text style={{ fontSize: 30 }}>📡</Text>
      </LinearGradient>
      <Text style={s.emptyTitle}>No devices yet</Text>
      <Text style={s.emptySub}>Power on a Circuvent device and add it — it takes about a minute.</Text>
      <Pressable onPress={onAdd} style={{ width: "100%" }}>
        <LinearGradient colors={GRAD.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.emptyBtn}>
          <Text style={s.emptyBtnT}>＋ Add your first device</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 18 },
  greeting: { color: C.textDim, fontSize: 14 },
  h1: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  iconBtnT: { color: C.textDim, fontSize: 18 },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "flex-start" },
  statPill: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { color: "#fff", fontSize: 22, fontWeight: "800" },
  statLabel: { color: C.faint, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  automations: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 16, marginBottom: 20 },
  autoGlyph: { fontSize: 22 },
  autoTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  autoSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 1 },
  autoChev: { color: "#fff", fontSize: 24 },
  sectionLabel: { color: C.faint, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginBottom: 12 },
  card: { width: "48%", backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  pill: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pillGlyph: { fontSize: 22 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  cardName: { color: C.text, fontSize: 15, fontWeight: "700" },
  cardType: { color: C.faint, fontSize: 12, marginTop: 1 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, minHeight: 30 },
  metric: { fontSize: 15, fontWeight: "800" },
  chev: { color: C.faint, fontSize: 20 },
  addCard: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderColor: C.borderHi, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 18, paddingVertical: 18, marginTop: 4 },
  addPlus: { color: C.cyanHi, fontSize: 20, fontWeight: "800" },
  addText: { color: C.cyanHi, fontSize: 15, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 10 },
  emptyPill: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  emptySub: { color: C.textDim, textAlign: "center", marginTop: 6, marginBottom: 22, lineHeight: 20 },
  emptyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  emptyBtnT: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
