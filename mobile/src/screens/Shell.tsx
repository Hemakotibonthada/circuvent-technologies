import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Device } from "../api";
import { useDevices } from "../store";
import { useTheme, useBackHandler } from "../ui";
import Home from "./Home";
import Devices from "./Devices";
import Automate from "./Automate";
import Energy from "./Energy";
import Settings from "./Settings";
import Control from "./Control";
import Notifications from "./Notifications";
import AddDevice from "./AddDevice";
import More from "./More";
import CommandPalette from "./CommandPalette";
import Weather from "./Weather";

type Tab = "home" | "devices" | "automate" | "energy" | "settings" | "more";
type Seg = "scenes" | "rooms" | "automations";
type Overlay = { kind: "control"; device: Device } | { kind: "add" } | { kind: "notifications" } | { kind: "search" } | { kind: "weather" } | null;

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "home", label: "Home", glyph: "🏠" },
  { key: "devices", label: "Devices", glyph: "📟" },
  { key: "automate", label: "Automate", glyph: "✨" },
  { key: "energy", label: "Energy", glyph: "⚡" },
  { key: "settings", label: "Settings", glyph: "⚙️" },
  { key: "more", label: "More", glyph: "🧩" },
];

export default function Shell() {
  const { c } = useTheme();
  const { refresh } = useDevices();
  const [tab, setTab] = useState<Tab>("home");
  const [seg, setSeg] = useState<Seg>("scenes");
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Android hardware/gesture back: dismiss an overlay, else return to Home,
  // else let the OS exit the app (prevents an accidental one-swipe exit).
  useBackHandler(() => {
    if (overlay) { setOverlay(null); return true; }
    if (tab !== "home") { setTab("home"); return true; }
    return false;
  });

  if (overlay?.kind === "control") return <Control device={overlay.device} onBack={() => setOverlay(null)} />;
  if (overlay?.kind === "add") return <AddDevice onClose={(added) => { setOverlay(null); if (added) refresh(); }} />;
  if (overlay?.kind === "notifications") return <Notifications onBack={() => setOverlay(null)} />;
  if (overlay?.kind === "weather") return <Weather onBack={() => setOverlay(null)} />;
  if (overlay?.kind === "search")
    return (
      <CommandPalette
        onClose={() => setOverlay(null)}
        onOpenDevice={(d) => setOverlay({ kind: "control", device: d })}
        onOpenAutomate={(sg) => { setOverlay(null); openAutomate(sg); }}
        onOpenEnergy={() => { setOverlay(null); setTab("energy"); }}
        onOpenDevices={() => { setOverlay(null); setTab("devices"); }}
        onOpenSettings={() => { setOverlay(null); setTab("settings"); }}
        onAddDevice={() => setOverlay({ kind: "add" })}
      />
    );

  const openControl = (d: Device) => setOverlay({ kind: "control", device: d });
  const openAutomate = (s?: Seg) => { setSeg(s ?? "scenes"); setTab("automate"); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        {tab === "home" && (
          <Home
            onOpenDevice={openControl}
            onOpenNotifications={() => setOverlay({ kind: "notifications" })}
            onOpenSettings={() => setTab("settings")}
            onOpenAutomate={openAutomate}
            onOpenEnergy={() => setTab("energy")}
            onAddDevice={() => setOverlay({ kind: "add" })}
            onOpenSearch={() => setOverlay({ kind: "search" })}
            onOpenWeather={() => setOverlay({ kind: "weather" })}
          />
        )}
        {tab === "devices" && <Devices onOpen={openControl} onAdd={() => setOverlay({ kind: "add" })} />}
        {tab === "automate" && <Automate key={seg} initial={seg} />}
        {tab === "energy" && <Energy />}
        {tab === "settings" && <Settings />}
        {tab === "more" && (
          <More
            onOpenDevice={openControl}
            onOpenAutomate={openAutomate}
            onAddDevice={() => setOverlay({ kind: "add" })}
            onOpenSettings={() => setTab("settings")}
            onOpenEnergy={() => setTab("energy")}
            onOpenDevices={() => setTab("devices")}
          />
        )}
      </View>

      <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={s.tab} onPress={() => setTab(t.key)} hitSlop={6}>
              <Text style={{ fontSize: 20, opacity: active ? 1 : 0.5 }}>{t.glyph}</Text>
              <Text style={{ color: active ? c.accent : c.faint, fontSize: 11, fontWeight: active ? "800" : "600", marginTop: 2 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 26 : 10,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
});
