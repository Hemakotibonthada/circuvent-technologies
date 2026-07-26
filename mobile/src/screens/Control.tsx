import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Switch, StyleSheet, ScrollView, Alert, Animated, Easing, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { Device } from "../api";
import { useDevices, capabilities } from "../store";
import { Screen, Card, useTheme, ArcGauge, PillSelector } from "../ui";
import { deviceMeta, type Palette } from "../theme";
import { useSwitchWidgets } from "../widgets";

const COLORS = ["#ffffff", "#ffd27f", "#ff7f7f", "#7fd0ff", "#7fff9e", "#c79bff", "#ff9be0"];

export default function Control({ device, onBack, onChangeWifi }: { device: Device; onBack: () => void; onChangeWifi?: (d: Device) => void }) {
  const { c } = useTheme();
  const { byId, command, patch } = useDevices();
  const d = byId(device.id) ?? device;

  const send = (params: Record<string, unknown>) => command(d.id, { action: "set", ...params });

  const rename = () => {
    Alert.prompt?.("Rename device", undefined, (text) => { if (text?.trim()) patch(d.id, { name: text.trim() }); }, "plain-text", d.name || "");
  };

  const meta = deviceMeta(d.type);
  const cap = capabilities(d.type);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 52, paddingBottom: 40 }}>
        <View style={s.topBar}>
          <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: c.textDim, fontSize: 16 }}>‹ Devices</Text></Pressable>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <Pressable onPress={() => patch(d.id, { favorite: !d.favorite })} hitSlop={8}><Text style={{ fontSize: 18 }}>{d.favorite ? "⭐" : "☆"}</Text></Pressable>
            <Pressable onPress={rename} hitSlop={8}><Text style={{ color: c.textDim, fontSize: 16 }}>✎</Text></Pressable>
          </View>
        </View>

        <View style={s.hero}>
          <LinearGradient colors={meta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroPill}><Text style={{ fontSize: 28 }}>{meta.glyph}</Text></LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }} numberOfLines={1}>{d.name || d.id}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Text style={{ color: c.textDim, fontSize: 13 }}>{d.room || meta.label}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.online ? c.green : c.faint }} />
              <Text style={{ color: d.online ? c.green : c.faint, fontSize: 13, fontWeight: "600" }}>{d.online ? "Online" : "Offline"}</Text>
            </View>
          </View>
        </View>

        {d.type === "aquaguard" && <AquaGuard d={d} send={send} c={c} />}
        {d.type === "home-hub" && <HomeHub d={d} send={send} c={c} />}
        {d.type === "smart-plug" && <SmartPlug d={d} send={send} c={c} />}
        {d.type === "smart-switch" && <SmartSwitch d={d} send={send} c={c} />}
        {d.type === "energy-monitor" && <EnergyMonitor d={d} c={c} />}
        {d.type === "guardian" && <Guardian d={d} send={send} c={c} />}
        {d.type === "motion-sensor" && <MotionSensor d={d} send={send} c={c} />}
        {d.type === "agri-starter" && <AgriStarter d={d} send={send} c={c} />}
        {d.type === "watertank" && <WaterTank d={d} send={send} c={c} />}
        {d.type === "rfid-gate" && <RfidGate d={d} send={send} c={c} />}
        {d.type === "facedoor" && <FaceDoor d={d} send={send} c={c} />}
        {d.type === "touchboard" && <TouchBoard d={d} send={send} c={c} />}

        {/* Generic capability controls (appear for dimmable / fan / climate / colour devices) */}
        <GenericControls d={d} send={send} c={c} />

        {!KNOWN.includes(d.type) && !cap.power && !cap.dimmer && !cap.fan && !cap.thermostat && (
          <Card padded>
            <Text style={{ color: c.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Raw state</Text>
            <Text style={{ color: c.faint, fontFamily: "monospace", fontSize: 12 }}>{JSON.stringify(d.state, null, 2)}</Text>
          </Card>
        )}

        <Section c={c}>Device setup</Section>
        <Pressable onPress={() => onChangeWifi?.(d)}>
          <Card padded style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 22 }}>📶</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>Change Wi-Fi network</Text>
              <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>Moved house or router? Reset the device and push new Wi-Fi.</Text>
            </View>
            <Text style={{ color: c.faint, fontSize: 22 }}>›</Text>
          </Card>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const KNOWN = ["aquaguard", "home-hub", "smart-plug", "smart-switch", "energy-monitor", "guardian", "motion-sensor", "agri-starter", "watertank", "rfid-gate", "facedoor", "touchboard"];

