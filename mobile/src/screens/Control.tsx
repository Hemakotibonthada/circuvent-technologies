import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Switch, StyleSheet, ScrollView } from "react-native";
import { api, Device } from "../api";
import { useLive } from "../live";

export default function Control({ device, onBack }: { device: Device; onBack: () => void }) {
  const [d, setD] = useState<Device>(device);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.device(device.id);
    if (r.ok && r.data?.device) setD(r.data.device);
  }, [device.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // slow fallback; live updates arrive via WS
    return () => clearInterval(t);
  }, [load]);

  // Real-time state/status for this device.
  useLive((u) => {
    if (u.deviceId !== device.id) return;
    setD((prev) => {
      if (u.kind === "status") return { ...prev, online: !!u.payload?.online };
      if (u.kind === "state") return { ...prev, online: true, state: { ...prev.state, ...u.payload } };
      return { ...prev, online: true };
    });
  });

  const send = async (params: Record<string, any>) => {
    setBusy(true);
    // Optimistic update for a snappy UI; the device echoes true state via WS.
    setD((prev) => ({ ...prev, state: { ...prev.state, ...params } }));
    await api.command(d.id, { action: "set", ...params });
    setBusy(false);
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16 }}>
      <Pressable onPress={onBack}><Text style={s.back}>‹ Devices</Text></Pressable>
      <Text style={s.h1}>{d.name}</Text>
      <Text style={[s.status, { color: d.online ? "#22c55e" : "#64748b" }]}>{d.online ? "● Online" : "○ Offline"}</Text>

      {d.type === "aquaguard" && <AquaGuard d={d} send={send} busy={busy} />}
      {d.type === "home-hub" && <HomeHub d={d} send={send} busy={busy} />}
      {d.type === "smart-plug" && <SmartPlug d={d} send={send} busy={busy} />}
      {d.type === "smart-switch" && <SmartSwitch d={d} send={send} busy={busy} />}
      {d.type === "energy-monitor" && <EnergyMonitor d={d} />}
      {d.type === "guardian" && <Guardian d={d} send={send} busy={busy} />}
      {d.type === "motion-sensor" && <MotionSensor d={d} send={send} busy={busy} />}
      {d.type === "agri-starter" && <AgriStarter d={d} send={send} busy={busy} />}
      {!KNOWN.includes(d.type) && (
        <>
          <Text style={s.section}>Raw state</Text>
          <Text style={{ color: "#94a3b8", fontFamily: "monospace" }}>{JSON.stringify(d.state, null, 2)}</Text>
        </>
      )}
    </ScrollView>
  );
}

const KNOWN = ["aquaguard", "home-hub", "smart-plug", "smart-switch", "energy-monitor", "guardian", "motion-sensor", "agri-starter"];

