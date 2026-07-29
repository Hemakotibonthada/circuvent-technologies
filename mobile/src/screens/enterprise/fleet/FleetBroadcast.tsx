import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api } from "../../../api";
import { formatDateTime, slugifyFilename } from "../../../enterprise";
import { Screen, useTheme, useToast, ToastHost } from "../../../ui";
import { ActionButton, Callout, CodeBlock, ConfirmDialog, MetricRow, SelectField, TextField } from "../../../enterprise-ui";
import { AccessRequired, DeviceList, FleetError, FleetLoading, FleetScaffold } from "./parts";
import { broadcastStore, errorText, uniqueTypes, unwrap, useFleetBundle, type BroadcastLogEntry } from "./useFleet";

const PRESETS = [
  { value: "reboot", label: "Reboot", command: { action: "reboot" } },
  { value: "identify", label: "Identify", command: { action: "identify" } },
  { value: "state", label: "Refresh state", command: { action: "state" } },
  { value: "noop", label: "Safe no-op", command: { action: "state" } },
  { value: "raw", label: "Raw JSON", command: {} },
] as const;

type OnlineFilter = "any" | "online" | "offline";

export default function FleetBroadcast({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const fleet = useFleetBundle(false);
  const devices = fleet.data?.devices || [];
  const [type, setType] = useState("all");
  const [online, setOnline] = useState<OnlineFilter>("any");
  const [preset, setPreset] = useState<typeof PRESETS[number]["value"]>("state");
  const [raw, setRaw] = useState(JSON.stringify({ action: "state" }, null, 2));
  const [rawError, setRawError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [log, setLog] = useState<BroadcastLogEntry[]>([]);

  useEffect(() => { broadcastStore.load().then(setLog).catch(() => setLog([])); }, []);
  const types = useMemo(() => ["all", ...uniqueTypes(devices)], [devices]);
  const matched = useMemo(() => devices.filter((d) => (type === "all" || d.type === type) && (online === "any" || d.online === (online === "online"))), [devices, online, type]);
  const command = useMemo(() => {
    if (preset !== "raw") return PRESETS.find((p) => p.value === preset)?.command || { action: "state" };
    try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Command must be a JSON object"); return parsed as Record<string, unknown>; }
    catch { return null; }
  }, [preset, raw]);

  function validateRaw() {
    if (preset !== "raw") return true;
    try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Command must be a JSON object"); setRawError(""); return true; }
    catch (e) { setRawError(errorText(e, "Invalid JSON")); return false; }
  }

  async function dispatch() {
    if (!command) return;
    setConfirm(false); setBusy(true); setSent(null);
    try {
      const res = await unwrap(api.adminBroadcast({ type: type === "all" ? undefined : type, online: online === "any" ? undefined : online === "online", command }), "Broadcast failed");
      setSent(res.sent);
      toast.show(`Command dispatched to ${res.sent} addressed devices`, "success");
      const ts = new Date().toISOString();
      const entry: BroadcastLogEntry = { id: slugifyFilename(`broadcast-${ts}`), ts, command, type, online, matched: matched.length, sent: res.sent };
      const next = [entry, ...log].slice(0, 40); setLog(next); broadcastStore.save(next).catch(() => {});
    } catch (e) { toast.show(errorText(e), "error"); }
    finally { setBusy(false); }
  }

  if (fleet.loading) return <Screen><FleetScaffold title="Fleet broadcast" subtitle="Loading audience" onBack={onBack}><FleetLoading /></FleetScaffold></Screen>;
  if (fleet.adminBlocked) return <Screen><FleetScaffold title="Fleet broadcast" subtitle="Admin-only" onBack={onBack} onRefresh={fleet.reload}><AccessRequired onRetry={fleet.reload} /></FleetScaffold></Screen>;
  if (fleet.error && !fleet.data) return <Screen><FleetScaffold title="Fleet broadcast" subtitle="Fan-out commands" onBack={onBack} onRefresh={fleet.reload}><FleetError message={fleet.error} onRetry={fleet.reload} /></FleetScaffold></Screen>;

  return (
    <Screen>
      <FleetScaffold title="Fleet broadcast" subtitle={`${matched.length} matched devices`} onBack={onBack} onRefresh={fleet.reload}>
        <ScrollView refreshControl={<RefreshControl refreshing={fleet.refreshing} onRefresh={fleet.refresh} tintColor={c.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }}>
          <Callout kind="info" icon="broadcast" text="Broadcast uses MQTT fire-and-forget fan-out. The server reports devices addressed; it does not confirm device-side application." />
          <SelectField label="Command preset" value={preset} options={PRESETS.map((p) => ({ value: p.value, label: p.label, icon: p.value === "raw" ? "terminal" : "action" }))} onChange={(v) => { setPreset(v); const found = PRESETS.find((p) => p.value === v); if (found && v !== "raw") setRaw(JSON.stringify(found.command, null, 2)); }} />
          {preset === "raw" ? <TextField label="Raw command JSON" value={raw} onChange={(v) => { setRaw(v); setRawError(""); }} multiline error={rawError} /> : <CodeBlock label="Command body" text={JSON.stringify(command, null, 2)} maxHeight={120} />}
          <SelectField label="Device type" value={type} options={types.map((t) => ({ value: t, label: t === "all" ? "All types" : t, icon: "device" }))} onChange={setType} />
          <SelectField label="Online filter" value={online} options={[{ value: "any", label: "Any", icon: "fleet" }, { value: "online", label: "Online", icon: "online" }, { value: "offline", label: "Offline", icon: "offline" }]} onChange={setOnline} />
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>Matched devices ({matched.length})</Text>
          <DeviceList devices={matched} />
          <ActionButton label="Confirm broadcast" icon="send" onPress={() => { if (validateRaw()) setConfirm(true); }} disabled={!matched.length || !command || busy} busy={busy} />
          {sent != null ? <Callout kind="success" icon="success" text={`Dispatched to ${sent} addressed devices. This is not a confirmed applied count.`} /> : null}
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>Recent local broadcasts</Text>
          {log.length ? log.map((x) => <MetricRow key={x.id} label={`${formatDateTime(x.ts)} · ${x.type} · ${x.online}`} value={`matched ${x.matched}; dispatched to ${x.sent}`} icon="history" />) : <Callout kind="info" text="No local broadcast log yet. These records are stored on this device for operator recall." />}
        </ScrollView>
        <ConfirmDialog visible={confirm} title="Broadcast command?" message={`Dispatch ${JSON.stringify(command)} to ${matched.length} matched devices? The result will be devices addressed, not confirmed application.`} confirmLabel="Dispatch" onConfirm={dispatch} onCancel={() => setConfirm(false)} busy={busy} />
        <ToastHost toast={toast.toast} onHide={toast.hide} />
      </FleetScaffold>
    </Screen>
  );
}

