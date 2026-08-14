import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, Switch, StyleSheet, ScrollView, Alert, Animated, Easing, TextInput, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { api, Device } from "../api";
import { readOtaStatus, otaNotice, isUpdating, describeCameraFault } from "../camera-status";
import { useDevices, capabilities, capabilitiesFor } from "../store";
import { Screen, Card, useTheme, ArcGauge, PillSelector, PillToggle, SectionLabel, BackButton, HeaderAction, useSpin, useGlowPulse, GlowTile, PresetRow, NeoRaised, ColorGrid } from "../ui";
import { useThrottled } from "../throttle";
import { readTankLink, tankLevelText, formatAge, type TankDeviceState } from "../tank-link";
import { PowerDial, SlideToConfirm } from "../controls";
import { tapLight, toggleFeedback } from "../haptics";
import { FAN_PRESETS, fanCommand, fanHint, fanLevel } from "../fan";
import { deviceMeta, type Palette, TAP_SLOP } from "../theme";
import { elevate } from "../theme";
import { useSwitchWidgets, CHANNEL_KINDS, channelKind, defaultLabelFor, type Gang } from "../widgets";
import { NEO_SMALL } from "../neo";
import { useCameraFrames } from "../live";
import { isCameraDevice as isCamera } from "../cameras";
import { Icon, type IconName } from "../icons";
import { usePrompt } from "../overlays";



export default function Control({ device, onBack }: { device: Device; onBack: () => void }) {
  const { c } = useTheme();
  const { byId, command, patch } = useDevices();
  const d = byId(device.id) ?? device;

  const send = (params: Record<string, unknown>) => command(d.id, { action: "set", ...params });

  /*
   * Renaming used to call `Alert.prompt?.(...)`.
   *
   * Alert.prompt is iOS-only. The optional call meant that on Android the
   * expression evaluated to undefined and nothing happened at all — no dialog,
   * no error, no log line. Every Android user who tried to rename a device got
   * silence, and the `?.` is exactly why nobody noticed: it turned a crash
   * into a no-op.
   */
  const { prompt, promptNode } = usePrompt();

  const rename = async () => {
    const next = await prompt({
      title: "Rename device",
      message: "This is the name you will see everywhere, including in scenes and automations.",
      placeholder: "Living room lamp",
      initialValue: d.name || "",
      maxLength: 40,
      validate: (v) => (v.trim().length === 0 ? "Give the device a name." : null),
    });
    if (next && next.trim()) patch(d.id, { name: next.trim() });
  };

  const meta = deviceMeta(d.type);
  const cap = capabilitiesFor(d);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 52, paddingBottom: 40 }}>
        <View style={s.topBar}>
          <BackButton onPress={onBack} label="Devices" />
          <View style={{ flexDirection: "row", gap: 4 }}>
            <HeaderAction
              icon={d.favorite ? "star" : "starOff"}
              onPress={() => patch(d.id, { favorite: !d.favorite })}
              accessibilityLabel={d.favorite ? "Remove from favourites" : "Add to favourites"}
              tint={d.favorite ? c.amber : undefined}
              selected={!!d.favorite}
            />
            <HeaderAction icon="edit" onPress={rename} accessibilityLabel="Rename device" />
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
        {d.type === "meter" && <EnergyMeter d={d} c={c} />}
        {d.type === "guardian" && <Guardian d={d} send={send} c={c} />}
        {d.type === "motion-sensor" && <MotionSensor d={d} send={send} c={c} />}
        {d.type === "agri-starter" && <AgriStarter d={d} send={send} c={c} />}
        {d.type === "watertank" && <WaterTank d={d} send={send} c={c} />}
        {d.type === "rfid-gate" && <RfidGate d={d} send={send} c={c} />}
        {d.type === "facedoor" && <FaceDoor d={d} send={send} c={c} />}
        {d.type === "touchboard" && <TouchBoard d={d} send={send} c={c} />}
        {d.type === "sentinel" && <Sentinel d={d} send={send} c={c} />}
        {d.type === "anpr-cam" && <AnprCamera d={d} send={send} command={command} c={c} />}
        {(d.type === "drone-link" || d.type === "drone-x1") && <DroneLink d={d} send={send} c={c} />}
        {isCamera(d) && <CameraDevice d={d} send={send} c={c} />}

        {/* Generic capability controls (appear for dimmable / fan / climate / colour devices) */}
        <GenericControls d={d} send={send} c={c} />

        {!KNOWN.includes(d.type) && !isCamera(d) && !cap.power && !cap.dimmer && !cap.fan && !cap.thermostat && (
          <Card padded>
            <Text style={{ color: c.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Raw state</Text>
            <Text style={{ color: c.faint, fontFamily: "monospace", fontSize: 12 }}>{JSON.stringify(d.state, null, 2)}</Text>
          </Card>
        )}

        {/*
          "Change Wi-Fi" used to sit here, at the bottom of every device.

          It is setup, not control: you touch it when the router changes, and
          never otherwise, yet it was the last thing under the switch you use
          daily. It now lives once in Settings › Device setup, which also makes
          the fleet-wide question — which devices still point at the old
          network — answerable in one place.
        */}
      </ScrollView>
      {promptNode}
    </Screen>
  );
}

/**
 * Types that have a real control panel above.
 *
 * A type missing from this array falls through to the raw-JSON card even when
 * a control component was written for it, because the card's condition is
 * driven by this list rather than by which components rendered. That is
 * precisely how the camera shipped showing JSON on the phone, and it is why
 * adding to this array is on the checklist in Docs/07-adding-a-new-device.md.
 */
const KNOWN = ["aquaguard", "home-hub", "smart-plug", "smart-switch", "energy-monitor", "meter", "guardian", "motion-sensor", "agri-starter", "watertank", "rfid-gate", "facedoor", "touchboard", "sentinel", "anpr-cam", "drone-link", "drone-x1"];

// ------------------------------------------------------------ shared bits ---

