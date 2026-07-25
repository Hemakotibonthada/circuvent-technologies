import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, AppState, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, useBackHandler } from "../ui";
import { useDevices } from "../store";
import { deviceMeta } from "../theme";
import { getUserCameras, mergedCameras, snapshotUrl, type Camera } from "../cameras";
import { api } from "../api";

// Wall-kiosk mode for a dedicated tablet: fullscreen, screen kept awake,
// back/exit locked behind a PIN, showing a live home dashboard + a camera
// matrix + quick appliance controls. Keep-awake is loaded defensively so the
// screen still works if the module isn't linked.
let KeepAwake: { activateKeepAwakeAsync?: () => void; deactivateKeepAwake?: () => void } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  KeepAwake = require("expo-keep-awake");
} catch {
  KeepAwake = null;
}

const PIN_KEY = "cv-kiosk-pin";

// Slow-refreshing live thumbnail for the kiosk camera matrix.
function KioskThumb({ cam }: { cam: Camera }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (cam.kind === "url" && cam.url) setUri(snapshotUrl(cam.url));
      else if (cam.kind === "device" && cam.deviceId) {
        try {
          const r = await api.telemetry(cam.deviceId, 1);
          const jpg = r.ok ? (r.data.telemetry?.[0]?.payload as { jpg?: string })?.jpg : undefined;
          if (alive && jpg) setUri(`data:image/jpeg;base64,${jpg}`);
        } catch { /* ignore */ }
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [cam]);
  if (!uri) return <Text style={{ fontSize: 24 }}>📷</Text>;
  return <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" fadeDuration={0} />;
}

export default function Kiosk({ onExit }: { onExit: () => void }) {
  const { c } = useTheme();
  const { devices, command } = useDevices();
  const [now, setNow] = useState(new Date());
  const [askPin, setAskPin] = useState(false);
  const [entry, setEntry] = useState("");
  const [err, setErr] = useState("");
  const pinRef = useRef<string>("1234");
  const [cams, setCams] = useState<Camera[]>([]);

  useEffect(() => { getUserCameras().then((u) => setCams(mergedCameras(devices, u).slice(0, 6))); }, [devices]);

  useEffect(() => {
    AsyncStorage.getItem(PIN_KEY).then((v) => { if (v) pinRef.current = v; });
    try { KeepAwake?.activateKeepAwakeAsync?.(); } catch { /* ignore */ }
    const t = setInterval(() => setNow(new Date()), 1000);
    // re-assert keep-awake when returning to foreground
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { try { KeepAwake?.activateKeepAwakeAsync?.(); } catch { /* ignore */ } } });
    return () => { clearInterval(t); sub.remove(); try { KeepAwake?.deactivateKeepAwake?.(); } catch { /* ignore */ } };
  }, []);

  // Block hardware back — the only way out is the PIN.
  useBackHandler(() => { setAskPin(true); return true; });

  const favorites = devices.filter((d) => d.favorite);
  const grid = favorites.length ? favorites : devices.slice(0, 8);

  const toggle = (id: string, type: string, state: Record<string, unknown>) => {
    const meta = deviceMeta(type);
    if (!meta.toggle) return;
    const f = meta.toggle.field;
    command(id, { action: "set", [f]: !state[f] });
  };

  const submitPin = () => {
    if (entry === pinRef.current) { setAskPin(false); setEntry(""); setErr(""); onExit(); }
    else { setErr("Wrong PIN"); setEntry(""); }
  };

  const hh = now.getHours(), mm = now.getMinutes();
  const time = `${((hh % 12) || 12)}:${String(mm).padStart(2, "0")}`;
  const ampm = hh < 12 ? "AM" : "PM";
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 40 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Clock header */}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <Text style={{ color: c.text, fontSize: 72, fontWeight: "900", lineHeight: 76 }}>{time}<Text style={{ fontSize: 28, color: c.textDim }}> {ampm}</Text></Text>
          <Text style={{ color: c.textDim, fontSize: 16, marginTop: 2 }}>{dateStr}</Text>
        </View>

        {/* Camera matrix */}
        <Text style={{ color: c.faint, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Cameras</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          {cams.length === 0 ? (
            <View style={{ width: "100%", aspectRatio: 32 / 9, borderRadius: 14, backgroundColor: "#0b1220", borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.faint, fontSize: 13 }}>No cameras added — add them in More › Cameras</Text>
            </View>
          ) : cams.map((cam) => {
            const online = cam.kind === "device" ? devices.find((d) => d.id === cam.deviceId)?.online !== false : true;
            return (
              <View key={cam.id} style={{ width: "47%", aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: "#0b1220", borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <KioskThumb cam={cam} />
                <View style={{ position: "absolute", bottom: 6, left: 8 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{cam.name}</Text></View>
                <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: online ? c.green : c.red }} />
                  <Text style={{ color: online ? c.green : c.red, fontSize: 10, fontWeight: "700" }}>{online ? "LIVE" : "OFF"}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Appliance quick controls */}
        <Text style={{ color: c.faint, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Controls</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {grid.map((d) => {
            const meta = deviceMeta(d.type);
            const on = meta.toggle ? !!d.state[meta.toggle.field] : false;
            return (
              <Pressable key={d.id} onPress={() => toggle(d.id, d.type, d.state)} style={{ width: "47%", borderRadius: 16, padding: 16, backgroundColor: on ? meta.accent : c.card, borderWidth: 1, borderColor: on ? meta.accent : c.border }}>
                <Text style={{ fontSize: 28 }}>{meta.glyph}</Text>
                <Text style={{ color: on ? "#04121a" : c.text, fontWeight: "800", fontSize: 15, marginTop: 8 }} numberOfLines={1}>{d.name || d.id}</Text>
                <Text style={{ color: on ? "#04121a" : c.faint, fontSize: 12, marginTop: 2 }}>{meta.toggle ? (on ? "On" : "Off") : meta.label}</Text>
              </Pressable>
            );
          })}
          {grid.length === 0 && <Text style={{ color: c.faint }}>No devices yet.</Text>}
        </View>
      </ScrollView>

      {/* Exit (locked) */}
      <Pressable onPress={() => setAskPin(true)} style={{ position: "absolute", top: 44, right: 16, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text style={{ color: c.textDim, fontWeight: "700" }}>🔒 Exit</Text>
      </Pressable>

      {askPin && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800", marginBottom: 4 }}>Enter kiosk PIN</Text>
          <Text style={{ color: c.faint, fontSize: 12, marginBottom: 16 }}>{err || "Default is 1234 (change in Settings)"}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: entry.length > i ? c.accent : "transparent", borderWidth: 1, borderColor: c.border }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", width: 240, gap: 12, justifyContent: "center" }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
              <Pressable
                key={k}
                onPress={() => {
                  if (k === "⌫") setEntry((e) => e.slice(0, -1));
                  else if (k === "OK") submitPin();
                  else if (entry.length < 4) { const next = entry + k; setEntry(next); if (next.length === 4) setTimeout(() => { if (next === pinRef.current) { setAskPin(false); setEntry(""); setErr(""); onExit(); } else { setErr("Wrong PIN"); setEntry(""); } }, 120); }
                }}
                style={{ width: 68, height: 60, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: k === "OK" ? c.accentHi : c.text, fontSize: 22, fontWeight: "700" }}>{k}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => { setAskPin(false); setEntry(""); setErr(""); }} style={{ marginTop: 20 }}>
            <Text style={{ color: c.faint }}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
