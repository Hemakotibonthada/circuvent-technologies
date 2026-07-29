import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { api } from "../../../api";
import type { Device, TelemetryRow } from "../../../api";
import { bucketSeries, numericSeries, statsOf, telemetryFields, formatDateTime } from "../../../enterprise";
import { LineChart } from "../../../charts";
import { Screen, Card, ErrorState, EmptyState, useAppActive, useTheme } from "../../../ui";
import { BottomSheet, CodeBlock, Kpi, KpiGrid, ScreenHeader, SearchField, SelectField, ToggleField, Callout, MetricRow, LoadingState } from "../../../enterprise-ui";
import { DeviceList, fmtMs, fmtNum, Histogram, latencyStats, Page, payloadSummary, pretty, safeAdmin, telemetryGaps } from "./parts";
import { logDiagnostic } from "./log";

export default function TelemetryInspector({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const active = useAppActive();
  const [devices, setDevices] = useState<Device[]>([]); const [device, setDevice] = useState<Device>();
  const [rows, setRows] = useState<TelemetryRow[]>([]); const [query, setQuery] = useState(""); const [devQuery, setDevQuery] = useState("");
  const [field, setField] = useState<string>(""); const [selected, setSelected] = useState<TelemetryRow>(); const [follow, setFollow] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [admin, setAdmin] = useState(false);
  const loadDevices = useCallback(async () => { setLoading(true); setError(undefined); try { const isAdmin = await safeAdmin(); setAdmin(isAdmin); const res = await api.devices(); if (!res.ok) throw new Error(String((res.data as any)?.error ?? "Devices failed")); setDevices(res.data.devices); setDevice((d) => d ?? res.data.devices[0]); } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); } finally { setLoading(false); } }, []);
  useEffect(() => { loadDevices(); }, [loadDevices]);
  const loadTelemetry = useCallback(async () => { if (!device) return; setError(undefined); try { const res = admin ? await api.adminDeviceTelemetry(device.id, 200) : await api.telemetry(device.id, 200); if (!res.ok) throw new Error(String((res.data as any)?.error ?? "Telemetry failed")); const next = res.data.telemetry as TelemetryRow[]; setRows(next); const fields = telemetryFields(next); setField((f) => fields.includes(f) ? f : fields[0] ?? ""); await logDiagnostic({ severity: "info", kind: "refresh", title: "Telemetry refreshed", detail: `${device.id} · ${next.length} rows`, data: { deviceId: device.id, rows: next.length, admin } }); } catch (e) { setError(e instanceof Error ? e.message : "Telemetry failed"); } }, [admin, device]);
  useEffect(() => { loadTelemetry(); }, [loadTelemetry]);
  useEffect(() => { if (!follow || !active) return; const id = setInterval(loadTelemetry, 10000); return () => clearInterval(id); }, [follow, active, loadTelemetry]);
  const filteredDevices = devices.filter((d) => `${d.name} ${d.id} ${d.type} ${d.room ?? ""}`.toLowerCase().includes(devQuery.toLowerCase()));
  const filtered = rows.filter((r) => JSON.stringify(r.payload ?? {}).toLowerCase().includes(query.toLowerCase()));
  const fields = telemetryFields(rows); const series = field ? bucketSeries(numericSeries(filtered, field), 60) : []; const st = statsOf(series); const gaps = telemetryGaps(filtered); const gs = latencyStats(gaps);
  const nonNumeric = useMemo(() => { const all = new Map<string, Set<string>>(); rows.forEach((r) => Object.entries(r.payload ?? {}).forEach(([k, v]) => { const numeric = typeof v === "number" || (typeof v === "string" && Number.isFinite(Number(v))); if (!numeric) { const set = all.get(k) ?? new Set<string>(); set.add(typeof v === "object" ? JSON.stringify(v) : String(v)); all.set(k, set); } })); return [...all.entries()].map(([k, v]) => ({ k, values: [...v].slice(0, 8) })); }, [rows]);
  return <Screen><ScreenHeader title="Telemetry inspector" subtitle="Raw frames and timestamp gaps" onBack={onBack} actions={[{ icon: "refresh", label: "Refresh", onPress: loadTelemetry }]} />
    <Page>{loading ? <LoadingState text="Loading devices…" /> : error ? <ErrorState text={error} onRetry={device ? loadTelemetry : loadDevices} /> : <>
      <Callout kind="info" icon="packet" text="Frames are rendered unreinterpreted from api.telemetry(id, 200), or adminDeviceTelemetry when admin access is available. Non-numeric fields are listed instead of coerced into charts." />
      <SearchField value={devQuery} onChange={setDevQuery} placeholder="Search devices" /><DeviceList devices={filteredDevices} selectedId={device?.id} onPick={setDevice} />
      <ToggleField label="Auto-follow telemetry" help="Refetches every 10 seconds while this app is active." value={follow} onChange={setFollow} icon="sync" />
      {device ? <><SearchField value={query} onChange={setQuery} placeholder="Filter raw payload JSON" />
        <KpiGrid><Kpi icon="packet" label="Frames" value={filtered.length} tint={c.cyan} /><Kpi icon="clock" label="Avg inter-arrival" value={fmtMs(gs.avg)} tint={c.violet} /><Kpi icon="warning" label="Max gap" value={fmtMs(gs.max)} tint={c.amber} /></KpiGrid>
        <Card padded style={{ marginBottom: 12 }}><SelectField label="Numeric field" value={field} onChange={setField} options={(fields.length ? fields : [""]).map((f) => ({ value: f, label: f || "No numeric fields" }))} help="numericSeries drops non-numeric samples rather than converting them to zero." />{series.length ? <><LineChart data={series.map((p) => p.v)} color={c.accentHi} height={170} /><MetricRow label="Min" value={fmtNum(st.min, 2)} /><MetricRow label="Avg" value={fmtNum(st.avg, 2)} /><MetricRow label="Max" value={fmtNum(st.max, 2)} /><MetricRow label="Last" value={fmtNum(st.last, 2)} last /></> : <EmptyState icon="charts" title="No numeric samples" subtitle="Choose another field or inspect raw frames." />}</Card>
        <Card padded style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Inter-arrival gaps</Text><Histogram values={gaps} /></Card>
        {nonNumeric.length ? <Card padded style={{ marginBottom: 12 }}><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Observed non-numeric fields</Text>{nonNumeric.map((n, i) => <MetricRow key={n.k} label={n.k} value={n.values.join(", ")} icon="info" last={i === nonNumeric.length - 1} />)}</Card> : null}
        <Card padded><Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Raw frames</Text>{filtered.length ? filtered.map((r, i) => <MetricRow key={`${r.ts}-${i}`} label={formatDateTime(r.ts)} value={<Text onPress={() => setSelected(r)} accessibilityRole="button" accessibilityLabel="Open telemetry frame" style={{ color: c.accentHi, fontWeight: "800", maxWidth: 190 }} numberOfLines={1}>{payloadSummary(r.payload)}</Text>} icon="packet" last={i === filtered.length - 1} />) : <EmptyState icon="packet" title="No frames" subtitle="No telemetry rows matched the current filter." />}</Card>
      </> : <EmptyState icon="devices" title="Pick a device" subtitle="Telemetry is loaded per real device." />}
      <BottomSheet visible={!!selected} onClose={() => setSelected(undefined)} title="Telemetry frame"><CodeBlock text={pretty(selected)} label="Raw JSON" maxHeight={520} /></BottomSheet>
    </>}</Page></Screen>;
}
