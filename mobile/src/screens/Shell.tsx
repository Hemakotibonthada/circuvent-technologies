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
import ChangeWifi from "./ChangeWifi";
import Notifications from "./Notifications";
import AddDevice from "./AddDevice";
import More from "./More";
import CommandPalette from "./CommandPalette";
import Weather from "./Weather";
import Kiosk from "./Kiosk";

type Tab = "home" | "devices" | "automate" | "energy" | "settings" | "more";
type Seg = "scenes" | "rooms" | "automations";
type Overlay = { kind: "control"; device: Device } | { kind: "changewifi"; device: Device } | { kind: "add" } | { kind: "notifications" } | { kind: "search" } | { kind: "weather" } | { kind: "kiosk" } | null;

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "home", label: "Home", glyph: "🏠" },
  { key: "devices", label: "Devices", glyph: "📟" },
  { key: "automate", label: "Automate", glyph: "✨" },
  { key: "energy", label: "Energy", glyph: "⚡" },
  { key: "settings", label: "Settings", glyph: "⚙️" },
  { key: "more", label: "More", glyph: "🧩" },
];
const PILL_TABS = TABS.filter((t) => t.key !== "home");
const NAV_SPACE = Platform.OS === "ios" ? 104 : 92;

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

  if (overlay?.kind === "control") return <Control device={overlay.device} onBack={() => setOverlay(null)} onChangeWifi={(d) => setOverlay({ kind: "changewifi", device: d })} />;
  if (overlay?.kind === "changewifi") return <ChangeWifi device={overlay.device} onBack={() => { setOverlay(null); refresh(); }} />;
  if (overlay?.kind === "add") return <AddDevice onClose={(added) => { setOverlay(null); if (added) refresh(); }} />;
  if (overlay?.kind === "notifications") return <Notifications onBack={() => setOverlay(null)} />;
  if (overlay?.kind === "weather") return <Weather onBack={() => setOverlay(null)} />;
  if (overlay?.kind === "kiosk") return <Kiosk onExit={() => setOverlay(null)} />;
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
      <View style={{ flex: 1, paddingBottom: NAV_SPACE }}>
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
        {tab === "settings" && <Settings onKiosk={() => setOverlay({ kind: "kiosk" })} />}
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

      <View style={s.navWrap} pointerEvents="box-none">
        <Pressable
          onPress={() => setTab("home")}
          hitSlop={8}
          style={[s.homeBtn, { backgroundColor: c.accent, shadowColor: c.accent, borderWidth: tab === "home" ? 3 : 0, borderColor: "#ffffff" }]}
        >
          <Text style={{ fontSize: 24 }}>🏠</Text>
        </Pressable>
        <View style={s.navPill}>
          {PILL_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} style={s.navItem} onPress={() => setTab(t.key)} hitSlop={6}>
                <Text style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{t.glyph}</Text>
                <View style={[s.navDot, { backgroundColor: active ? c.accentHi : "transparent" }]} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  navWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: Platform.OS === "ios" ? 30 : 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  homeBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  navPill: {
    flex: 1,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#1E1E22",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  navItem: { flex: 1, height: 62, alignItems: "center", justifyContent: "center" },
  navDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
});
