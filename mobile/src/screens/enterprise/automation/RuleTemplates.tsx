import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { AutomationBody, Device } from "../../../api";
import { Screen, ToastHost, useTheme, useToast } from "../../../ui";
import { ActionButton, Callout, CodeBlock, ScreenHeader, SelectField, Stepper, TextField } from "../../../enterprise-ui";
import { api } from "../../../api";
import { humanizeBody } from "./humanize";
import { DevicePicker, FieldPicker, collectFieldInfo, ScreenScaffold, SectionCard } from "./parts";
import { safeJson } from "./types";
import { useRules } from "./useRules";

type TemplateKey = "morning" | "away" | "hot" | "tank" | "door" | "energy";
const names: Record<TemplateKey, string> = { morning: "Morning routine", away: "Away mode", hot: "High-temperature alert", tank: "Water-tank low warning", door: "Door-left-open notify", energy: "Energy-threshold alert" };

function hasField(d: Device, tests: string[]) { return tests.find((k) => Object.prototype.hasOwnProperty.call(d.state || {}, k)); }
function capable(devices: Device[], key: TemplateKey): Device[] {
  if (key === "morning") return devices.filter((d) => hasField(d, ["on", "power", "open"]));
  if (key === "away") return devices.filter((d) => hasField(d, ["on", "power", "locked", "armed"]));
  if (key === "hot") return devices.filter((d) => hasField(d, ["temperature", "temp", "airTemperature"]));
  if (key === "tank") return devices.filter((d) => hasField(d, ["level", "waterLevel", "percent", "low"]));
  if (key === "door") return devices.filter((d) => hasField(d, ["open", "doorOpen", "closed"]));
  return devices.filter((d) => hasField(d, ["watts", "powerW", "energy", "current"]));
}

function defaultField(key: TemplateKey, d?: Device): string | undefined {
  if (!d) return undefined;
  const tests: Record<TemplateKey, string[]> = { morning: ["on", "power", "open"], away: ["on", "power", "locked", "armed"], hot: ["temperature", "temp", "airTemperature"], tank: ["level", "waterLevel", "percent", "low"], door: ["open", "doorOpen", "closed"], energy: ["watts", "powerW", "energy", "current"] };
  return hasField(d, tests[key]);
}

function build(key: TemplateKey, device?: Device, field?: string, threshold = 28): AutomationBody | null {
  if (!device || !field) return null;
  if (key === "morning") return { name: "Morning routine", enabled: true, trigger: { type: "time", at: "07:00" }, action: { type: "command", deviceId: device.id, command: { [field]: field === "open" ? true : true } } };
  if (key === "away") return { name: "Away mode", enabled: true, trigger: { type: "time", at: "22:30" }, action: { type: "command", deviceId: device.id, command: { [field]: field === "locked" || field === "armed" ? true : false } } };
  if (key === "hot") return { name: `${device.name} high temperature`, enabled: true, trigger: { type: "state", deviceId: device.id, field, op: ">", value: threshold }, action: { type: "notify", title: "High temperature", body: `${device.name} ${field} is above ${threshold}` } };
  if (key === "tank") return { name: `${device.name} low tank`, enabled: true, trigger: { type: "state", deviceId: device.id, field, op: "<", value: threshold }, action: { type: "notify", title: "Water tank low", body: `${device.name} ${field} is below ${threshold}` } };
  if (key === "door") return { name: `${device.name} opened`, enabled: true, trigger: { type: "state", deviceId: device.id, field, op: field === "closed" ? "falsy" : "truthy" }, action: { type: "notify", title: "Door open", body: `${device.name} reports ${field}` } };
  return { name: `${device.name} energy threshold`, enabled: true, trigger: { type: "state", deviceId: device.id, field, op: ">", value: threshold }, action: { type: "notify", title: "Energy threshold", body: `${device.name} ${field} is above ${threshold}` } };
}

export default function RuleTemplates({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const toast = useToast(); const { devices, loading, error, reload } = useRules();
  const [key, setKey] = useState<TemplateKey>("hot"); const options = useMemo(() => (Object.keys(names) as TemplateKey[]).map((k) => ({ key: k, devices: capable(devices, k) })), [devices]);
  const available = capable(devices, key); const [deviceId, setDeviceId] = useState<string | undefined>(); const device = available.find((d) => d.id === deviceId) || available[0];
  const [field, setField] = useState<string | undefined>(); const chosenField = field || defaultField(key, device); const [threshold, setThreshold] = useState(28); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const body = build(key, device, chosenField, threshold);
  const fields = collectFieldInfo(device);
  const create = async () => { if (!body) return; setBusy(true); setErr(null); try { await api.createAutomation(body); toast.show("Template rule created"); } catch (e) { setErr(e instanceof Error ? e.message : "Create failed"); } finally { setBusy(false); } };
  return <Screen><ScreenHeader title="Rule Templates" subtitle="Guided starts that create real payloads" onBack={onBack} actions={[{ icon: "refresh", label: "Reload", onPress: reload }]} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"><ScreenScaffold loading={loading} error={error} onRetry={reload}>
      <SectionCard title="Catalogue" icon="sparkles">{options.map((o) => <Callout key={o.key} kind={o.devices.length ? "success" : "warning"} title={names[o.key]} text={o.devices.length ? `${o.devices.length} capable device${o.devices.length === 1 ? "" : "s"} found from real state fields.` : "Unavailable: no returned device exposes the needed state field."} action={o.devices.length ? { label: "Use this template", onPress: () => { setKey(o.key); setDeviceId(o.devices[0]?.id); setField(defaultField(o.key, o.devices[0])); } } : undefined} />)}</SectionCard>
      <SectionCard title="Specifics" icon="tune"><SelectField label="Template" value={key} options={(Object.keys(names) as TemplateKey[]).map((k) => ({ value: k, label: names[k], icon: "rules" }))} onChange={(v) => { setKey(v); const d = capable(devices, v)[0]; setDeviceId(d?.id); setField(defaultField(v, d)); }} />{available.length ? <DevicePicker label="Device" devices={available} value={device?.id} onChange={(id) => { setDeviceId(id); setField(defaultField(key, available.find((d) => d.id === id))); }} /> : <Text style={{ color: c.faint }}>This template is unavailable until a capable device appears in the API response.</Text>}{device && <FieldPicker fields={fields} value={chosenField} onChange={(f) => setField(f.key)} />}{["hot", "tank", "energy"].includes(key) && <Stepper label="Threshold" value={threshold} min={0} max={key === "hot" ? 80 : 10000} step={key === "energy" ? 50 : 1} onChange={setThreshold} />}</SectionCard>
      <SectionCard title="Payload preview" icon="terminal">{body ? <><Text style={{ color: c.text, lineHeight: 20, marginBottom: 10 }}>{humanizeBody(body, devices)}</Text><CodeBlock text={safeJson(body)} label="AutomationBody" /></> : <Callout kind="warning" text="Choose a capable device and field to preview the exact rule." />}</SectionCard>
      {err && <TextField label="Create error" value={err} onChange={() => {}} editable={false} />}<ActionButton label="Create from template" icon="save" onPress={create} disabled={!body || busy} busy={busy} />
    </ScreenScaffold></ScrollView><ToastHost toast={toast.toast} onHide={toast.hide} /></Screen>;
}
