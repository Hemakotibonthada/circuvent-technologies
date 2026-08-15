import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Switch } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth";
import { useDevices } from "../store";
import { Device } from "../api";
import { deviceMeta } from "../theme";
import { Screen, Card, SectionLabel, GhostButton, useTheme, useSafeArea } from "../ui";
import { Icon, type IconName } from "../icons";
import { ACCENTS, ThemeMode, TAP_SLOP } from "../theme";
import { tapLight, toggleFeedback, setHapticsEnabled, hapticsEnabled } from "../haptics";
import { APP_VERSION, APP_BUILD } from "../version";
import { usePrompt } from "../overlays";
import {
  DENSITIES,
  DENSITY_LABELS,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_STEP,
} from "../view-settings";
import { OS_SCALE_NOTE } from "../view-settings-native";

const MODES: { key: ThemeMode; label: string; sub: string; icon: IconName }[] = [
  { key: "glass", label: "Glass", sub: "Frosted glassmorphism", icon: "glass" },
  { key: "aurora", label: "Aurora", sub: "Signature gradient", icon: "aurora" },
  { key: "neo", label: "Neo", sub: "Soft neumorphism", icon: "neo" },
  { key: "oled", label: "OLED", sub: "True black · saves battery", icon: "oled" },
  { key: "neon", label: "Neon", sub: "Glowing tiles on violet", icon: "neon" },
];

/** Themes that only exist in the dark. A "light OLED" is a contradiction. */
const DARK_ONLY: ThemeMode[] = ["oled", "neon"];

