import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { api } from "../../../api";
import type { Device } from "../../../api";
import { Screen, Card, ErrorState, EmptyState, useTheme } from "../../../ui";
import { ActionButton, Callout, CodeBlock, CopyField, MetricRow, ScreenHeader, SearchField, TextField, LoadingState } from "../../../enterprise-ui";
import { DeviceList, Page, pretty } from "./parts";
import { logDiagnostic } from "./log";

function zoneOf(d?: Device): string { return (d?.room || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "default"; }
function topic(d: Device | undefined, suffix: string) { return d ? `circuvent/home/${zoneOf(d)}/${d.id}/${suffix}` : "circuvent/home/{zone}/{device_id}/" + suffix; }
function commandHints(d?: Device): { action: string; payload: Record<string, unknown> }[] { const s = d?.state ?? {}; const out: { action: string; payload: Record<string, unknown> }[] = [{ action: "state", payload: { action: "state" } }]; if ("power" in s || "on" in s) out.push({ action: "set power", payload: { action: "set", power: !(s as any).power } }); if ("brightness" in s) out.push({ action: "set brightness", payload: { action: "set", brightness: (s as any).brightness } }); if ("temperature" in s || "target" in s) out.push({ action: "set target", payload: { action: "set", target: (s as any).target ?? (s as any).temperature } }); return out; }

export default function MqttReference({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const [devices, setDevices] = useState<Device[]>([]); const [device, setDevice] = useState<Device>(); const [q, setQ] = useState(""); const [json, setJson] = useState('{\n  "action": "state"\n}'); const [result, setResult] = useState<string>(); const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [sending, setSending] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(undefined); try { const res = await api.devices(); if (!res.ok) throw new Error(String((res.data as any)?.error ?? "Devices failed")); setDevices(res.data.devices); setDevice((d) => d ?? res.data.devices[0]); } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const parsed = useMemo(() => { try { const v = JSON.parse(json); if (!v || typeof v !== "object" || Array.isArray(v)) return { error: "Command must be a JSON object." }; return { value: v as Record<string, unknown> }; } catch (e) { return { error: e instanceof Error ? e.message : "Invalid JSON" }; } }, [json]);
  const send = useCallback(async () => { if (!device || !parsed.value) return; setSending(true); const res = await api.command(device.id, parsed.value as any); setResult(pretty({ ok: res.ok, status: res.status, data: res.data })); await logDiagnostic({ severity: res.ok ? "info" : "warning", kind: "command", title: "MQTT contract command sent through HTTP API", detail: `${device.id} · status ${res.status}`, data: { deviceId: device.id, topic: topic(device, "set"), command: parsed.value, status: res.status } }); setSending(false); }, [device, parsed]);
  const filtered = devices.filter((d) => `${d.name} ${d.id} ${d.type} ${d.room ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return <Screen><ScreenHeader title="MQTT reference" subtitle="Protocol contract, not broker subscription" onBack={onBack} actions={[{ icon: "refresh", label: "Refresh", onPress: load }]} />
    <Page>{loading ? <LoadingState text="Loading devices…" /> : error ? <ErrorState text={error} onRetry={load} /> : <>
      <Callout kind="info" icon="mqtt" title="Contract surface" text="This app publishes through the control-plane HTTP API. No MQTT client library is bundled, so this screen does not subscribe to the broker; it shows the firmware/control-plane topic contract and sends commands via api.command()." />
      <Card padded style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Topic contract</Text>{["set", "telemetry", "state", "event"].map((s) => <CopyField key={s} label={`/${s}`} value={topic(device, s)} />)}</Card>
      <SearchField value={q} onChange={setQ} placeholder="Search device for topic builder" /><DeviceList devices={filtered} selectedId={device?.id} onPick={setDevice} />
      <Card padded style={{ marginTop: 12, marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Command composer</Text><TextField label="JSON command payload" value={json} onChange={setJson} multiline error={parsed.error} /><CopyField label="Publish topic preview" value={topic(device, "set")} /><CodeBlock label="Payload preview" text={parsed.value ? pretty(parsed.value) : parsed.error || ""} /><ActionButton label="Send through HTTP API" icon="send" onPress={send} busy={sending} disabled={!device || !!parsed.error} />{result ? <CodeBlock label="HTTP result" text={result} /> : null}</Card>
      <Card padded><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Known command shapes from current device state</Text>{device ? commandHints(device).map((h, i) => <MetricRow key={h.action} label={h.action} value={<Text onPress={() => setJson(pretty(h.payload))} accessibilityRole="button" accessibilityLabel={`Use ${h.action} command`} style={{ color: c.accentHi, fontWeight: "800" }}>{JSON.stringify(h.payload)}</Text>} icon="action" last={i === commandHints(device).length - 1} />) : <EmptyState icon="device" title="Pick a device" />}</Card>
    </>}</Page></Screen>;
}

