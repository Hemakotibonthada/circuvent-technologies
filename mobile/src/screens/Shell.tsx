import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Device } from "../api";
import { useDevices } from "../store";
import { useTheme, useBackHandler, useSafeArea, SwipeBack } from "../ui";
import { elevate } from "../theme";
import { Icon, type IconName } from "../icons";
import { tapLight } from "../haptics";
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
import Cameras from "./more/Cameras";

type Tab = "home" | "devices" | "cameras" | "automate" | "energy" | "settings" | "more";
type Seg = "scenes" | "rooms" | "automations";
type Overlay = { kind: "control"; device: Device } | { kind: "changewifi"; device: Device } | { kind: "add" } | { kind: "notifications" } | { kind: "search" } | { kind: "weather" } | { kind: "kiosk" } | null;

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "devices", label: "Devices", icon: "devices" },
  { key: "cameras", label: "Cameras", icon: "camera" },
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
  /* Which room to open on arrival, when the user got here by searching for it. */
  const [room, setRoom] = useState<string | undefined>(undefined);
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Clearance so scrolled content ends above the floating nav rather than
  // behind it — the bar itself, its inset from the bottom, and the home
  // indicator / gesture area underneath.
  const navBottom = insets.bottom + 16;
  const navSpace = NAV_HEIGHT + navBottom + 18;

  // Android hardware/gesture back: dismiss an overlay, else return to Home,
  // else let the OS exit the app (prevents an accidental one-swipe exit).
  //
  // goBack is shared with the iOS edge swipe below so the two can never drift
  // into doing different things from the same intent.
  const goBack = () => {
    if (overlay) { setOverlay(null); return true; }
    if (tab !== "home") { setTab("home"); return true; }
    return false;
  };
  useBackHandler(goBack);

  // iOS has no back button and no system back gesture, so without this every
  // overlay is a dead end unless the on-screen arrow is found. `canGoBack`
  // keeps the gesture inert on Home, where there is nowhere to go.
  const canGoBack = overlay !== null || tab !== "home";
  const swipe = (node: React.ReactNode) => (
    <SwipeBack onBack={() => goBack()} enabled={canGoBack}>{node}</SwipeBack>
  );

  /*
   * Declared before the early returns below, not after them.
   *
   * These are `const` arrow functions, so they are only initialised when
   * execution reaches them. The overlay branches below return early — so in a
   * render that shows the command palette, execution never got this far and
   * the binding stayed in the temporal dead zone. The palette's callback still
   * closed over it happily, because nothing evaluates it until a tap: opening
   * search worked, and tapping a room in the results crashed the app with
   * "undefined is not a function".
   *
   * Anything referenced by an overlay's props has to be defined above the
   * overlay's return.
   */
  const openControl = (d: Device) => setOverlay({ kind: "control", device: d });
  const openAutomate = (s?: Seg, room?: string) => { setSeg(s ?? "scenes"); setRoom(room); setTab("automate"); };

  if (overlay?.kind === "control") return swipe(<Control device={overlay.device} onBack={() => setOverlay(null)} />);
  if (overlay?.kind === "changewifi") return swipe(<ChangeWifi device={overlay.device} onBack={() => { setOverlay(null); refresh(); }} />);
  if (overlay?.kind === "add") return swipe(<AddDevice onClose={(added) => { setOverlay(null); if (added) refresh(); }} />);
  if (overlay?.kind === "notifications") return swipe(<Notifications onBack={() => setOverlay(null)} />);
  if (overlay?.kind === "weather") return swipe(<Weather onBack={() => setOverlay(null)} />);
  // Kiosk is deliberately excluded: it is a wall-mounted display mode, and a
  // stray swipe from someone walking past should not drop it back to the app.
  if (overlay?.kind === "kiosk") return <Kiosk onExit={() => setOverlay(null)} />;
  if (overlay?.kind === "search")
    return swipe(
      <CommandPalette
        onClose={() => setOverlay(null)}
        onOpenDevice={(d) => setOverlay({ kind: "control", device: d })}
        onOpenAutomate={(sg, rm) => { setOverlay(null); openAutomate(sg, rm); }}
        onOpenEnergy={() => { setOverlay(null); setTab("energy"); }}
        onOpenDevices={() => { setOverlay(null); setTab("devices"); }}
        onOpenSettings={() => { setOverlay(null); setTab("settings"); }}
        onAddDevice={() => setOverlay({ kind: "add" })}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SwipeBack onBack={() => goBack()} enabled={canGoBack} style={{ paddingBottom: navSpace }}>
        {tab === "home" && (
          <Home
            onOpenDevice={openControl}
            onOpenDevices={() => setTab("devices")}
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
        {/*
          Cameras is a tab rather than a page inside More because watching is a
          thing people come to the app to do, not a setting they go looking for.
          It keeps its own back affordance so the screen still works when More
          opens it, which it still can.
        */}
        {tab === "cameras" && <Cameras onBack={() => setTab("home")} />}
        {tab === "automate" && <Automate key={`${seg}:${room ?? ""}`} initial={seg} initialRoom={room} />}
        {tab === "energy" && <Energy />}
        {tab === "settings" && <Settings onKiosk={() => setOverlay({ kind: "kiosk" })} onChangeWifi={(d) => setOverlay({ kind: "changewifi", device: d })} />}
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
      </SwipeBack>

      <View style={[s.navWrap, { bottom: navBottom }]} pointerEvents="box-none">
        <Pressable
          onPress={() => { if (tab !== "home") tapLight(); setTab("home"); }}
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
            // Material's drop shadow is not what a neumorphic bar does. Its
            // presence under the extrusion is the "3D effect" that made this
            // look like a different design language on Android.
            elevate(c.isNeo, 8),
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
                onPress={() => { if (!active) tapLight(); setTab(t.key); }}
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
  /*
   * The gutters, the gap and the home button are all space the pills do not
   * get. With six pills sharing what is left, a 320dp screen — the narrowest
   * Android supports, and what the large-display accessibility setting produces
   * on a bigger phone — left each tab under the 48dp minimum. Reclaiming 18dp
   * here puts every tab back above it on every width.
   *
   * Widening hitSlop instead would have been wrong: the pills are adjacent, so
   * slop past half the spacing overlaps a neighbour, and the sibling drawn
   * later wins that overlap. A tab that steals the tap meant for the one beside
   * it is worse than a tab that is slightly small.
   *
   * scripts/check-nav-targets.js does this arithmetic on every common width and
   * fails below 48dp, so the next tab someone adds cannot shrink these quietly.
   */
  navWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  homeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    // elevation is applied per-instance via elevate(), so a neumorphic
    // theme can leave it off. See theme.ts.

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
    // elevation is applied per-instance via elevate(), so a neumorphic
    // theme can leave it off. See theme.ts.

  },
  navPillFill: { borderRadius: 31 },
  navItem: { flex: 1, height: NAV_HEIGHT, alignItems: "center", justifyContent: "center" },
  navDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
});