export default function Settings({ onBack, onKiosk, onChangeWifi }: { onBack?: () => void; onKiosk?: () => void; onChangeWifi?: (d: Device) => void }) {
  const { c, mode, scheme, accentKey, setMode, setScheme, setAccentKey, textScale, density, setTextScale, setDensity } = useTheme();
  const insets = useSafeArea();
  const { account, logout } = useAuth();
  const { devices } = useDevices();

  const [haptics, setHapticsState] = React.useState(hapticsEnabled());
  const setHaptics = (v: boolean) => {
    setHapticsState(v);
    setHapticsEnabled(v);
    if (v) toggleFeedback(true);
  };

  const { prompt, promptNode } = usePrompt();

  const setKioskPin = async () => {
    /*
     * Was `Alert.prompt?.(...)`, which is iOS-only and evaluated to undefined
     * on Android — so an Android user could enable kiosk mode and never be
     * able to set the PIN that leaves it. Silent, because of the `?.`.
     */
    const entered = await prompt({
      title: "Set kiosk exit PIN",
      message: "A 4-digit PIN required to leave kiosk mode.",
      placeholder: "0000",
      keyboardType: "number-pad",
      secure: true,
      maxLength: 4,
      confirmLabel: "Set PIN",
      validate: (v) => (v.replace(/[^0-9]/g, "").length === 4 ? null : "The PIN must be exactly 4 digits."),
    });
    if (entered == null) return;
    const pin = entered.replace(/[^0-9]/g, "").slice(0, 4);
    if (pin.length !== 4) return;
    await AsyncStorage.setItem("cv-kiosk-pin", pin);
    Alert.alert("Kiosk PIN updated");
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }}>
        <View style={s.top}>
          {onBack ? <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" style={{ flexDirection: "row", alignItems: "center", gap: 2, width: 54 }}><Icon name="back" size={18} color={c.textDim} /><Text style={{ color: c.textDim, fontSize: 16 }}>Back</Text></Pressable> : <View style={{ width: 54 }} />}
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>Settings</Text>
          <View style={{ width: 54 }} />
        </View>

        <SectionLabel>Appearance · Theme</SectionLabel>
        <View style={{ gap: 10, marginBottom: 16 }}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              accessibilityRole="radio"
              accessibilityLabel={`${m.label} theme. ${m.sub}`}
              accessibilityState={{ selected: mode === m.key, checked: mode === m.key }}
            >
              <Card padded hi={mode === m.key} style={mode === m.key ? { borderColor: c.accent, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Icon name={m.icon} size={24} color={mode === m.key ? c.accentHi : c.textDim} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{m.label}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>{m.sub}</Text>
                  </View>
                  <View style={[s.radio, { borderColor: mode === m.key ? c.accent : c.border }]}>
                    {mode === m.key && <View style={[s.radioDot, { backgroundColor: c.accent }]} />}
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Mode</SectionLabel>
        {DARK_ONLY.includes(mode) ? (
          // Hidden rather than disabled: OLED and Neon are defined only in the
          // dark, and leaving a light/dark switch on screen that silently does
          // nothing is worse than not offering it.
          <Card padded style={{ marginBottom: 16 }}>
            <Text style={{ color: c.textDim, fontSize: 13 }}>
              {MODES.find((m) => m.key === mode)?.label} is a dark-only theme. Pick Glass, Aurora or Neo
              for a light mode.
            </Text>
          </Card>
        ) : (
        <Card padded style={{ marginBottom: 16 }}>
          <View style={s.segRow}>
            {(["dark", "light"] as const).map((sc) => {
              const sel = scheme === sc;
              return (
                <Pressable
                  key={sc}
                  onPress={() => { if (!sel) tapLight(); setScheme(sc); }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${sc} mode`}
                  accessibilityState={{ selected: sel, checked: sel }}
                  style={[s.seg, { backgroundColor: sel ? c.accent : "transparent", flexDirection: "row", gap: 8 }]}
                >
                  <Icon name={sc === "dark" ? "moon" : "sun"} size={17} color={sel ? c.onAccent : c.textDim} />
                  <Text style={{ color: sel ? c.onAccent : c.textDim, fontWeight: "700", textTransform: "capitalize" }}>{sc}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
        )}

        <SectionLabel>Display</SectionLabel>
        {/*
          Text size and density.

          The preview is not decoration. Every other control on this screen
          shows its result immediately in the thing you are looking at, but a
          type scale changes the whole app at once — without a fixed sample to
          compare against, "is that bigger?" is genuinely hard to answer while
          the labels around the control are moving too.
        */}
        <Card padded style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <Icon name="textSize" size={22} color={c.accentHi} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>Text size</Text>
              <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }}>{OS_SCALE_NOTE}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Stepper
              label="Smaller text"
              icon="minus"
              disabled={textScale <= MIN_SCALE}
              onPress={() => { tapLight(); setTextScale(textScale - SCALE_STEP); }}
              c={c}
            />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: c.text, fontWeight: "900", fontSize: 20 }}
              >
                {textScale}%
              </Text>
              {textScale !== 100 && (
                <Pressable onPress={() => { tapLight(); setTextScale(100); }} hitSlop={TAP_SLOP}>
                  <Text style={{ color: c.accentHi, fontSize: 12, fontWeight: "700" }}>Reset</Text>
                </Pressable>
              )}
            </View>
            <Stepper
              label="Larger text"
              icon="add"
              disabled={textScale >= MAX_SCALE}
              onPress={() => { tapLight(); setTextScale(textScale + SCALE_STEP); }}
              c={c}
            />
          </View>

          <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: c.cardHi, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.faint, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>PREVIEW</Text>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "800" }}>Living room</Text>
            <Text style={{ color: c.textDim, fontSize: 13, marginTop: 2 }}>3 devices · 2 on · 142 W</Text>
          </View>
        </Card>

        <SectionLabel>Spacing</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <View style={s.segRow}>
            {DENSITIES.map((d) => {
              const sel = density === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => { if (!sel) tapLight(); setDensity(d); }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${DENSITY_LABELS[d].label} spacing. ${DENSITY_LABELS[d].hint}`}
                  accessibilityState={{ selected: sel, checked: sel }}
                  style={[s.seg, { backgroundColor: sel ? c.accent : "transparent" }]}
                >
                  <Text style={{ color: sel ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 13 }}>
                    {DENSITY_LABELS[d].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 10 }}>{DENSITY_LABELS[density].hint}</Text>
        </Card>

        <SectionLabel>Feedback</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Icon name="vibrate" size={22} color={haptics ? c.accentHi : c.faint} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>Haptic feedback</Text>
              <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }}>
                A short tap when a control changes state.
              </Text>
            </View>
            <Switch
              value={haptics}
              onValueChange={setHaptics}
              trackColor={{ true: c.accent, false: c.borderHi }}
              thumbColor="#fff"
            />
          </View>
        </Card>

        <SectionLabel>Accent color</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <View style={s.swatchRow}>
            {ACCENTS.map((a) => (
              <Pressable hitSlop={TAP_SLOP} key={a.key} onPress={() => setAccentKey(a.key)} style={{ alignItems: "center", gap: 4 }}>
                <LinearGradient colors={a.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.swatch, accentKey === a.key && { borderWidth: 3, borderColor: c.text }]} />
                <Text style={{ color: accentKey === a.key ? c.text : c.faint, fontSize: 10 }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <Row label="Name" value={account?.name || "—"} c={c} />
          <Row label="Email" value={account?.email || "—"} c={c} last />
        </Card>

        <SectionLabel>Wall kiosk</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <Text style={{ color: c.textDim, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
            Turn this tablet into a locked wall panel: fullscreen dashboard, camera matrix and appliance controls, screen kept awake. A PIN is required to exit.
          </Text>
          <Pressable onPress={onKiosk} style={{ backgroundColor: c.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: c.onAccent || "#fff", fontWeight: "800" }}>Start kiosk mode</Text>
          </Pressable>
          <Pressable onPress={setKioskPin} style={{ borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: c.text, fontWeight: "700" }}>Set exit PIN</Text>
          </Pressable>
        </Card>

        <SectionLabel>Device setup</SectionLabel>
        {/*
          Wi-Fi setup lives here, once, instead of on the bottom of every
          device's control screen.

          Changing a device's network is a rare, per-installation act — you do
          it when the router changes — but it was pinned under the controls you
          use daily, so every visit to a light scrolled past "reset the device
          and push new Wi-Fi". Settings is where infrequent, destructive-ish
          setup belongs, and gathering them makes "which devices are on the old
          router" answerable in one place instead of N.
        */}
        <Card padded style={{ marginBottom: 16 }}>
          <Text style={{ color: c.textDim, fontSize: 13, lineHeight: 20, marginBottom: devices.length ? 12 : 0 }}>
            Moved house or changed router? Push new Wi-Fi credentials to a device.
          </Text>
          {devices.length === 0 && (
            <Text style={{ color: c.faint, fontSize: 13 }}>No devices yet.</Text>
          )}
          {devices.map((d, i) => (
            <Pressable
              key={d.id}
              onPress={() => onChangeWifi?.(d)}
              accessibilityRole="button"
              accessibilityLabel={`Change Wi-Fi for ${d.name || d.id}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.border,
              }}
            >
              <Icon name={deviceMeta(d.type).icon} size={20} color={deviceMeta(d.type).accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>{d.name || d.id}</Text>
                <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{d.online ? "online" : "offline"}</Text>
              </View>
              <Text style={{ color: c.faint, fontSize: 20 }}>›</Text>
            </Pressable>
          ))}
        </Card>

        <SectionLabel>About</SectionLabel>
        <Card padded style={{ marginBottom: 20 }}>
          <Row label="App" value="Circuvent" c={c} />
          <Row label="Version" value={`${APP_VERSION} (${APP_BUILD})`} c={c} />
          <Row label="Control plane" value="api.circuvent.com" c={c} last />
        </Card>

        <GhostButton label="Log out" onPress={logout} />
      </ScrollView>
      {promptNode}
    </Screen>
  );
}

function Stepper({ label, icon, onPress, disabled, c }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; c: any }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      // 44pt, stated literally: this control changes text size, so sizing it
      // in anything that scales with text would make the button that fixes
      // "everything is too small" the hardest one to hit.
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.cardHi,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={20} color={disabled ? c.faint : c.text} />
    </Pressable>
  );
}

function Row({ label, value, c, last }: { label: string; value: string; c: any; last?: boolean }) {
  return (
    <View style={[s.row, !last && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
      <Text style={{ color: c.textDim, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 14, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  segRow: { flexDirection: "row", gap: 8 },
  seg: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "space-between" },
  swatch: { width: 40, height: 40, borderRadius: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
});