function Row({ label, c, children, stack }: { label: string; c: Palette; children: React.ReactNode; stack?: boolean }) {
  /*
   * `stack` puts the label above the control instead of beside it.
   *
   * A label and a control sharing a row works while the control is narrow. The
   * resolution and frame-rate selectors are as wide as the card, so sharing
   * left the label overlapping the first option. Anything that scrolls
   * horizontally needs the full width.
   */
  return (
    <Card padded style={{ marginBottom: 10 }}>
      {stack ? (
        <View>
          <Text style={{ color: c.text, fontSize: 16, marginBottom: 10 }}>{label}</Text>
          {children}
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: c.text, fontSize: 16 }}>{label}</Text>
          {children}
        </View>
      )}
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
      trackColor={{ true: c.accent, false: c.borderHi }}
      thumbColor="#fff"
    />
  );
}

function GenericControls({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  const cap = capabilitiesFor(d);
  /*
   * Declared above the early return below — this is a hook, and a hook after a
   * conditional return is a hook that runs on some renders and not others,
   * which React fails on outright.
   */
  const sendLive = useThrottled<Record<string, unknown>>(send, 100);
  const showPower = !!cap.power && !KNOWN.includes(d.type);
  if (!showPower && !cap.dimmer && !cap.fan && !cap.color && !cap.thermostat) return null;
  return (
    <View>
      {showPower && cap.power && (
        <Card padded style={{ marginBottom: 10, alignItems: "center" }}>
          {/*
            A dial rather than a switch.

            The switch said only on or off, so a lamp at 5% and the same lamp
            at full looked identical here. The ring carries the level, the fill
            carries on/off, and the word stays because a ring is not a
            substitute for a word somebody may be relying on.
          */}
          <PowerDial
            on={!!d.state[cap.power.field]}
            onToggle={() => { tapLight(); send({ [cap.power!.field]: !d.state[cap.power!.field] }); }}
            level={cap.dimmer ? Number(d.state[cap.dimmer.field] ?? 0) : cap.fan ? fanLevel(d, cap.fan) : null}
            label={cap.power.label}
            c={c}
          />
        </Card>
      )}
      {cap.dimmer && (
        <Card padded style={{ marginBottom: 10, alignItems: "center" }}>
          {/* The dial is the primary control — it is the one thing on this
              screen people came to change, and a 240pt target beats a 4pt
              slider track. The slider stays underneath for fine adjustment. */}
          <ArcGauge
            value={Number(d.state[cap.dimmer.field] ?? 0)}
            min={cap.dimmer.min}
            max={cap.dimmer.max}
            unit="%"
            caption={cap.dimmer.label}
            size={230}
            onChange={(v) => send({ [cap.dimmer!.field]: Math.round(v) })}
          />
          <View style={{ width: "100%", marginTop: 14 }}>
            <PresetRow
              values={[25, 50, 75, 100]}
              current={Number(d.state[cap.dimmer.field] ?? 0)}
              onPick={(v) => send({ [cap.dimmer!.field]: v })}
              accent={c.accent}
            />
          </View>
          <Slider
            style={{ width: "100%", marginTop: 6 }}
            minimumValue={cap.dimmer.min} maximumValue={cap.dimmer.max} step={1}
            value={Number(d.state[cap.dimmer.field] ?? 0)}
            /* Live while dragging, throttled, so the lamp fades with the thumb
               instead of jumping when you let go. */
            onValueChange={(v) => sendLive({ [cap.dimmer!.field]: Math.round(v) })}
            onSlidingComplete={(v) => { tapLight(); send({ [cap.dimmer!.field]: Math.round(v) }); }}
            minimumTrackTintColor={c.accent} maximumTrackTintColor={c.border} thumbTintColor={c.accentHi}
          />
        </Card>
      )}
      {cap.fan && (
        <Card padded style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: c.text, fontSize: 16 }}>{cap.fan.label}</Text>
            {/* The percentage as well as the name. "Medium" does not tell you
                where you are between the two you can feel the difference
                between, and the slider is continuous. */}
            <Text style={{ color: c.faint, fontWeight: "700" }}>
              {fanHint(d, cap.fan)} · {Math.round(fanLevel(d, cap.fan))}%
            </Text>
          </View>
          {/*
            Continuous, not four positions.

            The fan drives an 8-bit PWM and the firmware used four of its 256
            values, so the control could only ever be a four-way switch however
            it was drawn. This is the range the hardware always had. A fan on
            the previous firmware ignores `level` and obeys the `speed` the
            command map sends beside it, so the same slider works there too --
            it just lands on the nearest of the four speeds.

            Commit on release, so the fan gets one command rather than one per
            pixel of travel.
          */}
          <Slider
            style={{ width: "100%" }}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={fanLevel(d, cap.fan)}
            onSlidingComplete={(v) => { tapLight(); send(fanCommand(v)); }}
            minimumTrackTintColor={c.accent}
            maximumTrackTintColor={c.border}
            thumbTintColor={c.accentHi}
            accessibilityLabel={`${cap.fan.label}, ${fanLevel(d, cap.fan)} percent`}
          />
          {/* The named speeds stay as direct picks: most of the time somebody
              wants "medium", not a particular percentage. */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {FAN_PRESETS.map((p) => {
              const active = Math.round(fanLevel(d, cap.fan!)) === p.level;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => send(fanCommand(p.level))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={p.level === 0 ? "Fan off" : `Fan ${p.label}`}
                  style={{ flex: 1, minHeight: 44, justifyContent: "center", borderRadius: 10, alignItems: "center", backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border }}
                >
                  <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "700" }}>{p.label}</Text>
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
          <Text style={{ color: c.text, fontSize: 16, marginBottom: 12 }}>Colour</Text>
          <ColorGrid
            value={String(d.state[cap.color.field] ?? "#ffffff")}
            /*
             * Preview is throttled, commit is not. Dragging across the grid
             * generates a touch event per frame, and a bulb given sixty
             * commands a second falls behind and then lurches through the
             * backlog. Roughly ten a second is smooth to the eye and keeps up.
             */
            onPreview={(hex) => sendLive({ [cap.color!.field]: hex })}
            onCommit={(hex) => send({ [cap.color!.field]: hex })}
          />
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
  // firmware/home-hub/home-hub.ino writeRelay(): "power%s", i == 0 ? "" : i + 1.
  // The hub takes { ch, on } rather than { field: value }, so the field-to-index
  // mapping lives here and the shared channel UI is reused rather than copied.
  const HUB_INDEX: Record<string, number> = { power: 0, power2: 1, power3: 2, power4: 3 };
  const scenes = ["home", "away", "night", "movie"];
  return (
    <View>
      <SwitchGangs
        d={d}
        send={send}
        c={c}
        sendFor={(field, v) => {
          const ch = HUB_INDEX[field];
          if (ch != null) send({ ch, on: v });
        }}
      />
      <Section c={c}>Scenes</Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {scenes.map((sc) => {
          const on = d.state.scene === sc;
          return (
            <Pressable hitSlop={TAP_SLOP} key={sc} onPress={() => send({ scene: sc })} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: on ? c.accent : c.card, borderColor: on ? c.accent : c.border, borderWidth: 1 }}>
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

/**
 * One channel of a multi-gang board, drawn as a tile rather than a row.
 *
 * A relay board cannot know whether channel 2 feeds a ceiling fan or a geyser,
 * so the user says — and once they have, the tile stops being an anonymous
 * "Channel 3" with a switch and starts showing what it controls: the right
 * icon, an accent that matches, and the same on-state treatment as the device
 * grid. A fan spins, a lamp glows.
 *
 * The whole tile is the switch. These get used dozens of times a day, and
 * hunting a small toggle at the right edge is the wrong target for a thumb.
 */
function ChannelTile({ gang, on, onToggle, c }: { gang: Gang; on: boolean; onToggle: (v: boolean) => void; c: Palette }) {
  const meta = channelKind(gang.kind);
  const spin = useSpin(meta.motion === "spin" && on);
  const glow = useGlowPulse(meta.motion === "glow" && on);

  /*
   * The channel rows are the widgets on this screen, and in neo they were the
   * only flat things on it — a bordered rectangle under an extruded card. The
   * shadow goes behind the row, so a lit row keeps its accent wash and its
   * ring while still standing off the background.
   */
  const tile = (
    <Pressable
      onPress={() => { toggleFeedback(!on); onToggle(!on); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${gang.label}, ${meta.label}, ${on ? "on" : "off"}`}
      style={({ pressed }) => [
        ch.tile,
        {
          backgroundColor: on ? meta.accent + "1F" : c.isNeo ? c.surface : c.card,
          // In neo the surface is extruded, and an outline on top of that reads
          // as a sticker of a tile rather than a tile. The lit state keeps its
          // border, because that is what says "on" at a glance.
          borderWidth: c.isNeo && !on ? 0 : 1,
          borderColor: on ? meta.accent : c.border,
          opacity: pressed ? 0.85 : 1,
          shadowColor: meta.accent,
          shadowOpacity: on ? 0.35 : 0,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 3 },
          // Material's own shadow would sit under the neumorphic one and undo it.
          ...elevate(c.isNeo, on ? 6 : 0),
        },
      ]}
    >
      <Animated.View style={[ch.iconWrap, { backgroundColor: on ? meta.accent : c.cardHi, opacity: meta.motion === "glow" && on ? glow : 1 }]}>
        <Animated.View style={meta.motion === "spin" && on ? { transform: [{ rotate: spin }] } : undefined}>
          <Icon name={meta.icon} size={22} color={on ? "#fff" : c.faint} />
        </Animated.View>
      </Animated.View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{gang.label}</Text>
        <Text style={{ color: on ? meta.accent : c.faint, fontSize: 12, fontWeight: "600" }}>
          {on ? "On" : "Off"}{gang.kind !== "generic" ? ` · ${meta.label}` : ""}
        </Text>
      </View>

      <Sw v={on} on={onToggle} c={c} />
    </Pressable>
  );

  if (!c.isNeo) return tile;
  return (
    <NeoRaised radius={16} c={c} spec={NEO_SMALL}>
      {tile}
    </NeoRaised>
  );
}

const ch = StyleSheet.create({
  tile: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, minHeight: 68 },
  iconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  kindChip: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1 },
});

function SmartSwitch({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  return <SwitchGangs d={d} send={send} c={c} />;
}

// Reusable multi-gang control with per-device widget customization (name, what
// it is wired to, and show/hide). Used by smart-switch, home-hub, touchboard and
// sentinel, and available to any boolean-field device.
/**
 * The name box for one channel.
 *
 * It holds its own text while you are typing, which fixes three things that all
 * had the same cause: the value used to be re-derived from the shared store on
 * every keystroke.
 *
 *  - Clearing the box refilled it. An empty override means "use the default",
 *    so the store answered "Gang 1" and the box you had just emptied showed
 *    "Gang 1" again.
 *  - A space could not be typed. The store trims what it is given, so "Living "
 *    came back as "Living", and the next letter landed against the g.
 *  - The name appeared not to save, because what you saw was never what you had
 *    typed — it was whatever survived the round trip.
 *
 * The default is the placeholder now, which is what an empty box should show:
 * "this is what it will be called if you leave this alone".
 */
function ChannelNameField({
  value,
  fallback,
  onCommit,
  c,
}: {
  value: string;
  fallback: string;
  onCommit: (name: string) => void;
  c: Palette;
}) {
  // An override reads as empty; only a name the user actually chose is text.
  const [draft, setDraft] = useState(value === fallback ? "" : value);

  // Follow the shared value when it changes underneath us — a rename on the web
  // — but never while this field has focus, or it would fight the typist.
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value === fallback ? "" : value);
  }, [value, fallback]);

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onCommit(draft); }}
      onSubmitEditing={() => onCommit(draft)}
      placeholder={fallback}
      placeholderTextColor={c.faint}
      maxLength={40}
      returnKeyType="done"
      accessibilityLabel={`Name for ${fallback}`}
      style={{ flex: 1, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, minHeight: 44 }}
    />
  );
}

function SwitchGangs({ d, send, c, sendFor }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette; sendFor?: (field: string, v: boolean) => void }) {
  const { gangs, visible, rename, setVisible, setKind, reset } = useSwitchWidgets(d);
  const [editing, setEditing] = useState(false);
  // Most boards take { field: value }. The Home Hub takes { ch, on } instead,
  // so it passes its own mapping rather than having a second copy of this UI.
  const emit = (field: string, v: boolean) => (sendFor ? sendFor(field, v) : send({ [field]: v }));
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Section c={c}>Controls</Section>
        <Pressable
          onPress={() => setEditing((e) => !e)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={editing ? "Finish customising channels" : "Customise channels"}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: c.accentHi, fontWeight: "700", fontSize: 13 }}>{editing ? "Done" : "Customize"}</Text>
        </Pressable>
      </View>

      {editing ? (
        <View>
          <Text style={{ color: c.faint, fontSize: 12, marginBottom: 10 }}>
            Name each channel and say what it switches. The icon, colour and animation follow from that.
          </Text>
          {gangs.map((g) => (
            <Card key={g.field} padded style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ChannelNameField
                  value={g.label}
                  fallback={defaultLabelFor(d, g.field)}
                  onCommit={(t) => rename(g.field, t)}
                  c={c}
                />
                <Sw v={g.visible} on={(v) => setVisible(g.field, v)} c={c} />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                {CHANNEL_KINDS.map((k) => {
                  const sel = (g.kind ?? "generic") === k.id;
                  return (
                    <Pressable hitSlop={TAP_SLOP}
                      key={k.id}
                      onPress={() => { tapLight(); setKind(g.field, k.id); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={`${g.label}: ${k.label}`}
                      style={[ch.kindChip, { borderColor: sel ? k.accent : c.border, backgroundColor: sel ? k.accent + "22" : c.card }]}
                    >
                      <Icon name={k.icon} size={16} color={sel ? k.accent : c.faint} />
                      <Text style={{ color: sel ? k.accent : c.textDim, fontWeight: sel ? "800" : "600", fontSize: 13 }}>{k.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          ))}
          <Pressable onPress={reset} hitSlop={8} accessibilityRole="button" style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: c.faint }}>Reset to defaults</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {visible.length === 0 && <Text style={{ color: c.faint }}>All channels hidden. Tap Customize to show some.</Text>}

          {/* Quick row: every channel as a glowing tile, the shape the whole
              board can be read from at a glance. Duplicating the toggles below
              is the point — this is for "turn the fan on" without reading, the
              list below is for knowing which is which. */}
          {visible.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingVertical: 6, paddingRight: 8 }}
              style={{ marginBottom: 6 }}
            >
              {visible.map((g) => {
                const km = channelKind(g.kind);
                return (
                  <GlowTile
                    key={g.field}
                    icon={km.icon}
                    label={g.label}
                    on={!!d.state[g.field]}
                    accent={km.accent}
                    onPress={() => emit(g.field, !d.state[g.field])}
                  />
                );
              })}
            </ScrollView>
          )}

          {visible.map((g) => (
            <ChannelTile
              key={g.field}
              gang={g}
              on={!!d.state[g.field]}
              onToggle={(v) => emit(g.field, v)}
              c={c}
            />
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

/**
 * The cv-em1 / cv-em3 meter.
 *
 * Separate from EnergyMonitor above, which reads a CT clamp and assumes 230 V
 * at a power factor of 0.95. This board measures true active power, so the
 * power factor is a reading — and on a fan or an LED driver, the loads people
 * actually ask about, that assumption is exactly what makes the older device
 * wrong.
 *
 * Read-only on the phone by design. Calibration needs a reference load and a
 * steady hand at a consumer unit, which is a console job rather than something
 * to offer next to a light switch.
 */
function EnergyMeter({ d, c }: { d: Device; c: Palette }) {
  const channels = Math.max(1, Math.min(3, Number(d.state.channels ?? 1)));
  const volts = Number(d.state.volts ?? 0);
  const total = Number(d.state.wattsTotal ?? d.state.watts ?? 0);
  /* `watts`, `watts2`, `watts3` — chKey() writes the bare name for channel 0
     and appends i+1 after that. watts0 exists on no board. */
  const ch = (base: string, i: number) =>
    Number(d.state[i === 0 ? base : `${base}${i + 1}`] ?? 0);

  return (
    <View>
      <Big
        value={total.toFixed(0)}
        unit=" W"
        caption={
          channels > 1
            ? `Total across ${channels} channels${volts > 0 ? ` · ${volts.toFixed(0)} V` : ""}`
            : `Active power${volts > 0 ? ` · ${volts.toFixed(0)} V` : ""}`
        }
        c={c}
      />
      {Array.from({ length: channels }, (_, i) => {
        const pf = ch("pf", i);
        return (
          <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            <MiniStat
              label={channels > 1 ? `Ch ${i + 1}` : "Load"}
              value={`${ch("watts", i).toFixed(0)} W`}
              c={c}
            />
            <MiniStat label="Current" value={`${ch("amps", i).toFixed(2)} A`} c={c} />
            <MiniStat label="Energy" value={`${ch("kwh", i).toFixed(2)} kWh`} c={c} />
            {/* Power factor is the number that says whether the reading can be
                trusted, and it is the one an assuming meter cannot produce. */}
            <MiniStat label="PF" value={pf > 0 ? pf.toFixed(2) : "—"} c={c} />
          </View>
        );
      })}
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
          <Pressable hitSlop={TAP_SLOP} onPress={() => send({ sos: false })} style={{ backgroundColor: c.red, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }}><Text style={{ color: "#fff", fontWeight: "700" }}>Clear alert</Text></Pressable>
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
function WaveTank({ label, pct, litres, c, accent, fault, stale }: { label: string; pct: number; litres: number; c: Palette; accent: string; fault?: boolean; stale?: boolean }) {
  /*
   * A negative percentage means "no reading", not an empty tank. Drawing it as
   * empty would be the worst default here: an empty overhead tank is exactly
   * the condition that prompts somebody to start the pump.
   */
  const unknown = pct < 0;
  const clamped = unknown ? 0 : Math.min(100, Math.max(0, pct));
  const level = useRef(new Animated.Value(clamped)).current;
  const flow1 = useRef(new Animated.Value(0)).current;
  const flow2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(level, { toValue: clamped, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [clamped, level]);

  useEffect(() => {
    /*
     * Motion is how this gauge says "being updated". A stale or missing
     * reading must not keep waving, or it goes on signalling liveness that is
     * no longer there — the animation would be the most confident thing on the
     * screen while the number behind it is hours old.
     */
    if (stale || unknown) return;
    const mk = (v: Animated.Value, dur: number) => Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));
    const a = mk(flow1, 2600); const b = mk(flow2, 4200);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [flow1, flow2, stale, unknown]);

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
        <Animated.View style={{ height: waterHeight, width: "100%", opacity: unknown ? 0 : stale ? 0.35 : 1 }}>
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
          <Text style={{ color: unknown ? c.faint : stale ? c.amber : c.text, fontSize: 22, fontWeight: "800" }}>
            {unknown ? "—" : `${clamped}%`}
          </Text>
          {stale && !unknown && (
            <Text style={{ color: c.amber, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 }}>LAST KNOWN</Text>
          )}
        </View>
      </View>
      <Text style={{ color: c.text, fontWeight: "700", marginTop: 8 }}>{label}</Text>
      <Text style={{ color: c.faint, fontSize: 12 }}>
        {unknown ? "no reading" : `${litres.toLocaleString("en-IN")} L`}{fault ? " · sensor?" : ""}
      </Text>
    </View>
  );
}

function TankBar({ label, pct, litres, c, accent, fault, stale }: { label: string; pct: number; litres: number; c: Palette; accent: string; fault?: boolean; stale?: boolean }) {
  return <WaveTank label={label} pct={pct} litres={litres} c={c} accent={accent} fault={fault} stale={stale} />;
}

function WaterTank({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {
  /*
   * The overhead level comes over radio from a battery unit on the tank, so it
   * can stop arriving. `readTankLink` is the one place that decides whether the
   * last reading may still be shown as current — the console uses the same
   * rules and the firmware applies them to the pump.
   */
  const link = readTankLink(d.state as TankDeviceState);
  const oh = link.levelPct ?? -1;
  const sump = Number(d.state.sumpPct ?? 0);
  const auto = !!d.state.auto;
  const start = Number(d.state.startPct ?? 20);
  const stop = Number(d.state.stopPct ?? 95);
  const sumpMin = Number(d.state.sumpMinPct ?? 15);
  const linkColor =
    link.tone === "ok" ? c.green
      : link.tone === "warn" ? c.amber
        : link.tone === "bad" ? c.red
          : c.faint;
  return (
    <View>
      <Card padded style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <TankBar label="Overhead" pct={oh} litres={Number(d.state.ohLitres ?? 0)} c={c} accent={c.cyan} fault={!!d.state.ohFault} stale={!link.levelIsCurrent} />
          <View style={{ alignItems: "center", paddingBottom: 34 }}>
            <Text style={{ color: !!d.state.pump ? c.cyan : c.faint, fontWeight: "800", fontSize: 11 }}>{!!d.state.pump ? "▲ PUMP" : "IDLE"}</Text>
            <View style={{ width: 2, height: 40, backgroundColor: c.border, marginVertical: 4 }} />
            <Text style={{ fontSize: 18 }}>💧</Text>
          </View>
          <TankBar label="Sump" pct={sump} litres={Number(d.state.sumpLitres ?? 0)} c={c} accent={c.accentHi} fault={!!d.state.sumpFault} />
        </View>
      </Card>
      {/*
        * The radio link is always shown, not only when it breaks. A level with
        * no indication of where it came from is what makes a stale reading
        * dangerous, and a status that only appears on failure never teaches
        * anyone what healthy looks like.
        */}
      <Card padded style={{ marginBottom: 14, borderColor: link.tone === "ok" ? c.border : linkColor }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: linkColor, fontWeight: "800", fontSize: 13 }}>📡 {link.label}</Text>
          {link.ageS !== null && link.status !== "live" && (
            <Text style={{ color: c.faint, fontSize: 12 }}>· {formatAge(link.ageS)} ago</Text>
          )}
          {link.batteryPct !== null && (
            <Text style={{ color: link.batteryLow ? c.amber : c.faint, fontSize: 12 }}>
              · battery {link.batteryPct}%
            </Text>
          )}
        </View>
        <Text style={{ color: c.faint, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{link.detail}</Text>
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
      <Section c={c}>Tank sensor</Section>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <Pressable
          onPress={() => send({ action: "pair" })}
          accessibilityRole="button"
          accessibilityLabel={link.status === "unpaired" ? "Pair tank sensor" : "Re-pair tank sensor"}
          style={{ flex: 1, minHeight: 48, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: c.text, fontWeight: "700" }}>
            {d.state.pairing ? "Listening…" : link.status === "unpaired" ? "Pair sensor" : "Re-pair"}
          </Text>
        </Pressable>
        {link.status !== "unpaired" && (
          <Pressable
            onPress={() => send({ action: "unpair" })}
            accessibilityRole="button"
            accessibilityLabel="Forget tank sensor"
            style={{ flex: 1, minHeight: 48, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: c.faint, fontWeight: "700" }}>Forget</Text>
          </Pressable>
        )}
      </View>
      <Text style={{ color: c.faint, fontSize: 11, marginBottom: 12, lineHeight: 16 }}>
        Pairing opens a 60-second window. Press the button on the unit fitted to the tank.
      </Text>
      {link.status !== "unpaired" && (
        <>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            <Pressable
              onPress={() => send({ action: "readNow" })}
              accessibilityRole="button"
              accessibilityLabel="Read the tank now"
              style={{ flex: 1, minHeight: 48, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: c.text, fontWeight: "700" }}>
                {link.downlinkPending ? "Queued…" : "Read now"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => send({ action: "identifySensor" })}
              accessibilityRole="button"
              accessibilityLabel="Blink the light on the tank sensor"
              style={{ flex: 1, minHeight: 48, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: c.faint, fontWeight: "700" }}>Identify</Text>
            </Pressable>
          </View>
          {/*
            * Saying it is queued matters. The sensor is asleep and cannot be
            * reached until it next transmits, so a button that appeared to do
            * nothing would read as broken.
            */}
          <Text style={{ color: c.faint, fontSize: 11, marginBottom: 12, lineHeight: 16 }}>
            {link.downlinkPending
              ? "Waiting for the sensor's next report to pass this on."
              : `The sensor sleeps between reports, so this can take up to ${link.intervalS}s.`}
          </Text>
          <Stepper
            label={`Report every ${link.intervalS}s`}
            c={c}
            onDown={() => send({ sensorIntervalS: Math.max(10, link.intervalS - 10) })}
            onUp={() => send({ sensorIntervalS: Math.min(900, link.intervalS + 10) })}
          />
          <Text style={{ color: c.faint, fontSize: 11, marginBottom: 12, lineHeight: 16 }}>
            Less often lasts longer on a battery; more often reacts sooner.
          </Text>
        </>
      )}
      <Section c={c}>Auto thresholds</Section>
      <Stepper label={`Start overhead at ${start}%`} c={c} onDown={() => send({ startPct: Math.max(5, start - 5) })} onUp={() => send({ startPct: Math.min(90, start + 5) })} />
      <Stepper label={`Stop overhead at ${stop}%`} c={c} onDown={() => send({ stopPct: Math.max(10, stop - 5) })} onUp={() => send({ stopPct: Math.min(100, stop + 5) })} />
      <Stepper label={`Protect sump below ${sumpMin}%`} c={c} onDown={() => send({ sumpMinPct: Math.max(5, sumpMin - 5) })} onUp={() => send({ sumpMinPct: Math.min(60, sumpMin + 5) })} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <MiniStat label="Pump current" value={`${Number(d.state.amps ?? 0).toFixed(1)} A`} c={c} />
        <MiniStat label="Overhead" value={tankLevelText(link)} c={c} />
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
        <Pressable onPress={() => send({ action: "open" })} style={{ flex: 1, backgroundColor: c.green, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}><Text style={{ color: c.onAccent, fontWeight: "800" }}>Open</Text></Pressable>
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

/**
 * ANPR camera.
 *
 * Deliberately not the camera panel. This firmware does not read `motion` or
 * `flash`, and the camera panel's snapshot and record buttons have nothing to
 * act on here — offering them would produce controls that acknowledge a tap
 * and do nothing, which is worse than not offering them.
 *
 * Live view is offered because aiming a camera without seeing through it is
 * guesswork, and it is labelled as an aiming tool rather than a feed: the
 * firmware drops resolution while streaming and cancels the lease after 20 s.
 */
/**
 * Drone Link — the phone's view of an aircraft.
 *
 * Status, and one control: grounding.
 *
 * Take-off, landing, return-to-home and mode changes are deliberately absent
 * from the phone's device screen. Not because a phone cannot be trusted, but
 * because *this* screen cannot: it is reached by scrolling a list of household
 * devices, and a flight command sitting two rows below a bedroom lamp is a
 * flight command somebody sends with their thumb while walking. Those controls
 * live in the console's Drone page, where the preflight verdict, the flight
 * envelope and the refusal reasons are on screen with them.
 *
 * Grounding is the exception and points the safe way: it only ever removes a
 * capability. Nothing here can start a flight.
 */
function DroneLink({
  d,
  send,
  c,
}: {
  d: Device;
  send: (p: Record<string, unknown>) => void;
  c: Palette;
}) {
  const armed = !!d.state.armed;
  const inAir = !!d.state.inAir;
  const linked = !!d.state.link;
  const ready = d.state.ready == null ? false : !!d.state.ready;
  const allowArm = d.state.allowArm == null ? true : !!d.state.allowArm;
  const mode = String(d.state.mode ?? "—");
  const readyReason = String(d.state.readyReason ?? "");
  const battPct = Number(d.state.battPct ?? -1);
  const sats = Number(d.state.sats ?? 0);
  const alt = Number(d.state.alt ?? 0);
  const distHome = Number(d.state.distHome ?? 0);
  const fix = String(d.state.fix ?? "none");
  const failsafe = !!d.state.failsafe;

  const stateLabel = inAir ? "Airborne" : armed ? "Armed" : "On the ground";
  const stateColor = inAir ? c.violet : armed ? c.amber : c.faint;

  return (
    <View>
      {failsafe && (
        <Card padded style={{ marginBottom: 12, borderColor: c.red, borderWidth: 1 }}>
          <Text style={{ color: c.red, fontWeight: "800" }}>Autopilot failsafe active</Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>
            The flight controller is handling this on its own — lost radio, lost GPS or a critical
            battery. Do not send commands unless you can see the aircraft.
          </Text>
        </Card>
      )}

      {!linked && (
        <Card padded style={{ marginBottom: 12, borderColor: c.amber, borderWidth: 1 }}>
          <Text style={{ color: c.amber, fontWeight: "800" }}>No autopilot link</Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>
            This bridge is online but is not hearing a flight controller. Check the TELEM wiring and
            the baud rate.
          </Text>
        </Card>
      )}

      <Card padded style={{ marginBottom: 12, alignItems: "center" }}>
        <Text style={{ color: c.faint, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {inAir ? "Altitude" : "Status"}
        </Text>
        <Text style={{ fontSize: 40, fontWeight: "800", color: stateColor, marginTop: 4 }}>
          {inAir ? `${alt.toFixed(0)} m` : stateLabel}
        </Text>
        <Text style={{ color: c.faint, fontSize: 13, marginTop: 6 }}>
          {inAir ? `${stateLabel} · ${mode} · ${distHome.toFixed(0)} m from home` : `Mode ${mode}`}
        </Text>
      </Card>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Card padded style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>
            {battPct < 0 ? "—" : `${battPct}%`}
          </Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>Battery</Text>
        </Card>
        <Card padded style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>
            {fix === "none" ? "—" : sats}
          </Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>
            {fix === "none" ? "No GPS fix" : `Satellites · ${fix}`}
          </Text>
        </Card>
      </View>

      {!inAir && (
        <Card padded style={{ marginBottom: 12 }}>
          <Text style={{ color: ready ? c.green : c.amber, fontWeight: "800" }}>
            {ready ? "Ready to fly" : "Not ready to fly"}
          </Text>
          {!!readyReason && readyReason !== "ready" && (
            <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>{readyReason}</Text>
          )}
        </Card>
      )}

      <Section c={c}>Safety</Section>
      <Card padded>
        <Row label="Allow arming" c={c}>
          <Sw v={allowArm} on={(b) => send({ action: "set", allowArm: b })} c={c} />
        </Row>
        <Text style={{ color: c.faint, fontSize: 12, marginTop: 6 }}>
          {inAir
            ? "The aircraft is flying. Turning this off will not bring it down — it only stops the next arm."
            : "Turn off to ground this aircraft. It cannot be armed again until this is switched back on."}
        </Text>
      </Card>

      <Card padded style={{ marginTop: 12 }}>
        <Text style={{ color: c.faint, fontSize: 12, lineHeight: 18 }}>
          Take-off, landing, return-to-home and missions are in the web console under Drone, where
          the flight envelope and preflight checks are shown alongside them.
        </Text>
      </Card>
    </View>
  );
}

function AnprCamera({
  d,
  send,
  command,
  c,
}: {
  d: Device;
  send: (p: Record<string, unknown>) => void;
  command: (id: string, body: Record<string, unknown>) => void | Promise<unknown>;
  c: Palette;
}) {
  const armed = !!d.state.armed;
  const ready = d.state.ready == null ? true : !!d.state.ready;
  const phase = String(d.state.phase ?? "idle");
  const plate = String(d.state.lastPlate ?? "");
  const decision = String(d.state.lastDecision ?? "");
  const confidence = Number(d.state.lastConfidence ?? 0);
  const hasLoop = !!d.state.hasLoop;
  const lane = d.state.direction === "in" || d.state.direction === "out" ? d.state.direction : "both";
  const busy = phase === "settle" || phase === "burst";

  const decisionColor = decision === "deny" ? c.red : decision === "allow" ? c.green : decision === "watch" ? c.amber : c.faint;
  const decisionLabel =
    decision === "deny" ? "BLOCKED" : decision === "allow" ? "ALLOWED" : decision === "watch" ? "WATCHLIST" : "";

  return (
    <View>
      {!ready && (
        <Card padded style={{ marginBottom: 12, borderColor: c.red, borderWidth: 1 }}>
          <Text style={{ color: c.red, fontWeight: "800" }}>Camera sensor did not start</Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>
            No plates can be captured until it does. Check the ribbon cable and the 5 V supply, then reboot.
          </Text>
        </Card>
      )}

      <Card padded style={{ marginBottom: 12, alignItems: "center" }}>
        <Text style={{ color: c.faint, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Last plate</Text>
        <Text style={{ fontSize: 28, fontWeight: "800", color: plate ? c.text : c.faint, fontFamily: "monospace", marginTop: 4 }}>
          {plate || "—"}
        </Text>
        {!!decisionLabel && (
          <Text style={{ color: decisionColor, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
            {decisionLabel} · {confidence}%
          </Text>
        )}
        <Text style={{ color: busy ? c.cyan : c.faint, fontSize: 13, marginTop: 8 }}>
          {!armed ? "Disarmed" : busy ? "🚗 Vehicle at the lane" : "Watching the lane"}
        </Text>
      </Card>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Pressable
          onPress={() => { tapLight(); void command(d.id, { action: "capture" }); }}
          disabled={!d.online || !ready}
          style={{ flex: 1, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: d.online && ready ? 1 : 0.4 }}
        >
          <Text style={{ color: c.onAccent, fontWeight: "800" }}>Capture now</Text>
        </Pressable>
        <Pressable
          onPress={() => { tapLight(); void command(d.id, { action: "stream", on: !d.state.streaming }); }}
          disabled={!d.online || !ready}
          style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: d.online && ready ? 1 : 0.4 }}
        >
          <Text style={{ color: c.text, fontWeight: "800" }}>{d.state.streaming ? "Stop view" : "Aim camera"}</Text>
        </Pressable>
      </View>

      {!!d.state.hasRelay && (
        <Pressable
          onPress={() => { tapLight(); void command(d.id, { action: "open" }); }}
          disabled={!d.online}
          style={{ backgroundColor: c.green, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 12, opacity: d.online ? 1 : 0.4 }}
        >
          <Text style={{ color: c.onAccent, fontWeight: "800" }}>Open barrier</Text>
        </Pressable>
      )}

      <Row label="Armed" c={c}>
        <Sw v={armed} on={(v) => send({ armed: v })} c={c} />
      </Row>

      {/*
        The lane setting, because it changes what every read means. A camera
        remounted on the exit side while still reporting "in" would log every
        departure as another arrival, and the vehicle would never appear to
        leave — a wrong answer that looks like a working one.
      */}
      <Row label="Traffic direction" c={c} stack>
        <PillSelector
          value={lane}
          options={["in", "out", "both"] as const}
          onChange={(v) => send({ direction: v })}
        />
      </Row>

      <Card padded style={{ marginBottom: 10, flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: c.text, fontWeight: "700" }}>{Number(d.state.captures ?? 0)}</Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>vehicles</Text>
        </View>
        <View>
          <Text style={{ color: c.text, fontWeight: "700" }}>{Number(d.state.reads ?? 0)}</Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>plates read</Text>
        </View>
        <View>
          <Text style={{ color: Number(d.state.dropped ?? 0) > 0 ? c.amber : c.text, fontWeight: "700" }}>
            {Number(d.state.dropped ?? 0)}
          </Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>dropped</Text>
        </View>
      </Card>

      <Text style={{ color: c.faint, fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
        {hasLoop
          ? "A loop detector is wired to this unit — the more reliable trigger, since it cannot be fooled by a shadow, a headlight sweep or rain."
          : "No loop detector is wired to this unit, so arrivals are detected from the picture alone. Fitting an inductive loop or IR beam is the single biggest improvement to trigger reliability."}
      </Text>

      <Text style={{ color: c.faint, fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
        Plates are read by the control plane, not on the device — the camera decides when a vehicle is
        present and sends the sharpest frames. Allow and block lists live with your account, so they
        apply across every ANPR camera you own.
      </Text>
    </View>
  );
}

function FaceDoor({ d, send, c }: { d: Device; send: (p: Record<string, unknown>) => void; c: Palette }) {  const locked = !!d.state.locked;
  const als = Number(d.state.autoLockSec ?? 8);
  return (
    <View>
      <Card padded style={{ marginBottom: 12, alignItems: "center" }}>
        <Text style={{ fontSize: 40 }}>{locked ? "🔒" : "🔓"}</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: locked ? c.textDim : c.green, marginTop: 6 }}>{locked ? "LOCKED" : "UNLOCKED"}</Text>
        <Text style={{ color: c.faint, marginTop: 4, fontSize: 13 }}>{String(d.state.lastMethod ?? "—")}{d.state.lastName ? ` · ${String(d.state.lastName)}` : ""}</Text>
      </Card>
      <View style={{ marginBottom: 12 }}>
        {/*
          Unlocking is a gesture; locking is a tap.

          This was two identical buttons side by side, so opening a front door
          cost exactly one tap from a phone that spends its life in a pocket
          next to the door it opens. Unlocking now needs a sustained drag,
          which is very hard to do without meaning to.

          Locking deliberately stays a single tap. Making the safe direction
          harder protects nobody and just means people leave it unlocked.
        */}
        {locked ? (
          <SlideToConfirm
            label="Slide to unlock"
            hint="Deliberately harder than a tap"
            accent={c.green}
            c={c}
            onConfirm={() => send({ action: "unlock", method: "app" })}
          />
        ) : (
          <Pressable
            onPress={() => send({ action: "lock" })}
            accessibilityRole="button"
            accessibilityLabel="Lock the door"
            style={{ minHeight: 56, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 28, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: c.text, fontWeight: "800" }}>🔒  Lock</Text>
          </Pressable>
        )}
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
                    <Text style={{ color: sel ? c.onAccent : c.textDim, fontWeight: sel ? "800" : "600" }}>{r < 0 ? "None" : `Relay ${r + 1}`}</Text>
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

/* firmware/camera/camera.ino defines FPS_MAX 60. The app stopped at 15, so
   most of the range the hardware supports was simply not offered. */
const CAM_FPS = [1, 5, 10, 15, 24, 30, 45, 60] as const;
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
  /**
   * Whether this unit actually has a camera.
   *
   * Sentinel firmware reports hasCamera:false on a board with no sensor
   * fitted. Registered as type "camera" — which Add Device never validated —
   * this screen would wait for a first frame forever while the device looked
   * healthy, and the hardware would be the last thing suspected.
   */
  const hasCamera = st.hasCamera == null ? true : bool("hasCamera");
  /*
   * A firmware update outranks every camera fault below it. A device mid-OTA is
   * busy, then briefly gone, then back on a new build — and each of those reads
   * as a failure to a panel that only asks "online" and "ready".
   */
  const camOtaState = readOtaStatus(st.otaStatus);
  const camUpdating = isUpdating(camOtaState);
  const camOta = otaNotice(camOtaState, d.online);
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

      {camOta && <Alertline c={c} text={camOta} />}
      {!hasCamera && !camUpdating && (
        <Alertline
          c={c}
          text="This board reports no camera fitted — it is running gas/relay firmware. It was most likely added as the wrong device type. No video will arrive from this unit."
        />
      )}
      {hasCamera && !ready && d.online && !camUpdating && (
        <Alertline c={c} text={describeCameraFault(st)} />
      )}
      {hasCamera && ready && stalled && !camUpdating && (
        <StallHint c={c} frames={n("frames", 0)} dropped={n("dropped", 0)} />
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
      <Row label="Resolution" c={c} stack>
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
      <Row label="Frame rate" c={c} stack>
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

/**
 * What to say when live view is on and nothing is arriving.
 *
 * The board publishes its own `frames` and `dropped` counters, which separate
 * two faults that look identical on screen but need opposite actions. The old
 * message assumed the camera was at fault and told the user to reboot it —
 * which was exactly wrong when the board was streaming fine and the frames
 * were being dropped upstream. Reading the counters is the difference between
 * a hint and a guess.
 */
function StallHint({ c, frames, dropped }: { c: Palette; frames: number; dropped: number }) {
  if (frames > 0) {
    return (
      <Alertline
        c={c}
        text={`The camera has sent ${frames} frames, so it is working — they are not reaching this app. Check your connection, or pull to refresh to reconnect.`}
      />
    );
  }
  if (dropped > 0) {
    return (
      <Alertline
        c={c}
        text={`The camera captured nothing on ${dropped} attempts. Check the ribbon cable seating, lower the resolution, then reboot.`}
      />
    );
  }
  return <Alertline c={c} text="Live view is on but the camera has not sent anything yet. Give it a few seconds, then try Reboot." />;
}

function MiniStat({ label, value, c }: { label: string; value: string; c: Palette }) {  return (
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