function AquaGuard({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  const level = Number(d.state.level ?? 0);
  const startPct = Number(d.state.startPct ?? 25);
  const stopPct = Number(d.state.stopPct ?? 95);
  return (
    <View>
      <View style={s.gauge}>
        <Text style={s.level}>{level}<Text style={s.pct}>%</Text></Text>
        <View style={s.barBg}><View style={[s.barFill, { width: `${Math.min(100, level)}%` }]} /></View>
        <Text style={s.tank}>Tank level</Text>
      </View>

      {!!d.state.dryRun && <Text style={s.alert}>⚠ Dry-run detected — pump stopped</Text>}
      {!!d.state.overflow && <Text style={s.alert}>⚠ Overflow — pump stopped</Text>}

      <Row label="Auto mode"><Switch value={!!d.state.auto} onValueChange={(v) => send({ auto: v })} /></Row>
      <Row label="Pump"><Switch value={!!d.state.pump} onValueChange={(v) => send({ pump: v })} /></Row>

      <Text style={s.section}>Auto thresholds</Text>
      <Stepper label={`Start at ${startPct}%`} onDown={() => send({ startPct: Math.max(5, startPct - 5) })} onUp={() => send({ startPct: startPct + 5 })} />
      <Stepper label={`Stop at ${stopPct}%`} onDown={() => send({ stopPct: stopPct - 5 })} onUp={() => send({ stopPct: Math.min(100, stopPct + 5) })} />
    </View>
  );
}

function HomeHub({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  const channels = [
    { key: "power", ch: 0, label: "Channel 1" },
    { key: "power2", ch: 1, label: "Channel 2" },
    { key: "power3", ch: 2, label: "Channel 3" },
    { key: "power4", ch: 3, label: "Channel 4" },
  ];
  const scenes = ["home", "away", "night", "movie"];
  return (
    <View>
      {channels.map((c) => (
        <Row key={c.key} label={c.label}>
          <Switch value={!!d.state[c.key]} onValueChange={(v) => send({ ch: c.ch, on: v })} />
        </Row>
      ))}
      <Text style={s.section}>Scenes</Text>
      <View style={s.scenes}>
        {scenes.map((sc) => (
          <Pressable key={sc} style={[s.scene, d.state.scene === sc && s.sceneOn]} onPress={() => send({ scene: sc })}>
            <Text style={[s.sceneT, d.state.scene === sc && { color: "#fff" }]}>{sc}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SmartPlug({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  const watts = Number(d.state.watts ?? 0);
  return (
    <View>
      <View style={s.gauge}>
        <Text style={s.level}>{watts.toFixed(1)}<Text style={s.pct}> W</Text></Text>
        <Text style={s.tank}>Live power draw</Text>
      </View>
      <Row label="Power"><Switch value={!!d.state.power} onValueChange={(v) => send({ power: v })} /></Row>
    </View>
  );
}

function SmartSwitch({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  return (
    <View>
      <Row label="Gang 1"><Switch value={!!d.state.power} onValueChange={(v) => send({ power: v })} /></Row>
      <Row label="Gang 2"><Switch value={!!d.state.power2} onValueChange={(v) => send({ power2: v })} /></Row>
    </View>
  );
}

function EnergyMonitor({ d }: { d: Device }) {
  const watts = Number(d.state.watts ?? 0);
  const amps = Number(d.state.amps ?? 0);
  const kwh = Number(d.state.kwh ?? 0);
  return (
    <View>
      <View style={s.gauge}>
        <Text style={s.level}>{watts.toFixed(0)}<Text style={s.pct}> W</Text></Text>
        <Text style={s.tank}>Instantaneous load</Text>
      </View>
      <View style={s.statsRow}>
        <Stat label="Current" value={`${amps.toFixed(2)} A`} />
        <Stat label="Energy" value={`${kwh.toFixed(2)} kWh`} />
      </View>
      <Text style={s.note}>Read-only meter — no controls.</Text>
    </View>
  );
}

function Guardian({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  const battery = Number(d.state.battery ?? 0);
  const lat = d.state.lat != null ? Number(d.state.lat) : null;
  const lng = d.state.lng != null ? Number(d.state.lng) : null;
  return (
    <View>
      {!!d.state.sos && (
        <View style={s.sosBanner}>
          <Text style={s.sosT}>🆘 SOS TRIGGERED</Text>
          <Pressable style={s.sosClear} onPress={() => send({ sos: false })}><Text style={s.sosClearT}>Clear alert</Text></Pressable>
        </View>
      )}
      <Row label="Armed"><Switch value={!!d.state.armed} onValueChange={(v) => send({ armed: v })} /></Row>
      <View style={s.statsRow}>
        <Stat label="Battery" value={`${battery}%`} />
        <Stat label="Location" value={lat != null && lng != null ? `${lat.toFixed(3)}, ${lng.toFixed(3)}` : "—"} />
      </View>
    </View>
  );
}

function MotionSensor({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  const motion = !!d.state.motion;
  return (
    <View>
      <View style={[s.gauge, { backgroundColor: motion ? "rgba(239,68,68,0.15)" : "#111827" }]}>
        <Text style={[s.level, { fontSize: 30, color: motion ? "#ef4444" : "#22c55e" }]}>{motion ? "MOTION" : "CLEAR"}</Text>
        <Text style={s.tank}>{d.state.armed ? "Armed" : "Disarmed"}</Text>
      </View>
      <Row label="Armed"><Switch value={!!d.state.armed} onValueChange={(v) => send({ armed: v })} /></Row>
    </View>
  );
}

function AgriStarter({ d, send }: { d: Device; send: (p: any) => void; busy: boolean }) {
  const power = !!d.state.power_available;
  return (
    <View>
      <Row label="Pump"><Switch value={!!d.state.pump} onValueChange={(v) => send({ pump: v })} /></Row>
      <View style={[s.row, { justifyContent: "flex-start" }]}>
        <Text style={s.rowT}>Mains power </Text>
        <Text style={{ color: power ? "#22c55e" : "#ef4444", fontWeight: "700" }}>{power ? "Available" : "Unavailable"}</Text>
      </View>
      {!power && <Text style={s.alert}>⚠ No mains power — pump cannot start</Text>}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statV}>{value}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowT}>{label}</Text>
      {children}
    </View>
  );
}
function Stepper({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={s.row}>
      <Text style={s.rowT}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable style={s.step} onPress={onDown}><Text style={s.stepT}>−</Text></Pressable>
        <Pressable style={s.step} onPress={onUp}><Text style={s.stepT}>+</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b1020" },
  back: { color: "#8b5cf6", marginTop: 8, marginBottom: 6 },
  h1: { color: "#fff", fontSize: 24, fontWeight: "800" },
  status: { marginBottom: 16, marginTop: 2 },
  gauge: { backgroundColor: "#111827", borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 16 },
  level: { color: "#fff", fontSize: 56, fontWeight: "800" },
  pct: { fontSize: 24, color: "#94a3b8" },
  barBg: { width: "100%", height: 14, borderRadius: 7, backgroundColor: "#1f2937", marginTop: 8, overflow: "hidden" },
  barFill: { height: 14, borderRadius: 7, backgroundColor: "#06b6d4" },
  tank: { color: "#64748b", marginTop: 8 },
  alert: { color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.12)", padding: 10, borderRadius: 10, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111827", borderRadius: 12, padding: 16, marginBottom: 10 },
  rowT: { color: "#e5e7eb", fontSize: 16 },
  section: { color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  step: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },
  stepT: { color: "#fff", fontSize: 22 },
  scenes: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  scene: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: "#111827", borderColor: "#334155", borderWidth: 1 },
  sceneOn: { backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" },
  sceneT: { color: "#94a3b8", textTransform: "capitalize" },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: "#111827", borderRadius: 12, padding: 16, alignItems: "center" },
  statV: { color: "#fff", fontSize: 20, fontWeight: "800" },
  statL: { color: "#64748b", fontSize: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  note: { color: "#64748b", marginTop: 12, fontStyle: "italic" },
  sosBanner: { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#ef4444", borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12, alignItems: "center" },
  sosT: { color: "#ef4444", fontSize: 18, fontWeight: "800", marginBottom: 10 },
  sosClear: { backgroundColor: "#ef4444", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  sosClearT: { color: "#fff", fontWeight: "700" },
});
