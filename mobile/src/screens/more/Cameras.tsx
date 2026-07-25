import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, RefreshControl } from "react-native";
import { Screen, Card, SectionLabel, useTheme, IconButton, useBackHandler, useToast, ToastHost } from "../../ui";
import { useDevices } from "../../store";
import { api } from "../../api";
import {
  getUserCameras, addCamera, removeCamera, mergedCameras, snapshotUrl,
  type Camera,
} from "../../cameras";

const FPS_OPTIONS = [1, 5, 15, 30];

export default function Cameras({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { devices } = useDevices();
  const toast = useToast();
  const [user, setUser] = useState<Camera[]>([]);
  const [live, setLive] = useState<Camera | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => { setUser(await getUserCameras()); }, []);
  useEffect(() => { reload(); }, [reload]);

  useBackHandler(() => {
    if (live) { setLive(null); return true; }
    if (adding) { setAdding(false); return true; }
    onBack();
    return true;
  });

  const cams = mergedCameras(devices, user);

  if (live) return <LiveView cam={live} onBack={() => setLive(null)} />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accentHi} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800", flex: 1 }}>Cameras</Text>
          <IconButton glyph="＋" onPress={() => setAdding(true)} />
        </View>

        {adding && <AddCamera devices={devices} c={c} onDone={async (cam) => { if (cam) { setUser(await addCamera(cam)); toast.show("Camera added", "success"); } setAdding(false); }} />}

        {cams.length === 0 && !adding ? (
          <Card padded style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 40 }}>📷</Text>
            <Text style={{ color: c.textDim, marginTop: 12, textAlign: "center" }}>No cameras yet.{"\n"}Add an IP camera URL or a Circuvent camera device.</Text>
            <Pressable onPress={() => setAdding(true)} style={{ marginTop: 16, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 }}>
              <Text style={{ color: c.onAccent || "#fff", fontWeight: "800" }}>＋ Add camera</Text>
            </Pressable>
          </Card>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {cams.map((cam) => (
              <CameraTile key={cam.id} cam={cam} c={c} devices={devices}
                onOpen={() => setLive(cam)}
                onRemove={cam.kind === "url" ? async () => { setUser(await removeCamera(cam.id)); } : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

function CameraTile({ cam, c, devices, onOpen, onRemove }: { cam: Camera; c: ReturnType<typeof useTheme>["c"]; devices: ReturnType<typeof useDevices>["devices"]; onOpen: () => void; onRemove?: () => void }) {
  const online = cam.kind === "device" ? devices.find((d) => d.id === cam.deviceId)?.online !== false : true;
  return (
    <Pressable onPress={onOpen} style={{ width: "47%" }}>
      <Card padded style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ aspectRatio: 16 / 9, backgroundColor: "#0b1220", alignItems: "center", justifyContent: "center" }}>
          <Thumb cam={cam} />
          <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: online ? c.green : c.red }} />
            <Text style={{ color: online ? c.green : c.red, fontSize: 10, fontWeight: "800" }}>{online ? "LIVE" : "OFF"}</Text>
          </View>
        </View>
        <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: "700" }} numberOfLines={1}>{cam.name}</Text>
            <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>{cam.room || (cam.kind === "device" ? "Device" : "IP camera")}</Text>
          </View>
          {onRemove && <Pressable onPress={onRemove} hitSlop={8}><Text style={{ color: c.faint }}>🗑️</Text></Pressable>}
        </View>
      </Card>
    </Pressable>
  );
}

// A slow-refreshing thumbnail so the grid feels live without hammering the cams.
function Thumb({ cam }: { cam: Camera }) {
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
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [cam]);
  if (!uri) return <Text style={{ fontSize: 26 }}>📷</Text>;
  return <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />;
}

