import React, { useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { api } from "../../../api";
import type { Device } from "../../../api";
import { useTheme } from "../../../ui";
import { Callout, CopyField, ActionButton, Kpi, KpiGrid, Pill, BottomSheet, CodeBlock, ToggleField } from "../../../enterprise-ui";
import { formatRelative } from "../../../enterprise";
import { useSecurityData } from "./useSecurity";
import { DetailRows, DeviceStatusRow, HonestEmpty, rawJson, SecurityScaffold, Section } from "./parts";
import { commandSupport, isCameraLike, streamUrl } from "./zones";

function cameraSupports(d: Device, keys: string[]): string | null {
  return keys.find((k) => Object.prototype.hasOwnProperty.call(d.state ?? {}, k)) ?? null;
}

export function CameraWall({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const data = useSecurityData(false);
  const [selected, setSelected] = useState<Device | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cameras = useMemo(() => data.devices.filter(isCameraLike), [data.devices]);
  const withStreams = cameras.filter((d) => !!streamUrl(d)).length;

  async function send(device: Device, command: Record<string, unknown>, label: string) {
    setBusy(`${device.id}:${label}`);
    await api.command(device.id, command);
    setBusy(null);
    data.reload();
  }

  const renderControls = (camera: Device) => {
    const rec = cameraSupports(camera, ["recording", "record", "recordEnabled"]);
    const ir = cameraSupports(camera, ["ir", "nightMode", "night", "infrared"]);
    const canReboot = commandSupport(camera, "reboot") || camera.type === "camera" || camera.type === "facedoor";
    return <View style={{ gap: 8 }}>
      {rec ? <ToggleField label="Recording" help={`Real state field: ${rec}`} value={!!camera.state[rec]} icon="camera" onChange={(v) => send(camera, { action: "set", [rec]: v }, "recording")} disabled={busy != null} /> : null}
      {ir ? <ToggleField label="IR / night mode" help={`Real state field: ${ir}`} value={!!camera.state[ir]} icon="eye" onChange={(v) => send(camera, { action: "set", [ir]: v }, "ir")} disabled={busy != null} /> : null}
      {canReboot ? <ActionButton label="Reboot camera" icon="refresh" outline onPress={() => send(camera, { action: "reboot" }, "reboot")} busy={busy === `${camera.id}:reboot`} /> : null}
      {!rec && !ir && !canReboot ? <Callout kind="info" text="This camera exposes no recognizable recording, IR or reboot control fields, so controls are omitted." icon="info" /> : null}
    </View>;
  };

  return <SecurityScaffold title="Camera Wall" subtitle="Camera identities and real stream references" onBack={onBack} loading={data.loading} error={data.error} onRetry={data.reload} onRefresh={data.reload} refreshing={data.refreshing}>
    <Callout kind="warning" title="Playback unavailable in this build" text="No video player or WebView dependency is installed. This screen never renders placeholder imagery; it shows only real device metadata and stream URLs from state." icon="camera" />
    <KpiGrid><Kpi icon="camera" label="Cameras" value={cameras.length} /><Kpi icon="signal" label="Streams" value={withStreams} /><Kpi icon="online" label="Online" value={cameras.filter((x) => x.online).length} tint={c.green} /></KpiGrid>
    <Section title="Camera devices" subtitle="camera, facedoor or devices exposing stream URLs" icon="camera">
      {cameras.length ? cameras.map((cam) => {
        const url = streamUrl(cam);
        return <View key={cam.id} style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 12 }}>
          <DeviceStatusRow device={cam} right={<Pill label={url ? "Stream URL" : "No stream"} icon={url ? "link" : "unlink"} color={url ? c.green : c.amber} />} />
          {url ? <CopyField label="Stream URL from device state" value={url} /> : <Callout kind="info" text="No stream, rtsp or url field is present in this device state." icon="unlink" />}
          {cam.state.snapshot || cam.state.lastSnapshot || cam.state.lastEvent ? <DetailRows rows={[{ label: "Snapshot metadata", value: String(cam.state.snapshot ?? cam.state.lastSnapshot ?? "present"), icon: "camera" }, { label: "Last camera event", value: String(cam.state.lastEvent ?? "not provided"), icon: "history" }]} /> : null}
          <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><ActionButton label="Details" icon="expand" outline onPress={() => setSelected(cam)} /></View>{url ? <View style={{ flex: 1 }}><ActionButton label="Open externally" icon="external" onPress={() => Linking.openURL(url)} /></View> : null}</View>
        </View>;
      }) : <HonestEmpty icon="camera" title="No cameras" subtitle="The API did not return camera-like devices or stream URL fields." />}
    </Section>
    <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? "Camera"}>
      {selected ? <><DetailRows rows={[{ label: "ID", value: selected.id, icon: "device" }, { label: "Type", value: selected.type, icon: "topic" }, { label: "Room", value: selected.room || "Not set", icon: "rooms" }, { label: "Last seen", value: selected.last_seen ? formatRelative(selected.last_seen) : "Never", icon: "clock" }]} />{streamUrl(selected) ? <CopyField label="Stream URL" value={streamUrl(selected)!} /> : null}{renderControls(selected)}<CodeBlock label="Raw camera state" text={rawJson(selected.state)} /></> : null}
    </BottomSheet>
  </SecurityScaffold>;
}
