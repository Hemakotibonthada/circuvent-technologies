import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth";
import { Screen, Card, SectionLabel, GhostButton, useTheme } from "../ui";
import { ACCENTS, ThemeMode } from "../theme";

const MODES: { key: ThemeMode; label: string; sub: string; glyph: string }[] = [
  { key: "aurora", label: "Aurora", sub: "Signature gradient", glyph: "🌌" },
  { key: "glass", label: "Glass", sub: "Frosted glassmorphism", glyph: "🧊" },
  { key: "neo", label: "Neo", sub: "Soft neumorphism", glyph: "🩶" },
];

export default function Settings({ onBack, onKiosk }: { onBack?: () => void; onKiosk?: () => void }) {
  const { c, mode, scheme, accentKey, setMode, setScheme, setAccentKey } = useTheme();
  const { account, logout } = useAuth();

  const setKioskPin = () => {
    Alert.prompt?.(
      "Set kiosk exit PIN",
      "A 4-digit PIN required to leave kiosk mode.",
      async (text) => {
        const pin = (text || "").replace(/[^0-9]/g, "").slice(0, 4);
        if (pin.length === 4) { await AsyncStorage.setItem("cv-kiosk-pin", pin); Alert.alert("Kiosk PIN updated"); }
        else Alert.alert("PIN must be 4 digits");
      },
      "plain-text",
      "",
      "number-pad"
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 40 }}>
        <View style={s.top}>
          {onBack ? <Pressable onPress={onBack} hitSlop={10}><Text style={{ color: c.textDim, fontSize: 16 }}>‹ Back</Text></Pressable> : <View style={{ width: 54 }} />}
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>Settings</Text>
          <View style={{ width: 54 }} />
        </View>

        <SectionLabel>APPEARANCE · THEME</SectionLabel>
        <View style={{ gap: 10, marginBottom: 16 }}>
          {MODES.map((m) => (
            <Pressable key={m.key} onPress={() => setMode(m.key)}>
              <Card padded hi={mode === m.key} style={mode === m.key ? { borderColor: c.accent, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Text style={{ fontSize: 24 }}>{m.glyph}</Text>
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

        <SectionLabel>MODE</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <View style={s.segRow}>
            {(["dark", "light"] as const).map((sc) => (
              <Pressable key={sc} onPress={() => setScheme(sc)} style={[s.seg, { backgroundColor: scheme === sc ? c.accent : "transparent" }]}>
                <Text style={{ color: scheme === sc ? c.onAccent : c.textDim, fontWeight: "700", textTransform: "capitalize" }}>{sc === "dark" ? "🌙 Dark" : "☀️ Light"}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <SectionLabel>ACCENT COLOR</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <View style={s.swatchRow}>
            {ACCENTS.map((a) => (
              <Pressable key={a.key} onPress={() => setAccentKey(a.key)} style={{ alignItems: "center", gap: 4 }}>
                <LinearGradient colors={a.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.swatch, accentKey === a.key && { borderWidth: 3, borderColor: c.text }]} />
                <Text style={{ color: accentKey === a.key ? c.text : c.faint, fontSize: 10 }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <SectionLabel>ACCOUNT</SectionLabel>
        <Card padded style={{ marginBottom: 16 }}>
          <Row label="Name" value={account?.name || "—"} c={c} />
          <Row label="Email" value={account?.email || "—"} c={c} last />
        </Card>

        <SectionLabel>WALL KIOSK</SectionLabel>
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

        <SectionLabel>ABOUT</SectionLabel>
        <Card padded style={{ marginBottom: 20 }}>
          <Row label="App" value="Circuvent" c={c} />
          <Row label="Version" value="1.0.0" c={c} />
          <Row label="Control plane" value="api.circuvent.com" c={c} last />
        </Card>

        <GhostButton label="Log out" onPress={logout} />
      </ScrollView>
    </Screen>
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
