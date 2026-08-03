import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, Switch, StyleSheet, ScrollView, Alert, Animated, Easing, TextInput, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { api, Device } from "../api";
import { useDevices, capabilities } from "../store";
import { Screen, Card, useTheme, ArcGauge, PillSelector, PillToggle, SectionLabel } from "../ui";
import { tapLight, toggleFeedback } from "../haptics";
import { deviceMeta, type Palette } from "../theme";
import { useSwitchWidgets } from "../widgets";
import { useCameraFrames } from "../live";
import { isCameraDevice as isCamera } from "../cameras";
import { Icon, type IconName } from "../icons";

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
          <LinearGradient colors={meta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroPill}><Icon name={meta.icon} size={28} color="#fff" /></LinearGradient>
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
        {d.type === "sentinel" && <Sentinel d={d} send={send} c={c} />}
        {isCamera(d) && <CameraDevice d={d} send={send} c={c} />}

        {/* Generic capability controls (appear for dimmable / fan / climate / colour devices) */}
        <GenericControls d={d} send={send} c={c} />

        {!KNOWN.includes(d.type) && !isCamera(d) && !cap.power && !cap.dimmer && !cap.fan && !cap.thermostat && (
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

const KNOWN = ["aquaguard", "home-hub", "smart-plug", "smart-switch", "energy-monitor", "guardian", "motion-sensor", "agri-starter", "watertank", "rfid-gate", "facedoor", "touchboard", "sentinel"];

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
  return <Text style={{ color: c.text, fontSize: 19, fontWeight: "700", letterSpacing: -0.3, marginTop: 20, marginBottom: 10 }}>{children}</Text>;
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
  return (
    <Switch
      value={v}
      onValueChange={(b) => { toggleFeedback(b); on(b); }}
      trackColor={{ true: c.accent, false: "#334155" }}
      thumbColor="#fff"
    />
  );
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
            onSlidingComplete={(v) => { tapLight(); send({ [cap.dimmer!.field]: Math.round(v) }); }}
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

/** How the firmware describes what last moved a relay. */
const SENTINEL_SOURCE: Record<string, string> = {
  touch: "Touch panel",
  cloud: "App",
  schedule: "Schedule",
  "gas-alarm": "Gas alarm",
  "auto-off": "Auto-off timer",
  restore: "Power restored",
  "away-mode": "Away mode",
};

/**
 * Sentinel — gas + climate safety panel with relays.
 *
 * Gas is shown the way the device reports it: raw counts and a percentage
 * relative to its own clean-air baseline. An MQ-2 cannot produce a calibrated
 * ppm without a per-gas curve, a known load resistance and temperature
 * compensation, so a number labelled "ppm" here would be invented. Every
 * control below maps to a command the firmware implements.
 */
function Sentinel({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const st = d.state as Record<string, unknown>;
  const bool = (k: string) => st[k] === true;
  const num = (k: string, dflt: number) => (typeof st[k] === "number" ? (st[k] as number) : dflt);

  const hasGas = bool("hasGas");
  const hasCamera = bool("hasCamera");
  const alarm = bool("gasAlarm");
  const warming = bool("gasWarmingUp");
  const gasReady = bool("gasReady");
  const climateOk = bool("climateOk");
  const relays = Math.max(1, Math.min(32, num("relays", 4)));
  const exhaust = num("exhaustRelay", -1);
  const cutMask = num("safetyCutMask", 0);
  const src = typeof st.lastSource === "string" ? (st.lastSource as string) : "";

  const confirmTest = () =>
    Alert.alert("Test the siren?", "The buzzer sounds three times, even if the panel is muted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sound it", onPress: () => { tapLight(); send({ action: "test" }); } },
    ]);

  // Calibration is destructive in a way that is not obvious: it makes the
  // current air the new "normal". Doing it near a leak trains the sensor to
  // ignore that leak, so the warning matters more than the convenience.
  const confirmCalibrate = () =>
    Alert.alert(
      "Calibrate in clean air",
      "Only calibrate when the room is well ventilated. Whatever the sensor smells right now becomes its idea of normal.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Calibrate", style: "destructive", onPress: () => { tapLight(); send({ action: "calibrateGas" }); } },
      ]
    );

  return (
    <View>
      {alarm && (
        <Card padded style={{ marginBottom: 12, borderColor: c.red, borderWidth: 1, alignItems: "center" }}>
          <Icon name="alert" size={26} color={c.red} />
          <Text style={{ color: c.red, fontSize: 18, fontWeight: "800", marginTop: 6 }}>GAS DETECTED</Text>
          <Text style={{ color: c.textDim, fontSize: 13, marginTop: 6, textAlign: "center" }}>
            Ventilate the room and check for a leak before clearing. The alarm stays on until someone dismisses it.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => { tapLight(); send({ muted: true }); }}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}
            >
              <Text style={{ color: c.text, fontWeight: "700" }}>Silence 5 min</Text>
            </Pressable>
            <Pressable
              onPress={() => { tapLight(); send({ action: "clearAlarm" }); }}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.red }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Clear alarm</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {hasGas && warming && (
        <Alertline text="Gas sensor is warming up. Readings are unreliable for the first 90 seconds after power-on, so the alarm is held off until then." c={c} />
      )}

      {climateOk ? (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          <MiniStat label="Temperature" value={`${num("temp", 0).toFixed(1)}°`} c={c} />
          <MiniStat label="Humidity" value={`${num("humidity", 0).toFixed(0)}%`} c={c} />
          <MiniStat label="Feels like" value={`${num("heatIndex", 0).toFixed(1)}°`} c={c} />
        </View>
      ) : (
        <Alertline text="No climate reading yet — the temperature and humidity sensor has not reported." c={c} />
      )}

      {hasGas && (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          <MiniStat label="Gas level" value={gasReady ? `${num("gasPct", 0).toFixed(0)}%` : "—"} c={c} />
          <MiniStat label="Raw" value={gasReady ? String(num("gasRaw", 0)) : "—"} c={c} />
          <MiniStat label="Baseline" value={num("gasBaseline", 0) > 0 ? String(num("gasBaseline", 0)) : "Not set"} c={c} />
        </View>
      )}

      {bool("motion") && <Alertline text="Motion detected." c={c} />}

      <SwitchGangs d={d} send={send} c={c} />

      <View style={{ flexDirection: "row", gap: 10, marginTop: 2, marginBottom: 6 }}>
        <Pressable onPress={() => { tapLight(); send({ all: true }); }} style={{ flex: 1, minHeight: 44, justifyContent: "center", backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>All on</Text>
        </Pressable>
        <Pressable onPress={() => { tapLight(); send({ all: false }); }} style={{ flex: 1, minHeight: 44, justifyContent: "center", backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>All off</Text>
        </Pressable>
      </View>

      {!!src && (
        <Text style={{ color: c.faint, fontSize: 12, marginBottom: 12 }}>
          Last change by {SENTINEL_SOURCE[src] ?? src}
        </Text>
      )}

      <Section c={c}>Modes</Section>
      <Row label="Away mode" c={c}><Sw v={bool("away")} on={(v) => send({ away: v })} c={c} /></Row>
      <Row label="Buzzer muted" c={c}><Sw v={bool("muted")} on={(v) => send({ muted: v })} c={c} /></Row>
      <Text style={{ color: c.faint, fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        Muting expires by itself after five minutes. Turning everything off is what Away does — it does not disable the gas alarm.
      </Text>

      {hasGas && relays > 0 && (
        <>
          <Section c={c}>On gas alarm</Section>
          <Text style={{ color: c.faint, fontSize: 12, marginBottom: 10 }}>
            Choose which appliances are cut when gas is detected, and which relay drives an exhaust fan.
          </Text>
          {Array.from({ length: relays }, (_, i) => (
            <Row key={`cut${i}`} label={`Cut relay ${i + 1}`} c={c}>
              <Sw
                v={(cutMask & (1 << i)) !== 0}
                on={(v) => send({ safetyCutMask: v ? cutMask | (1 << i) : cutMask & ~(1 << i) })}
                c={c}
              />
            </Row>
          ))}
          <Card padded style={{ marginBottom: 10 }}>
            <Text style={{ color: c.text, fontSize: 16, marginBottom: 10 }}>Exhaust fan relay</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {[-1, ...Array.from({ length: relays }, (_, i) => i)].map((r) => {
                const sel = exhaust === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => { tapLight(); send({ exhaustRelay: r }); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    style={{ minHeight: 44, minWidth: 64, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, borderRadius: 10, backgroundColor: sel ? c.accent : c.card, borderWidth: sel ? 0 : 1, borderColor: c.border }}
                  >
                    <Text style={{ color: sel ? "#04121a" : c.textDim, fontWeight: sel ? "800" : "600" }}>{r < 0 ? "None" : `Relay ${r + 1}`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </>
      )}

      {hasCamera && (
        <>
          <Section c={c}>Camera</Section>
          <Row label="Live stream" c={c}><Sw v={bool("streaming")} on={(v) => send({ streaming: v })} c={c} /></Row>
          <Pressable
            onPress={() => { tapLight(); send({ action: "snapshot" }); }}
            disabled={!bool("cameraReady")}
            style={{ minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, opacity: bool("cameraReady") ? 1 : 0.5, marginBottom: 10 }}
          >
            <Text style={{ color: c.text, fontWeight: "700" }}>Take snapshot</Text>
          </Pressable>
          {!bool("cameraReady") && <Alertline text="Camera did not initialise. Power-cycle the device; if it persists the module may be unseated." c={c} />}
        </>
      )}

      <Section c={c}>Maintenance</Section>
      <Pressable onPress={confirmTest} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>Test siren</Text>
      </Pressable>
      {hasGas && (
        <Pressable onPress={confirmCalibrate} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>Calibrate gas sensor</Text>
        </Pressable>
      )}
      <Pressable onPress={() => { tapLight(); send({ action: "recalibrateTouch" }); }} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>Recalibrate touch pads</Text>
      </Pressable>
      {num("lastTest", 0) > 0 && (
        <Text style={{ color: c.faint, fontSize: 12, marginBottom: 6 }}>Siren last tested {Math.round(num("lastTest", 0) / 3600)} h into this uptime.</Text>
      )}
    </View>
  );
}

/** The firmware clamps to 15fps; offering more would just look broken. */
const CAM_FPS = [1, 5, 8, 10, 15] as const;
/** Anything above VGA needs PSRAM for the frame buffer. */
const CAM_RES_BASE = ["QQVGA", "QVGA", "CIF", "VGA"] as const;
const CAM_RES_PSRAM = ["SVGA", "XGA", "SXGA", "UXGA"] as const;
/** The device stops streaming unless it hears from us inside its 20s window. */
const CAM_REARM_MS = 8000;
/** Frames older than this mean a "streaming" camera has actually stalled. */
const CAM_STALL_MS = 6000;

function CameraDevice({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const st = d.state as Record<string, unknown>;
  const n = (k: string, dflt: number) => (typeof st[k] === "number" ? (st[k] as number) : dflt);
  const bool = (k: string) => st[k] === true;

  const ready = st.ready == null ? true : bool("ready");
  const psram = bool("psram");
  const fps = n("fps", 8);
  const quality = n("quality", 12);
  const rotation = n("rotation", 0);
  const flash = n("flash", 0);
  const sensitivity = n("sensitivity", 45);
  const resolution = typeof st.resolution === "string" ? (st.resolution as string) : "VGA";

  const [live, setLive] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [measured, setMeasured] = useState(0);
  const stamps = useRef<number[]>([]);

  // Watch whenever the device is online rather than only while streaming: a
  // snapshot is published on the same frame topic, so a viewer that subscribed
  // only during a live stream would never receive one.
  useCameraFrames(d.online ? d.id : null, (f) => {
    const t = Date.now();
    stamps.current = [...stamps.current, t].filter((x) => t - x <= 3000);
    setMeasured(stamps.current.length / 3);
    setUri(`data:image/jpeg;base64,${f.jpeg}`);
    setLastAt(t);
  });

  // Streaming is a lease. Keep renewing it while the view is open and drop it
  // on the way out, so a backgrounded app never leaves a board streaming.
  useEffect(() => {
    if (!live || !d.online) return;
    const id = d.id;
    const arm = () => { void api.command(id, { action: "stream", on: true, fps }); };
    arm();
    const t = setInterval(arm, CAM_REARM_MS);
    return () => {
      clearInterval(t);
      void api.command(id, { action: "stream", on: false });
    };
  }, [live, d.online, d.id, fps]);

  // A clock, so "stalled" is real state that re-renders rather than a value
  // read during render that would never update on its own.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => { if (!d.online) setLive(false); }, [d.online]);

  const stalled = live && (lastAt === 0 || now - lastAt > CAM_STALL_MS);
  const showingLive = live && !stalled && !!uri;
  const resOptions = psram ? [...CAM_RES_BASE, ...CAM_RES_PSRAM] : [...CAM_RES_BASE];

  const act = useCallback((cmd: Record<string, unknown>) => { void api.command(d.id, cmd); }, [d.id]);

  const reboot = () => {
    Alert.alert("Reboot camera", "The camera will be offline for about 15 seconds.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reboot", style: "destructive", onPress: () => { tapLight(); act({ action: "reboot" }); } },
    ]);
  };

  return (
    <View>
      <View style={s.camStage}>
        {uri ? (
          <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" fadeDuration={0} />
        ) : (
          <View style={{ alignItems: "center", gap: 10 }}>
            {live ? <ActivityIndicator color={c.accentHi} /> : <Icon name="camera" size={30} color={c.faint} />}
            <Text style={{ color: c.faint, fontSize: 13 }}>
              {!d.online ? "Camera is offline" : live ? "Waiting for the first frame…" : "Live view is off"}
            </Text>
          </View>
        )}

        <View style={s.camBadge}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: showingLive ? c.green : stalled ? c.amber : c.faint }} />
          <Text style={{ color: showingLive ? c.green : stalled ? c.amber : c.faint, fontSize: 11, fontWeight: "800" }}>
            {showingLive ? "LIVE" : stalled ? "STALLED" : uri ? "STILL" : "IDLE"}
          </Text>
        </View>

        {bool("motionActive") && (
          <View style={[s.camBadge, { right: undefined, left: 10 }]}>
            <Icon name="motion" size={13} color={c.amber} />
            <Text style={{ color: c.amber, fontSize: 11, fontWeight: "800" }}>MOTION</Text>
          </View>
        )}

        {showingLive && (
          <View style={[s.camBadge, { top: undefined, bottom: 10 }]}>
            <Text style={{ color: c.text, fontSize: 11, fontWeight: "700" }}>{measured.toFixed(1)} fps</Text>
          </View>
        )}
      </View>

      {!ready && d.online && (
        <Alertline c={c} text="The camera sensor is not responding. Check the ribbon cable seating, then reboot." />
      )}
      {ready && stalled && (
        <Alertline c={c} text="Live view is on but no frames are arriving. Check the camera's signal, then try Reboot." />
      )}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
        <CamAction c={c} icon={live ? "pause" : "play"} label={live ? "Stop" : "Live view"} primary={!live}
          disabled={!d.online || !ready}
          onPress={() => { tapLight(); setLive((v) => !v); }} />
        <CamAction c={c} icon="camera" label="Snapshot"
          disabled={!d.online || !ready}
          onPress={() => { tapLight(); act({ action: "snapshot" }); }} />
        <CamAction c={c} icon="refresh" label="Reboot" disabled={!d.online} onPress={reboot} />
      </View>

      <SectionLabel>Image</SectionLabel>
      <Row label="Resolution" c={c}>
        <PillSelector options={resOptions} value={resolution} onChange={(v) => send({ resolution: v })} />
      </Row>
      {!psram && (
        <Text style={{ color: c.faint, fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          Higher resolutions need PSRAM, which this board does not report.
        </Text>
      )}
      <Stepper label={`Quality ${quality} (lower is sharper)`} c={c}
        onDown={() => send({ quality: Math.max(4, quality - 2) })}
        onUp={() => send({ quality: Math.min(63, quality + 2) })} />
      <Row label="Frame rate" c={c}>
        <PillSelector options={CAM_FPS.map(String)} value={String(fps)} onChange={(v) => send({ fps: Number(v) })} />
      </Row>
      <Row label="Rotate 180°" c={c}>
        <PillToggle value={rotation === 180} onChange={(v) => { toggleFeedback(v); send({ rotation: v ? 180 : 0 }); }} />
      </Row>

      <SectionLabel>Illumination</SectionLabel>
      <Stepper label={`Flash ${flash}%`} c={c}
        onDown={() => send({ flash: Math.max(0, flash - 10) })}
        onUp={() => send({ flash: Math.min(100, flash + 10) })} />

      <SectionLabel>Motion detection</SectionLabel>
      <Row label="Enabled" c={c}>
        <PillToggle value={bool("motion")} onChange={(v) => { toggleFeedback(v); send({ motion: v }); }} />
      </Row>
      {bool("motion") && (
        <Stepper label={`Sensitivity ${sensitivity}`} c={c}
          onDown={() => send({ sensitivity: Math.max(1, sensitivity - 5) })}
          onUp={() => send({ sensitivity: Math.min(100, sensitivity + 5) })} />
      )}

      <SectionLabel>Health</SectionLabel>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <MiniStat label="Frames" value={String(n("frames", 0))} c={c} />
        <MiniStat label="Dropped" value={String(n("dropped", 0))} c={c} />
        <MiniStat label="Snapshots" value={String(n("snapshots", 0))} c={c} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <MiniStat label="Motion" value={String(n("motionCount", 0))} c={c} />
        <MiniStat label="PSRAM" value={psram ? "Yes" : "No"} c={c} />
        <MiniStat label="Sensor" value={ready ? "Ready" : "Fault"} c={c} />
      </View>
    </View>
  );
}

function CamAction({ c, icon, label, onPress, primary, disabled }: {
  c: Palette; icon: IconName; label: string; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flex: 1, minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 4,
        paddingVertical: 8,
        backgroundColor: primary && !disabled ? c.accentHi : c.card,
        borderWidth: 1, borderColor: primary && !disabled ? c.accentHi : c.border,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon name={icon} size={18} color={primary && !disabled ? "#fff" : c.text} />
      <Text style={{ color: primary && !disabled ? "#fff" : c.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function MiniStat({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <Card padded style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: c.faint, fontSize: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</Text>
    </Card>
  );
}function Alertline({ text, c }: { text: string; c: Palette }) {
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
  camStage: {
    aspectRatio: 4 / 3, backgroundColor: "#000", borderRadius: 16, overflow: "hidden",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  camBadge: {
    position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
});
