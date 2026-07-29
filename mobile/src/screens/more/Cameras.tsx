import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, RefreshControl } from "react-native";
import {
  Screen, Card, SectionLabel, useTheme, IconButton, useBackHandler, useToast, ToastHost,
  EmptyState, PillToggle, PillSelector, Divider,
} from "../../ui";
import { Icon } from "../../icons";
import { useDevices } from "../../store";
import { api, type Device } from "../../api";
import { useCameraFrames } from "../../live";
import {
  getUserCameras, addCamera, removeCamera, mergedCameras, snapshotUrl,
  type Camera,
} from "../../cameras";

// The firmware clamps to 15fps — offering 30 would just look broken.
const FPS_OPTIONS = [1, 5, 10, 15] as const;
const RESOLUTIONS = ["QVGA", "CIF", "VGA", "SVGA", "XGA"] as const;
const FLASH_STEPS = { Off: 0, Low: 25, Med: 60, Max: 100 } as const;
type FlashLabel = keyof typeof FLASH_STEPS;

/** The device must hear from us at least this often or it stops streaming. */
const REARM_MS = 8000;

type Colors = ReturnType<typeof useTheme>["c"];

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
          <IconButton icon="back" onPress={onBack} label="Back" />
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800", flex: 1 }}>Cameras</Text>
          <IconButton icon="add" onPress={() => setAdding(true)} label="Add camera" />
        </View>

        {adding && <AddCamera devices={devices} c={c} onDone={async (cam) => { if (cam) { setUser(await addCamera(cam)); toast.show("Camera added", "success"); } setAdding(false); }} />}

        {cams.length === 0 && !adding ? (
          <EmptyState
            icon="camera"
            title="No cameras yet"
            subtitle="Add an IP camera URL, or set up a Circuvent camera device."
            actionLabel="Add camera"
            onAction={() => setAdding(true)}
          />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {cams.map((cam) => (
              <CameraTile key={cam.id} cam={cam} c={c} devices={devices}
                onOpen={() => setLive(cam)}
                onRemove={cam.kind === "url" ? async () => { setUser(await removeCamera(cam.id)); toast.show("Camera removed", "info"); } : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

// ---------------------------------------------------------------- grid tile ---

function CameraTile({ cam, c, devices, onOpen, onRemove }: {
  cam: Camera; c: Colors; devices: Device[]; onOpen: () => void; onRemove?: () => void;
}) {
  const dev = cam.kind === "device" ? devices.find((d) => d.id === cam.deviceId) : undefined;
  const online = cam.kind === "device" ? dev?.online !== false : true;
  const motion = dev?.state?.motionActive === true;

  const status = !online ? "Offline" : motion ? "Motion" : "Live";
  const statusColor = !online ? c.faint : motion ? c.amber : c.green;

  return (
    <Pressable onPress={onOpen} style={{ width: "47%" }} accessibilityRole="button" accessibilityLabel={`Open ${cam.name}`}>
      <Card padded style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ aspectRatio: 16 / 9, backgroundColor: "#0b1220", alignItems: "center", justifyContent: "center" }}>
          <Poster cam={cam} online={online} c={c} />
          <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 10, fontWeight: "800" }}>{status}</Text>
          </View>
        </View>
        <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: "700" }} numberOfLines={1}>{cam.name}</Text>
            <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>{cam.room || (cam.kind === "device" ? "Circuvent device" : "IP camera")}</Text>
          </View>
          {onRemove && (
            <Pressable onPress={onRemove} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove ${cam.name}`}>
              <Icon name="trash" size={16} color={c.faint} />
            </Pressable>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * A still for the grid.
 *
 * Device cameras are *not* streamed here — showing six live feeds at once would
 * saturate both the boards and the phone. Instead each tile asks for a single
 * snapshot, holds the watch open only until that one frame lands, and repeats
 * infrequently. URL cameras just re-fetch their snapshot endpoint.
 */
function Poster({ cam, online, c }: { cam: Camera; online: boolean; c: Colors }) {
  const [uri, setUri] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useCameraFrames(waiting ? cam.deviceId ?? null : null, (f) => {
    setUri(`data:image/jpeg;base64,${f.jpeg}`);
    setWaiting(false);
  });

  useEffect(() => {
    let alive = true;
    let giveUp: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (!alive) return;
      if (cam.kind === "url" && cam.url) { setUri(snapshotUrl(cam.url)); return; }
      if (cam.kind !== "device" || !cam.deviceId || !online) return;
      setWaiting(true);
      void api.command(cam.deviceId, { action: "snapshot" });
      // Release the watch even if the camera never answers, so an offline
      // board can't pin a subscription open forever.
      giveUp = setTimeout(() => { if (alive) setWaiting(false); }, 6000);
    };

    tick();
    const t = setInterval(tick, cam.kind === "url" ? 5000 : 30000);
    return () => {
      alive = false;
      clearInterval(t);
      if (giveUp) clearTimeout(giveUp);
    };
  }, [cam.kind, cam.url, cam.deviceId, online]);

  if (!uri) {
    return (
      <View style={{ alignItems: "center", gap: 6 }}>
        <Icon name="camera" size={22} color={online ? c.textDim : c.faint} />
        {waiting && <ActivityIndicator size="small" color={c.accentHi} />}
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />;
}

// ---------------------------------------------------------------- live view ---

function LiveView({ cam, onBack }: { cam: Camera; onBack: () => void }) {
  const { c } = useTheme();
  const { devices } = useDevices();
  const toast = useToast();
  const isDevice = cam.kind === "device" && !!cam.deviceId;
  const dev = isDevice ? devices.find((d) => d.id === cam.deviceId) : undefined;
  const st = (dev?.state ?? {}) as Record<string, unknown>;

  const [uri, setUri] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(Number(st.fps) || 10);
  const [streaming, setStreaming] = useState(true);
  const [frames, setFrames] = useState(0);
  const [measured, setMeasured] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Measured fps: count frames in a rolling window rather than echoing the
  // requested rate, so the number tells the truth about the link.
  const window = useRef<number[]>([]);

  useBackHandler(() => { onBack(); return true; });

  useCameraFrames(isDevice && streaming ? cam.deviceId : null, (f) => {
    setUri(`data:image/jpeg;base64,${f.jpeg}`);
    setFrames((n) => n + 1);
    const now = Date.now();
    const w = window.current;
    w.push(now);
    while (w.length && now - w[0] > 3000) w.shift();
    setMeasured(w.length / 3);
  });

  // The stream is a lease: keep renewing it while the view is open, and let it
  // lapse the moment we leave so a backgrounded app never keeps a board hot.
  useEffect(() => {
    if (!isDevice || !cam.deviceId || !streaming) return;
    const id = cam.deviceId;
    const arm = () => { void api.command(id, { action: "stream", on: true, fps }); };
    arm();
    const t = setInterval(arm, REARM_MS);
    return () => {
      clearInterval(t);
      void api.command(id, { action: "stream", on: false });
    };
  }, [isDevice, cam.deviceId, streaming, fps]);

  // URL cameras have no push channel, so they still have to be polled.
  useEffect(() => {
    if (cam.kind !== "url" || !cam.url || !streaming) return;
    const url = cam.url;
    const tick = () => { setUri(snapshotUrl(url)); setFrames((n) => n + 1); };
    tick();
    const t = setInterval(tick, Math.max(200, Math.round(1000 / fps)));
    return () => clearInterval(t);
  }, [cam.kind, cam.url, fps, streaming]);

  const send = useCallback((cmd: Record<string, unknown>) => {
    if (cam.deviceId) void api.command(cam.deviceId, cmd);
  }, [cam.deviceId]);

  const flashLabel = (Object.keys(FLASH_STEPS) as FlashLabel[])
    .find((k) => FLASH_STEPS[k] === Number(st.flash ?? 0)) ?? "Off";

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: 44 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 10 }}>
          <IconButton icon="back" onPress={onBack} label="Back" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }} numberOfLines={1}>{cam.name}</Text>
            <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>
              {isDevice ? `${String(st.resolution ?? "—")} · ${measured.toFixed(1)} fps` : cam.url}
            </Text>
          </View>
          {isDevice && <IconButton icon="tune" onPress={() => setShowSettings((s) => !s)} label="Camera settings" />}
        </View>

        <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", marginHorizontal: 12, borderRadius: 16, overflow: "hidden" }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" fadeDuration={0} />
          ) : (
            <View style={{ alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={c.accentHi} />
              <Text style={{ color: c.faint }}>
                {!streaming ? "Paused" : isDevice ? "Waiting for the camera…" : "Connecting to camera…"}
              </Text>
            </View>
          )}

          {st.motionActive === true && (
            <View style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <Icon name="motion" size={13} color={c.amber} />
              <Text style={{ color: c.amber, fontSize: 11, fontWeight: "800" }}>Motion</Text>
            </View>
          )}
          <View style={{ position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: streaming ? c.green : c.faint }} />
            <Text style={{ color: streaming ? c.green : c.faint, fontSize: 11, fontWeight: "800" }}>{streaming ? "LIVE" : "PAUSED"}</Text>
          </View>
        </View>

        <ScrollView style={{ maxHeight: showSettings ? 330 : 220 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <ActionButton
              c={c}
              icon={streaming ? "pause" : "play"}
              label={streaming ? "Pause" : "Resume"}
              primary={!streaming}
              onPress={() => setStreaming((s) => !s)}
            />
            <ActionButton
              c={c}
              icon="camera"
              label="Snapshot"
              disabled={!isDevice}
              onPress={() => { send({ action: "snapshot" }); toast.show("Snapshot requested", "info"); }}
            />
          </View>

          <View>
            <SectionLabel>Frame rate</SectionLabel>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {FPS_OPTIONS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFps(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`${f} frames per second`}
                  style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: fps === f ? c.accent : c.card, borderColor: fps === f ? c.accent : c.border, borderWidth: 1 }}
                >
                  <Text style={{ color: fps === f ? c.onAccent || "#fff" : c.textDim, fontWeight: "700" }}>{f} fps</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {isDevice && showSettings && (
            <>
              <Divider />
              <View>
                <SectionLabel>Resolution</SectionLabel>
                <PillSelector
                  options={RESOLUTIONS}
                  value={(RESOLUTIONS as readonly string[]).includes(String(st.resolution)) ? (String(st.resolution) as typeof RESOLUTIONS[number]) : "VGA"}
                  onChange={(v) => send({ action: "set", resolution: v })}
                />
                {st.psram === false && (
                  <Text style={{ color: c.faint, fontSize: 11, marginTop: 6 }}>
                    This board has no PSRAM, so anything above VGA is capped automatically.
                  </Text>
                )}
              </View>

              <View>
                <SectionLabel>Illuminator</SectionLabel>
                <PillSelector
                  options={Object.keys(FLASH_STEPS) as FlashLabel[]}
                  value={flashLabel}
                  onChange={(v) => send({ action: "flash", level: FLASH_STEPS[v] })}
                />
              </View>

              <SettingRow c={c} icon="motion" title="Motion detection" subtitle={`${Number(st.motionCount ?? 0)} events since boot`}>
                <PillToggle value={st.motion !== false} onChange={(v) => send({ action: "set", motion: v })} />
              </SettingRow>

              <SettingRow c={c} icon="refresh" title="Rotate 180°" subtitle="For ceiling-mounted boards">
                <PillToggle value={Number(st.rotation ?? 0) === 180} onChange={(v) => send({ action: "set", rotation: v ? 180 : 0 })} />
              </SettingRow>

              <Text style={{ color: c.faint, fontSize: 11, textAlign: "center" }}>
                {frames} frames this session · {Number(st.dropped ?? 0)} dropped by the camera
              </Text>
            </>
          )}
        </ScrollView>
      </View>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

function ActionButton({ c, icon, label, onPress, primary, disabled }: {
  c: Colors; icon: React.ComponentProps<typeof Icon>["name"]; label: string;
  onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flex: 1, flexDirection: "row", gap: 8, minHeight: 48,
        backgroundColor: primary ? c.accent : c.card,
        borderColor: primary ? c.accent : c.border, borderWidth: 1,
        borderRadius: 12, alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={17} color={primary ? c.onAccent || "#fff" : c.text} />
      <Text style={{ color: primary ? c.onAccent || "#fff" : c.text, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function SettingRow({ c, icon, title, subtitle, children }: {
  c: Colors; icon: React.ComponentProps<typeof Icon>["name"];
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
      <Icon name={icon} size={18} color={c.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>{title}</Text>
        {!!subtitle && <Text style={{ color: c.faint, fontSize: 11 }}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

// -------------------------------------------------------------- add camera ---

function AddCamera({ devices, c, onDone }: { devices: Device[]; c: Colors; onDone: (cam: Omit<Camera, "id"> | null) => void }) {
  const [kind, setKind] = useState<"url" | "device">("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("http://");
  const [deviceId, setDeviceId] = useState("");
  const [room, setRoom] = useState("");
  const camDevices = devices.filter((d) => /cam|cctv|doorbell/i.test(d.type) || d.state?.hasCamera === true);

  const save = () => {
    if (!name.trim()) return;
    if (kind === "url") { if (!/^https?:\/\/\S+/.test(url)) return; onDone({ name: name.trim(), kind: "url", url: url.trim(), room: room.trim() || undefined }); }
    else { if (!deviceId) return; onDone({ name: name.trim(), kind: "device", deviceId, room: room.trim() || undefined }); }
  };

  return (
    <Card padded style={{ marginBottom: 16 }}>
      <SectionLabel>Add camera</SectionLabel>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["url", "device"] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: kind === k ? c.accent : c.card, borderColor: kind === k ? c.accent : c.border, borderWidth: 1 }}>
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
              <Pressable key={d.id} onPress={() => setDeviceId(d.id)} style={{ borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: deviceId === d.id ? c.accent : c.card, borderColor: deviceId === d.id ? c.accent : c.border, borderWidth: 1 }}>
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
        <Pressable onPress={() => onDone(null)} style={{ flex: 1, minHeight: 48, borderColor: c.border, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.textDim, fontWeight: "700" }}>Cancel</Text></Pressable>
        <Pressable onPress={save} style={{ flex: 1, minHeight: 48, backgroundColor: c.accent, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.onAccent || "#fff", fontWeight: "800" }}>Add</Text></Pressable>
      </View>
    </Card>
  );
}

function Input({ c, label, ...props }: { c: Colors; label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: c.textDim, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput placeholderTextColor={c.faint} style={{ color: c.text, backgroundColor: c.cardHi, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: c.border }} {...props} />
    </View>
  );
}