// ------------------------------------------------------------ shared bits ---

function Row({ label, c, children }: { label: string; c: Palette; children: React.ReactNode }) {
  return (
    <Card padded style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: c.text, fontSize: 16 }}>{label}</Text>
        {children}
      </View>
    </Card>
  );
}
function Section({ children, c }: { children: React.ReactNode; c: Palette }) {
  return <Text style={{ color: c.faint, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 8 }}>{children}</Text>;
}
function Big({ value, unit, caption, c }: { value: string; unit?: string; caption: string; c: Palette }) {
  return (
    <Card padded style={{ alignItems: "center", marginBottom: 14 }}>
      <Text style={{ color: c.text, fontSize: 52, fontWeight: "800" }}>{value}{unit ? <Text style={{ fontSize: 22, color: c.textDim }}>{unit}</Text> : null}</Text>
      <Text style={{ color: c.faint, marginTop: 6 }}>{caption}</Text>
    </Card>
  );
}
function Sw({ v, on, c }: { v: boolean; on: (b: boolean) => void; c: Palette }) {
  return <Switch value={v} onValueChange={on} trackColor={{ true: c.accent, false: "#334155" }} thumbColor="#fff" />;
}

function GenericControls({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const cap = capabilities(d.type);
  const showPower = !!cap.power && !KNOWN.includes(d.type);
  if (!showPower && !cap.dimmer && !cap.fan && !cap.color && !cap.thermostat) return null;
  return (
    <View>
      {showPower && cap.power && (
        <Card padded style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.text, fontSize: 16 }}>{cap.power.label}</Text>
            <Sw v={!!d.state[cap.power.field]} on={(v) => send({ [cap.power!.field]: v })} c={c} />
          </View>
        </Card>
      )}
      {cap.dimmer && (
        <Card padded style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.text, fontSize: 16 }}>{cap.dimmer.label}</Text>
            <Text style={{ color: c.accent, fontWeight: "800" }}>{Number(d.state[cap.dimmer.field] ?? 0)}%</Text>
          </View>
          <Slider
            minimumValue={cap.dimmer.min} maximumValue={cap.dimmer.max} step={1}
            value={Number(d.state[cap.dimmer.field] ?? 0)}
            onSlidingComplete={(v) => send({ [cap.dimmer!.field]: Math.round(v) })}
            minimumTrackTintColor={c.accent} maximumTrackTintColor={c.border} thumbTintColor={c.accentHi}
          />
        </Card>
      )}
      {cap.fan && (
        <Card padded style={{ marginBottom: 10 }}>
          <Text style={{ color: c.text, fontSize: 16, marginBottom: 10 }}>{cap.fan.label}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: cap.fan.steps + 1 }).map((_, i) => {
              const active = Number(d.state[cap.fan!.field] ?? 0) === i;
              return (
                <Pressable key={i} onPress={() => send({ [cap.fan!.field]: i })} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border }}>
                  <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "700" }}>{i === 0 ? "Off" : i}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}
      {cap.thermostat && (
        <Card padded style={{ marginBottom: 10, alignItems: "center" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginBottom: 6 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>{cap.thermostat.label}</Text>
            <Text style={{ color: c.faint, fontWeight: "700" }}>{String(d.state.mode ?? "cool")}</Text>
          </View>
          <ArcGauge
            value={Number(d.state[cap.thermostat.field] ?? cap.thermostat.min)}
            min={cap.thermostat.min}
            max={cap.thermostat.max}
            onChange={(v) => send({ [cap.thermostat!.field]: v })}
          />
          <PillSelector
            options={["cool", "dry", "fan"] as const}
            value={(["cool", "dry", "fan"].includes(String(d.state.mode)) ? String(d.state.mode) : "cool") as "cool" | "dry" | "fan"}
            onChange={(m) => send({ mode: m })}
            style={{ alignSelf: "stretch", marginTop: 16 }}
          />
        </Card>
      )}
      {cap.color && (
        <Card padded style={{ marginBottom: 10 }}>
          <Text style={{ color: c.text, fontSize: 16, marginBottom: 10 }}>Colour</Text>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {COLORS.map((col) => (
              <Pressable key={col} onPress={() => send({ [cap.color!.field]: col })} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: col, borderWidth: d.state[cap.color!.field] === col ? 3 : 1, borderColor: d.state[cap.color!.field] === col ? c.text : c.border }} />
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}

// --------------------------------------------------------- device sections --

function AquaGuard({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const level = Number(d.state.level ?? 0);
  const startPct = Number(d.state.startPct ?? 25);
  const stopPct = Number(d.state.stopPct ?? 95);
  return (
    <View>
      <Card padded style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <WaveTank label="Tank level" pct={level} litres={Number(d.state.litres ?? 0)} c={c} accent={c.cyan} fault={!!d.state.sensorFault} />
          <View style={{ flex: 1, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: !!d.state.pump ? c.cyan : c.faint, fontWeight: "800" }}>{!!d.state.pump ? "▲ Pumping" : "Idle"}</Text>
            </View>
            <MiniStat label="Level" value={`${level}%`} c={c} />
            <MiniStat label="Mode" value={!!d.state.auto ? "Auto" : "Manual"} c={c} />
          </View>
        </View>
      </Card>
      {!!d.state.dryRun && <Alertline c={c} text="⚠ Dry-run detected — pump stopped" />}
      {!!d.state.overflow && <Alertline c={c} text="⚠ Overflow — pump stopped" />}
      <Row label="Auto mode" c={c}><Sw v={!!d.state.auto} on={(v) => send({ auto: v })} c={c} /></Row>
      <Row label="Pump" c={c}><Sw v={!!d.state.pump} on={(v) => send({ pump: v })} c={c} /></Row>
      <Section c={c}>Auto thresholds</Section>
      <Stepper label={`Start at ${startPct}%`} c={c} onDown={() => send({ startPct: Math.max(5, startPct - 5) })} onUp={() => send({ startPct: startPct + 5 })} />
      <Stepper label={`Stop at ${stopPct}%`} c={c} onDown={() => send({ stopPct: stopPct - 5 })} onUp={() => send({ stopPct: Math.min(100, stopPct + 5) })} />
    </View>
  );
}

function HomeHub({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const channels = [
    { key: "power", ch: 0, label: "Channel 1" },
    { key: "power2", ch: 1, label: "Channel 2" },
    { key: "power3", ch: 2, label: "Channel 3" },
    { key: "power4", ch: 3, label: "Channel 4" },
  ];
  const scenes = ["home", "away", "night", "movie"];
  return (
    <View>
      {channels.map((ch) => (
        <Row key={ch.key} label={ch.label} c={c}><Sw v={!!d.state[ch.key]} on={(v) => send({ ch: ch.ch, on: v })} c={c} /></Row>
      ))}
      <Section c={c}>Scenes</Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {scenes.map((sc) => {
          const on = d.state.scene === sc;
          return (
            <Pressable key={sc} onPress={() => send({ scene: sc })} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: on ? c.accent : c.card, borderColor: on ? c.accent : c.border, borderWidth: 1 }}>
              <Text style={{ color: on ? c.onAccent : c.textDim, textTransform: "capitalize", fontWeight: "700" }}>{sc}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SmartPlug({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  return (
    <View>
      <Big value={Number(d.state.watts ?? 0).toFixed(1)} unit=" W" caption="Live power draw" c={c} />
      <Row label="Power" c={c}><Sw v={!!d.state.power} on={(v) => send({ power: v })} c={c} /></Row>
    </View>
  );
}

function SmartSwitch({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  return <SwitchGangs d={d} send={send} c={c} />;
}

// Reusable multi-gang control with per-device widget customization (rename +
// show/hide). Used by smart-switch, and available to any boolean-field device.
function SwitchGangs({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const { gangs, visible, rename, setVisible, reset } = useSwitchWidgets(d);
  const [editing, setEditing] = useState(false);
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Section c={c}>Controls</Section>
        <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}><Text style={{ color: c.accentHi, fontWeight: "700", fontSize: 13 }}>{editing ? "Done" : "Customize"}</Text></Pressable>
      </View>
      {editing ? (
        <View>
          {gangs.map((g) => (
            <Card key={g.field} padded style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <TextInput
                  value={g.label}
                  onChangeText={(t) => rename(g.field, t)}
                  placeholder={g.field}
                  placeholderTextColor={c.faint}
                  style={{ flex: 1, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}
                />
                <Sw v={g.visible} on={(v) => setVisible(g.field, v)} c={c} />
              </View>
            </Card>
          ))}
          <Pressable onPress={reset} style={{ alignSelf: "flex-start", marginTop: 2 }}><Text style={{ color: c.faint }}>Reset to defaults</Text></Pressable>
        </View>
      ) : (
        <View>
          {visible.length === 0 && <Text style={{ color: c.faint }}>All widgets hidden. Tap Customize to show some.</Text>}
          {visible.map((g) => (
            <Row key={g.field} label={g.label} c={c}><Sw v={!!d.state[g.field]} on={(v) => send({ [g.field]: v })} c={c} /></Row>
          ))}
        </View>
      )}
    </View>
  );
}

function EnergyMonitor({ d, c }: { d: Device; c: Palette }) {
  return (
    <View>
      <Big value={Number(d.state.watts ?? 0).toFixed(0)} unit=" W" caption="Instantaneous load" c={c} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <MiniStat label="Current" value={`${Number(d.state.amps ?? 0).toFixed(2)} A`} c={c} />
        <MiniStat label="Energy" value={`${Number(d.state.kwh ?? 0).toFixed(2)} kWh`} c={c} />
      </View>
    </View>
  );
}

function Guardian({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const lat = d.state.lat != null ? Number(d.state.lat) : null;
  const lng = d.state.lng != null ? Number(d.state.lng) : null;
  return (
    <View>
      {!!d.state.sos && (
        <Card padded style={{ marginBottom: 12, borderColor: c.red, borderWidth: 1, alignItems: "center" }}>
          <Text style={{ color: c.red, fontSize: 18, fontWeight: "800", marginBottom: 10 }}>🆘 SOS TRIGGERED</Text>
          <Pressable onPress={() => send({ sos: false })} style={{ backgroundColor: c.red, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }}><Text style={{ color: "#fff", fontWeight: "700" }}>Clear alert</Text></Pressable>
        </Card>
      )}
      <Row label="Armed" c={c}><Sw v={!!d.state.armed} on={(v) => send({ armed: v })} c={c} /></Row>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <MiniStat label="Battery" value={`${Number(d.state.battery ?? 0)}%`} c={c} />
        <MiniStat label="Location" value={lat != null && lng != null ? `${lat.toFixed(2)}, ${lng.toFixed(2)}` : "—"} c={c} />
      </View>
    </View>
  );
}

function MotionSensor({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const motion = !!d.state.motion;
  return (
    <View>
      <Card padded style={{ alignItems: "center", marginBottom: 14 }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: motion ? c.red : c.green }}>{motion ? "MOTION" : "CLEAR"}</Text>
        <Text style={{ color: c.faint, marginTop: 6 }}>{d.state.armed ? "Armed" : "Disarmed"}</Text>
      </Card>
      <Row label="Armed" c={c}><Sw v={!!d.state.armed} on={(v) => send({ armed: v })} c={c} /></Row>
    </View>
  );
}

function AgriStarter({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const power = !!d.state.power_available;
  return (
    <View>
      <Row label="Pump" c={c}><Sw v={!!d.state.pump} on={(v) => send({ pump: v })} c={c} /></Row>
      <Card padded style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ color: c.textDim }}>Mains power</Text>
          <Text style={{ color: power ? c.green : c.red, fontWeight: "700" }}>{power ? "Available" : "Unavailable"}</Text>
        </View>
      </Card>
      {!power && <Alertline c={c} text="⚠ No mains power — pump cannot start" />}
    </View>
  );
}

const TANK_W = 84;
const TANK_H = 168;
// One seamless sine period sampled into an SVG path, drawn twice-wide so a
// horizontal translate of one tank-width loops without a seam.
function wavePath(width: number, amp: number): string {
  const samples = 28;
  let d = `M 0 ${amp}`;
  for (let i = 1; i <= samples; i++) {
    const x = (i / samples) * width;
    const y = amp - Math.sin((i / samples) * Math.PI * 4) * amp; // 2 periods across 2×tank
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${width} ${amp * 2 + TANK_H} L 0 ${amp * 2 + TANK_H} Z`;
  return d;
}

// A floating, animated liquid tank: the level eases to its target and the
// surface flows with two offset waves for a lively "floating" feel.
function WaveTank({ label, pct, litres, c, accent, fault }: { label: string; pct: number; litres: number; c: Palette; accent: string; fault?: boolean }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const level = useRef(new Animated.Value(clamped)).current;
  const flow1 = useRef(new Animated.Value(0)).current;
  const flow2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(level, { toValue: clamped, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [clamped, level]);

  useEffect(() => {
    const mk = (v: Animated.Value, dur: number) => Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));
    const a = mk(flow1, 2600); const b = mk(flow2, 4200);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [flow1, flow2]);

  const waterHeight = level.interpolate({ inputRange: [0, 100], outputRange: [0, TANK_H] });
  const tx1 = flow1.interpolate({ inputRange: [0, 1], outputRange: [0, -TANK_W] });
  const tx2 = flow2.interpolate({ inputRange: [0, 1], outputRange: [-TANK_W, 0] });
  const amp = 6;
  const path = wavePath(TANK_W * 2, amp);

  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ height: TANK_H, width: TANK_W, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: "hidden", justifyContent: "flex-end" }}>
        {/* grid ticks */}
        {[25, 50, 75].map((t) => (
          <View key={t} style={{ position: "absolute", left: 0, right: 0, bottom: `${t}%`, height: 1, backgroundColor: c.border, opacity: 0.5 }} />
        ))}
        {/* water body */}
        <Animated.View style={{ height: waterHeight, width: "100%" }}>
          {/* back wave */}
          <Animated.View style={{ position: "absolute", top: -amp, left: 0, width: TANK_W * 2, transform: [{ translateX: tx2 }] }}>
            <Svg width={TANK_W * 2} height={TANK_H + amp * 2}><Path d={path} fill={accent} opacity={0.45} /></Svg>
          </Animated.View>
          {/* front wave */}
          <Animated.View style={{ position: "absolute", top: -amp, left: 0, width: TANK_W * 2, transform: [{ translateX: tx1 }] }}>
            <Svg width={TANK_W * 2} height={TANK_H + amp * 2}><Path d={path} fill={accent} opacity={0.9} /></Svg>
          </Animated.View>
        </Animated.View>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>{clamped}%</Text>
        </View>
      </View>
      <Text style={{ color: c.text, fontWeight: "700", marginTop: 8 }}>{label}</Text>
      <Text style={{ color: c.faint, fontSize: 12 }}>{litres.toLocaleString("en-IN")} L{fault ? " · sensor?" : ""}</Text>
    </View>
  );
}

function TankBar({ label, pct, litres, c, accent, fault }: { label: string; pct: number; litres: number; c: Palette; accent: string; fault?: boolean }) {
  return <WaveTank label={label} pct={pct} litres={litres} c={c} accent={accent} fault={fault} />;
}

function WaterTank({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const oh = Number(d.state.ohPct ?? 0);
  const sump = Number(d.state.sumpPct ?? 0);
  const auto = !!d.state.auto;
  const start = Number(d.state.startPct ?? 20);
  const stop = Number(d.state.stopPct ?? 95);
  const sumpMin = Number(d.state.sumpMinPct ?? 15);
  return (
    <View>
      <Card padded style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <TankBar label="Overhead" pct={oh} litres={Number(d.state.ohLitres ?? 0)} c={c} accent={c.cyan} fault={!!d.state.ohFault} />
          <View style={{ alignItems: "center", paddingBottom: 34 }}>
            <Text style={{ color: !!d.state.pump ? c.cyan : c.faint, fontWeight: "800", fontSize: 11 }}>{!!d.state.pump ? "▲ PUMP" : "IDLE"}</Text>
            <View style={{ width: 2, height: 40, backgroundColor: c.border, marginVertical: 4 }} />
            <Text style={{ fontSize: 18 }}>💧</Text>
          </View>
          <TankBar label="Sump" pct={sump} litres={Number(d.state.sumpLitres ?? 0)} c={c} accent={c.accentHi} fault={!!d.state.sumpFault} />
        </View>
      </Card>
      {!!d.state.dryRun && <Alertline c={c} text="⚠ Dry-run cut — reset after checking sump/motor" />}
      {!!d.state.overflow && <Alertline c={c} text="⚠ Overflow float tripped — pump stopped" />}
      <Row label="Auto-fill" c={c}><Sw v={auto} on={(v) => send({ auto: v })} c={c} /></Row>
      <Row label="Pump" c={c}><Sw v={!!d.state.pump} on={(v) => send({ pump: v })} c={c} /></Row>
      {!!d.state.dryRun && (
        <Pressable onPress={() => send({ action: "resetDryRun" })} style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 10 }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>Reset dry-run trip</Text>
        </Pressable>
      )}
      <Section c={c}>Auto thresholds</Section>
      <Stepper label={`Start overhead at ${start}%`} c={c} onDown={() => send({ startPct: Math.max(5, start - 5) })} onUp={() => send({ startPct: Math.min(90, start + 5) })} />
      <Stepper label={`Stop overhead at ${stop}%`} c={c} onDown={() => send({ stopPct: Math.max(10, stop - 5) })} onUp={() => send({ stopPct: Math.min(100, stop + 5) })} />
      <Stepper label={`Protect sump below ${sumpMin}%`} c={c} onDown={() => send({ sumpMinPct: Math.max(5, sumpMin - 5) })} onUp={() => send({ sumpMinPct: Math.min(60, sumpMin + 5) })} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <MiniStat label="Pump current" value={`${Number(d.state.amps ?? 0).toFixed(1)} A`} c={c} />
        <MiniStat label="Mode" value={auto ? "Auto" : "Manual"} c={c} />
      </View>
    </View>
  );
}

function RfidGate({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const open = String(d.state.barrier ?? "closed") === "open";
  const allowed = !!d.state.lastAllowed;
  return (
    <View>
      <Card padded style={{ marginBottom: 12, alignItems: "center" }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: open ? c.green : c.textDim }}>{open ? "BARRIER OPEN" : "BARRIER CLOSED"}</Text>
        <Text style={{ color: c.faint, marginTop: 6, fontSize: 13 }}>{!!d.state.vehiclePresent ? "🚗 Vehicle at gate" : "No vehicle"} · {Number(d.state.tagCount ?? 0)} tags</Text>
      </Card>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Pressable onPress={() => send({ action: "open" })} style={{ flex: 1, backgroundColor: c.green, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}><Text style={{ color: "#04121a", fontWeight: "800" }}>Open</Text></Pressable>
        <Pressable onPress={() => send({ action: "close" })} style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}><Text style={{ color: c.text, fontWeight: "800" }}>Close</Text></Pressable>
      </View>
      <Card padded style={{ marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ color: c.text, fontWeight: "700", fontFamily: "monospace" }}>Tag {Number(d.state.lastTag ?? 0) || "—"}</Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>{Number(d.state.scanCount ?? 0)} scans</Text>
        </View>
        <Text style={{ color: allowed ? c.green : c.red, fontWeight: "800", fontSize: 12 }}>{allowed ? "AUTHORISED" : "DENIED"}</Text>
      </Card>
      <Row label="Auto mode" c={c}><Sw v={String(d.state.mode ?? "auto") === "auto"} on={(v) => send({ mode: v ? "auto" : "manual" })} c={c} /></Row>
    </View>
  );
}

function FaceDoor({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const locked = !!d.state.locked;
  const als = Number(d.state.autoLockSec ?? 8);
  return (
    <View>
      <Card padded style={{ marginBottom: 12, alignItems: "center" }}>
        <Text style={{ fontSize: 40 }}>{locked ? "🔒" : "🔓"}</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: locked ? c.textDim : c.green, marginTop: 6 }}>{locked ? "LOCKED" : "UNLOCKED"}</Text>
        <Text style={{ color: c.faint, marginTop: 4, fontSize: 13 }}>{String(d.state.lastMethod ?? "—")}{d.state.lastName ? ` · ${String(d.state.lastName)}` : ""}</Text>
      </Card>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Pressable onPress={() => send({ action: "unlock", method: "app" })} style={{ flex: 1, backgroundColor: c.green, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}><Text style={{ color: "#04121a", fontWeight: "800" }}>Unlock</Text></Pressable>
        <Pressable onPress={() => send({ action: "lock" })} style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}><Text style={{ color: c.text, fontWeight: "800" }}>Lock</Text></Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <MiniStat label="Accesses" value={String(Number(d.state.accessCount ?? 0))} c={c} />
        <MiniStat label="Bell presses" value={String(Number(d.state.bellCount ?? 0))} c={c} />
      </View>
      <Stepper label={`Auto-relock ${als}s`} c={c} onDown={() => send({ autoLockSec: Math.max(0, als - 1) })} onUp={() => send({ autoLockSec: Math.min(120, als + 1) })} />
    </View>
  );
}

function TouchBoard({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const bl = Number(d.state.backlight ?? 60);
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <MiniStat label="Power" value={`${Number(d.state.watts ?? 0).toFixed(0)} W`} c={c} />
        <MiniStat label="Voltage" value={`${Number(d.state.volts ?? 0).toFixed(0)} V`} c={c} />
        <MiniStat label="Current" value={`${Number(d.state.amps ?? 0).toFixed(2)} A`} c={c} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <MiniStat label="Power factor" value={Number(d.state.pf ?? 0).toFixed(2)} c={c} />
        <MiniStat label="Energy" value={`${Number(d.state.kwh ?? 0).toFixed(2)} kWh`} c={c} />
      </View>
      <SwitchGangs d={d} send={send} c={c} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 2, marginBottom: 6 }}>
        <Pressable onPress={() => send({ all: true })} style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: c.text, fontWeight: "700" }}>All on</Text></Pressable>
        <Pressable onPress={() => send({ all: false })} style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: c.text, fontWeight: "700" }}>All off</Text></Pressable>
      </View>
      <Stepper label={`Backlight ${bl}%`} c={c} onDown={() => send({ backlight: Math.max(0, bl - 10) })} onUp={() => send({ backlight: Math.min(100, bl + 10) })} />
    </View>
  );
}

function MiniStat({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <Card padded style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: c.faint, fontSize: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</Text>
    </Card>
  );
}
function Alertline({ text, c }: { text: string; c: Palette }) {
  return <Text style={{ color: c.amber, backgroundColor: "rgba(245,158,11,0.12)", padding: 10, borderRadius: 10, marginBottom: 10 }}>{text}</Text>;
}
function Stepper({ label, onUp, onDown, c }: { label: string; onUp: () => void; onDown: () => void; c: Palette }) {
  return (
    <Row label={label} c={c}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={onDown} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.text, fontSize: 22 }}>−</Text></Pressable>
        <Pressable onPress={onUp} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.text, fontSize: 22 }}>+</Text></Pressable>
      </View>
    </Row>
  );
}

const s = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  heroPill: { width: 56, height: 56, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
