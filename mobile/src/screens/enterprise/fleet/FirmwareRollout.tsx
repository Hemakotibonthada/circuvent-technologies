import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api } from "../../../api";
import { formatDateTime, slugifyFilename } from "../../../enterprise";
import { Screen, useTheme, useToast, ToastHost } from "../../../ui";
import { ActionButton, Callout, ConfirmDialog, MetricRow, SelectField, Stepper, TextField, ToggleField } from "../../../enterprise-ui";
import { AccessRequired, DeviceList, FleetError, FleetLoading, FleetScaffold, ResultList } from "./parts";
import { errorText, rolloutStore, uniqueTypes, unwrap, useFleetBundle, type CommandResult, type RolloutHistoryEntry } from "./useFleet";

const WAVE_OPTIONS = [10, 25, 50, 100] as const;

export default function FirmwareRollout({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const fleet = useFleetBundle(false);
  const [type, setType] = useState("all");
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [url, setUrl] = useState("");
  const [version, setVersion] = useState("");
  const [wave, setWave] = useState<number>(25);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<RolloutHistoryEntry[]>([]);
  const [results, setResults] = useState<CommandResult[]>([]);
  const devices = fleet.data?.devices || [];

  useEffect(() => { rolloutStore.load().then(setHistory).catch(() => setHistory([])); }, []);
  const types = useMemo(() => ["all", ...uniqueTypes(devices)], [devices]);
  const targets = useMemo(() => devices.filter((d) => (type === "all" || d.type === type) && (!onlineOnly || d.online)), [devices, type, onlineOnly]);
  const urlError = useMemo(() => {
    if (!url.trim()) return "Image URL is required";
    try { const parsed = new URL(url.trim()); if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "URL must be HTTP or HTTPS"; return ""; }
    catch { return "Enter a valid URL"; }
  }, [url]);
  const httpsWarning = useMemo(() => { try { return url.trim() && new URL(url.trim()).protocol !== "https:"; } catch { return false; } }, [url]);
  const waveCount = Math.max(1, Math.ceil(targets.length * (wave / 100)));
  const nextWave = targets.slice(results.length, results.length + waveCount);

  async function dispatch() {
    setConfirm(false); setBusy(true);
    const started = new Date().toISOString();
    let out: CommandResult[] = [];
    if (wave === 100) {
      try {
        const res = await unwrap(api.adminOtaBroadcast({ type: type === "all" ? undefined : type, url: url.trim(), version: version.trim() || undefined }), "Broadcast OTA failed");
        out = targets.map((d, i) => ({ id: d.id, ok: i < res.sent, message: i < res.sent ? "OTA pointer dispatched by broadcast" : "Not addressed by server" }));
        toast.show(`OTA dispatched to ${res.sent} addressed devices`, "success");
      } catch (e) { toast.show(errorText(e), "error"); out = targets.map((d) => ({ id: d.id, ok: false, message: errorText(e) })); }
    } else {
      for (const d of nextWave) {
        try { await unwrap(api.adminOta(d.id, url.trim(), version.trim() || undefined), "OTA failed"); out.push({ id: d.id, ok: true, message: "OTA pointer dispatched" }); }
        catch (e) { out.push({ id: d.id, ok: false, message: errorText(e, "OTA failed") }); }
      }
      toast.show(`Wave dispatched: ${out.filter((r) => r.ok).length}/${out.length} succeeded`, out.some((r) => !r.ok) ? "warning" : "success");
    }
    const merged = [...results, ...out];
    setResults(merged); setBusy(false);
    const entry: RolloutHistoryEntry = { id: slugifyFilename(`${version || "ota"}-${started}`), ts: started, url: url.trim(), version: version.trim(), type, onlineOnly, targetIds: targets.map((d) => d.id), mode: wave === 100 ? "broadcast" : "wave", succeeded: merged.filter((r) => r.ok).length, failed: merged.filter((r) => !r.ok).length, dispatched: merged.length };
    const next = [entry, ...history].slice(0, 30); setHistory(next); rolloutStore.save(next).catch(() => {});
  }

  if (fleet.loading) return <Screen><FleetScaffold title="Firmware rollout" subtitle="Loading cohort" onBack={onBack}><FleetLoading /></FleetScaffold></Screen>;
  if (fleet.adminBlocked) return <Screen><FleetScaffold title="Firmware rollout" subtitle="Admin-only" onBack={onBack} onRefresh={fleet.reload}><AccessRequired onRetry={fleet.reload} /></FleetScaffold></Screen>;
  if (fleet.error && !fleet.data) return <Screen><FleetScaffold title="Firmware rollout" subtitle="OTA" onBack={onBack} onRefresh={fleet.reload}><FleetError message={fleet.error} onRetry={fleet.reload} /></FleetScaffold></Screen>;

  return (
    <Screen>
      <FleetScaffold title="Firmware rollout" subtitle={`${targets.length} devices targeted`} onBack={onBack} onRefresh={fleet.reload}>
        <ScrollView refreshControl={<RefreshControl refreshing={fleet.refreshing} onRefresh={fleet.refresh} tintColor={c.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }}>
          <Callout kind="info" icon="otaUpdate" text="Staged waves call each device OTA endpoint individually. The 100% fast path uses broadcast and reports devices addressed, not devices updated." />
          <SelectField label="Cohort type" value={type} options={types.map((t) => ({ value: t, label: t === "all" ? "All types" : t, icon: "device" }))} onChange={(v) => { setType(v); setResults([]); }} />
          <ToggleField label="Online devices only" value={onlineOnly} onChange={(v) => { setOnlineOnly(v); setResults([]); }} icon="online" help="Offline devices cannot receive MQTT OTA commands immediately." />
          <TextField label="Image URL" value={url} onChange={setUrl} autoCapitalize="none" error={urlError && url.trim() ? urlError : undefined} />
          {httpsWarning ? <Callout kind="warning" icon="warning" text="HTTP URLs are allowed by validation but HTTPS is strongly recommended for firmware images." /> : null}
          <TextField label="Target version" value={version} onChange={setVersion} autoCapitalize="none" help="Operator-entered version label stored in the local rollout log." />
          <SelectField label="Wave size" value={wave} options={WAVE_OPTIONS.map((v) => ({ value: v, label: `${v}%`, icon: v === 100 ? "broadcast" : "rollout" }))} onChange={setWave} help={wave === 100 ? "Uses whole-cohort broadcast." : `Next wave will dispatch to ${Math.min(nextWave.length, targets.length)} devices.`} />
          <Stepper label="Target preview" value={targets.length} onChange={() => {}} min={0} max={Math.max(0, targets.length)} unit="devices" help="Computed from the loaded inventory; it is not editable." />
          <DeviceList devices={targets} />
          <ActionButton label={wave === 100 ? "Confirm broadcast" : "Confirm next wave"} icon="send" onPress={() => setConfirm(true)} disabled={!!urlError || !targets.length || busy || (wave !== 100 && !nextWave.length)} busy={busy} />
          <ResultList results={results} />
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>Local rollout log</Text>
          {history.length ? history.map((h) => <MetricRow key={h.id} label={`${formatDateTime(h.ts)} · ${h.type}`} value={`${h.mode === "broadcast" ? "Broadcast" : "Wave"}: ${h.dispatched} dispatched, ${h.succeeded} succeeded, ${h.failed} failed`} icon="history" />) : <Callout kind="info" text="No local rollout records yet. This is an operator log stored on this device, not server-measured update history." />}
        </ScrollView>
        <ConfirmDialog visible={confirm} title="Dispatch firmware?" message={`Target ${wave === 100 ? targets.length : nextWave.length} of ${targets.length} devices. URL: ${url.trim()}. Version: ${version.trim() || "not specified"}.`} confirmLabel="Dispatch" onConfirm={dispatch} onCancel={() => setConfirm(false)} busy={busy} />
        <ToastHost toast={toast.toast} onHide={toast.hide} />
      </FleetScaffold>
    </Screen>
  );
}

