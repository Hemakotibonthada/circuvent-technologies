import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Device } from "../api";
import { useDevices } from "../store";
import { useTheme, useBackHandler, useSafeArea } from "../ui";
import { Icon, type IconName } from "../icons";
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

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "devices", label: "Devices", icon: "devices" },
  { key: "automate", label: "Automate", icon: "automate" },
  { key: "energy", label: "Energy", icon: "energy" },
  { key: "settings", label: "Settings", icon: "settings" },
  { key: "more", label: "More", icon: "more" },
];
const PILL_TABS = TABS.filter((t) => t.key !== "home");
const NAV_HEIGHT = 62;

export default function Shell() {
  const { c, scheme } = useTheme();
  const insets = useSafeArea();
  const { refresh } = useDevices();
  const [tab, setTab] = useState<Tab>("home");
  const [seg, setSeg] = useState<Seg>("scenes");
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Clearance so scrolled content ends above the floating nav rather than
  // behind it — the bar itself, its inset from the bottom, and the home
  // indicator / gesture area underneath.
  const navBottom = insets.bottom + 16;
  const navSpace = NAV_HEIGHT + navBottom + 18;

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
      <View style={{ flex: 1, paddingBottom: navSpace }}>
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

      <View style={[s.navWrap, { bottom: navBottom }]} pointerEvents="box-none">
        <Pressable
          onPress={() => setTab("home")}
          hitSlop={8}
          accessibilityRole="tab"
          accessibilityLabel="Home"
          accessibilityState={{ selected: tab === "home" }}
          android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: true, radius: 34 }}
          style={({ pressed }) => [
            s.homeBtn,
            {
              backgroundColor: c.accent,
              shadowColor: c.accent,
              borderWidth: tab === "home" ? 3 : 0,
              borderColor: c.bg,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          <Icon name="home" size={24} color={c.onAccent} />
        </Pressable>
        <View
          style={[
            s.navPill,
            {
              backgroundColor: c.isGlass ? "transparent" : c.card,
              borderColor: c.isGlass ? c.glassBorder : c.border,
            },
          ]}
        >
          {c.isGlass && (
            <>
              <BlurView intensity={scheme === "dark" ? 55 : 70} tint={c.glassTint} style={[StyleSheet.absoluteFill, s.navPillFill]} />
              <View style={[StyleSheet.absoluteFill, s.navPillFill, { backgroundColor: c.surfaceHi }]} />
            </>
          )}
          {PILL_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={s.navItem}
                onPress={() => setTab(t.key)}
                hitSlop={6}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: active }}
                android_ripple={{ color: c.borderHi, borderless: true, radius: 28 }}
              >
                <Icon name={t.icon} size={21} color={active ? c.accentHi : c.faint} />
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
    height: NAV_HEIGHT,
    borderRadius: 31,
    borderWidth: 1,
    overflow: "hidden",
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
  navPillFill: { borderRadius: 31 },
  navItem: { flex: 1, height: NAV_HEIGHT, alignItems: "center", justifyContent: "center" },
  navDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
});