function LiveView({ cam, onBack }: { cam: Camera; onBack: () => void }) {
  const { c } = useTheme();
  const { command } = useDevices();
  const [uri, setUri] = useState<string | null>(null);
  const [fps, setFps] = useState(15);
  const [streaming, setStreaming] = useState(true);
  const [frames, setFrames] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useBackHandler(() => { onBack(); return true; });

  // For device cameras, ask the firmware to start/stop pushing frames.
  useEffect(() => {
    if (cam.kind === "device" && cam.deviceId) {
      command(cam.deviceId, { action: "stream", on: true, fps });
      return () => { command(cam.deviceId!, { action: "stream", on: false }); };
    }
  }, [cam, command, fps]);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!streaming) return;
    const interval = Math.max(200, Math.round(1000 / fps));
    const tick = async () => {
      if (cam.kind === "url" && cam.url) { setUri(snapshotUrl(cam.url)); setFrames((f) => f + 1); }
      else if (cam.kind === "device" && cam.deviceId) {
        try {
          const r = await api.telemetry(cam.deviceId, 1);
          const jpg = r.ok ? (r.data.telemetry?.[0]?.payload as { jpg?: string })?.jpg : undefined;
          if (jpg) { setUri(`data:image/jpeg;base64,${jpg}`); setFrames((f) => f + 1); }
        } catch { /* ignore */ }
      }
    };
    tick();
    timer.current = setInterval(tick, interval);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [cam, fps, streaming]);

  const snapshot = () => { if (cam.kind === "device" && cam.deviceId) command(cam.deviceId, { action: "snapshot" }); };

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: 44 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 10 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800", flex: 1 }} numberOfLines={1}>{cam.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: streaming ? c.green : c.faint }} />
            <Text style={{ color: streaming ? c.green : c.faint, fontSize: 12, fontWeight: "700" }}>{streaming ? "LIVE" : "PAUSED"}</Text>
          </View>
        </View>

        <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", marginHorizontal: 12, borderRadius: 16, overflow: "hidden" }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" fadeDuration={0} />
          ) : (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator color={c.accentHi} />
              <Text style={{ color: c.faint, marginTop: 10 }}>{cam.kind === "device" ? "Waiting for frames…" : "Connecting to camera…"}</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => setStreaming((s) => !s)} style={{ flex: 1, backgroundColor: streaming ? c.card : c.accent, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
              <Text style={{ color: streaming ? c.text : c.onAccent || "#fff", fontWeight: "800" }}>{streaming ? "⏸ Pause" : "▶ Resume"}</Text>
            </Pressable>
            <Pressable onPress={snapshot} style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
              <Text style={{ color: c.text, fontWeight: "800" }}>📸 Snapshot</Text>
            </Pressable>
          </View>
          <View>
            <SectionLabel>FRAME RATE</SectionLabel>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {FPS_OPTIONS.map((f) => (
                <Pressable key={f} onPress={() => setFps(f)} style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: fps === f ? c.accent : c.card, borderColor: fps === f ? c.accent : c.border, borderWidth: 1 }}>
                  <Text style={{ color: fps === f ? c.onAccent || "#fff" : c.textDim, fontWeight: "700" }}>{f} fps</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={{ color: c.faint, fontSize: 12, textAlign: "center" }}>{frames} frames · {cam.kind === "device" ? "MQTT stream" : cam.url}</Text>
        </View>
      </View>
    </Screen>
  );
}

function AddCamera({ devices, c, onDone }: { devices: ReturnType<typeof useDevices>["devices"]; c: ReturnType<typeof useTheme>["c"]; onDone: (cam: Omit<Camera, "id"> | null) => void }) {
  const [kind, setKind] = useState<"url" | "device">("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("http://");
  const [deviceId, setDeviceId] = useState("");
  const [room, setRoom] = useState("");
  const camDevices = devices.filter((d) => /cam|cctv|doorbell/i.test(d.type));

  const save = () => {
    if (!name.trim()) return;
    if (kind === "url") { if (!/^https?:\/\/\S+/.test(url)) return; onDone({ name: name.trim(), kind: "url", url: url.trim(), room: room.trim() || undefined }); }
    else { if (!deviceId) return; onDone({ name: name.trim(), kind: "device", deviceId, room: room.trim() || undefined }); }
  };

  return (
    <Card padded style={{ marginBottom: 16 }}>
      <SectionLabel>ADD CAMERA</SectionLabel>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["url", "device"] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: kind === k ? c.accent : c.card, borderColor: kind === k ? c.accent : c.border, borderWidth: 1 }}>
            <Text style={{ color: kind === k ? c.onAccent || "#fff" : c.textDim, fontWeight: "700" }}>{k === "url" ? "IP camera URL" : "Circuvent device"}</Text>
          </Pressable>
        ))}
      </View>
      <Input c={c} label="Name" value={name} onChangeText={setName} placeholder="e.g. Front door" />
      {kind === "url" ? (
        <Input c={c} label="Snapshot / MJPEG URL" value={url} onChangeText={setUrl} placeholder="http://192.168.1.50/capture" autoCapitalize="none" />
      ) : camDevices.length ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: c.textDim, fontSize: 12, marginBottom: 6 }}>Device</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {camDevices.map((d) => (
              <Pressable key={d.id} onPress={() => setDeviceId(d.id)} style={{ borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: deviceId === d.id ? c.accent : c.card, borderColor: deviceId === d.id ? c.accent : c.border, borderWidth: 1 }}>
                <Text style={{ color: deviceId === d.id ? c.onAccent || "#fff" : c.textDim }}>{d.name || d.id}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Text style={{ color: c.faint, marginBottom: 10 }}>No camera devices found. Add one via Add device, or use an IP camera URL.</Text>
      )}
      <Input c={c} label="Room (optional)" value={room} onChangeText={setRoom} placeholder="Living room" />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <Pressable onPress={() => onDone(null)} style={{ flex: 1, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: c.textDim, fontWeight: "700" }}>Cancel</Text></Pressable>
        <Pressable onPress={save} style={{ flex: 1, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: c.onAccent || "#fff", fontWeight: "800" }}>Add</Text></Pressable>
      </View>
    </Card>
  );
}

function Input({ c, label, ...props }: { c: ReturnType<typeof useTheme>["c"]; label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: c.textDim, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput placeholderTextColor={c.faint} style={{ color: c.text, backgroundColor: c.cardHi, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: c.border }} {...props} />
    </View>
  );
}
