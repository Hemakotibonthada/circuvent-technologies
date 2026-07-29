import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { api } from "../../../api";
import type { Device } from "../../../api";
import { createStore, formatDateTime, toCsv } from "../../../enterprise";
import { Screen, Card, ErrorState, EmptyState, useTheme } from "../../../ui";
import { ActionButton, BottomSheet, CodeBlock, Kpi, KpiGrid, ScreenHeader, Stepper, Callout, MetricRow } from "../../../enterprise-ui";
import { DeviceList, fmtMs, latencyStats, Page, timeCall } from "./parts";
import { logDiagnostic } from "./log";

interface RunHistory { runs: RunResult[] }
interface RunResult { id: string; ts: string; count: number; health: number[]; failures: number; devicesMs?: number; ackMs?: number; ackStatus?: string; pollMs?: number }
const store = createStore<RunHistory>("diagnostics-latency-runs-v1", { runs: [] });

export default function LatencyLab({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const [count, setCount] = useState(20); const [running, setRunning] = useState(false); const [devices, setDevices] = useState<Device[]>([]); const [selected, setSelected] = useState<Device>(); const [history, setHistory] = useState<RunResult[]>([]); const [error, setError] = useState<string>(); const [csvOpen, setCsvOpen] = useState(false);
  const load = useCallback(async () => { setError(undefined); try { const res = await api.devices(); if (!res.ok) throw new Error(String((res.data as any)?.error ?? "Devices failed")); setDevices(res.data.devices); setSelected((s) => s ?? res.data.devices[0]); setHistory((await store.load()).runs); } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); } }, []);
  useEffect(() => { load(); }, [load]);
  const run = useCallback(async () => {
    setRunning(true); setError(undefined); const health: number[] = []; let failures = 0;
    for (let i = 0; i < count; i++) { const r = await timeCall(() => api.health()); if (r.ok) health.push(r.ms); else failures++; }
    const devProbe = await timeCall(() => api.devices()); let ackMs: number | undefined; let ackStatus: string | undefined; const pollMs = 1500;
    if (selected) { const before = selected.last_seen ? new Date(selected.last_seen).getTime() : 0; const start = Date.now(); const cmd = await api.command(selected.id, { action: "state" }); await logDiagnostic({ severity: cmd.ok ? "info" : "warning", kind: "command", title: "No-op state command dispatched", detail: `${selected.id} · status ${cmd.status}`, data: { deviceId: selected.id, command: { action: "state" }, status: cmd.status } }); if (cmd.ok) { while (Date.now() - start < 30000) { await new Promise((r) => setTimeout(r, pollMs)); const d = await api.device(selected.id); if (d.ok) { const seen = d.data.device.last_seen ? new Date(d.data.device.last_seen).getTime() : 0; if (seen > before) { ackMs = Date.now() - start; ackStatus = "last_seen advanced"; break; } } } if (ackMs == null) ackStatus = "timeout after 30s"; } else ackStatus = `command failed (${cmd.status})`; }
    const result: RunResult = { id: `${Date.now()}`, ts: new Date().toISOString(), count, health, failures, devicesMs: devProbe.ok ? devProbe.ms : undefined, ackMs, ackStatus, pollMs };
    const next = [result, ...history].slice(0, 40); setHistory(next); await store.save({ runs: next }); await logDiagnostic({ severity: failures || !devProbe.ok ? "warning" : "info", kind: "probe", title: "Latency lab run completed", detail: `${health.length}/${count} health probes succeeded`, data: result as any }); setRunning(false);
  }, [count, history, selected]);
  const latest = history[0]; const s = latest ? latencyStats(latest.health) : undefined;
  const csv = useMemo(() => toCsv(history.map((r) => ({ ts: r.ts, count: r.count, minMs: latencyStats(r.health).min, avgMs: latencyStats(r.health).avg, p95Ms: latencyStats(r.health).p95, maxMs: latencyStats(r.health).max, jitterMs: latencyStats(r.health).jitter, failures: r.failures, devicesMs: r.devicesMs, ackMs: r.ackMs, ackStatus: r.ackStatus }))), [history]);
  return <Screen><ScreenHeader title="Latency lab" subtitle="Only real measured HTTP timings" onBack={onBack} actions={[{ icon: "refresh", label: "Reload", onPress: load }, { icon: "exportFile", label: "CSV", onPress: () => setCsvOpen(true) }]} />
    <Page>{error ? <ErrorState text={error} onRetry={load} /> : <>
      <Callout kind="warning" icon="latency" title="No fabricated latency" text="The test times real sequential api.health() calls and one authenticated api.devices() call. Optional device acknowledgement sends {action:'state'} through the HTTP API, then polls device state until last_seen advances or times out." />
      <Card padded style={{ marginBottom: 12 }}><Stepper label="Sequential health probes" value={count} min={3} max={100} step={1} onChange={setCount} unit="calls" help="Default 20. Probes run one after another, not in parallel." /><ActionButton label="Run measured test" icon="play" onPress={run} busy={running} /></Card>
      {latest && s ? <KpiGrid><Kpi label="Min" value={fmtMs(s.min)} icon="latency" tint={c.green} /><Kpi label="Avg" value={fmtMs(s.avg)} icon="ping" tint={c.cyan} /><Kpi label="P95" value={fmtMs(s.p95)} icon="charts" tint={c.amber} invertDelta /><Kpi label="Max" value={fmtMs(s.max)} icon="warning" tint={c.red} /><Kpi label="Jitter" value={fmtMs(s.jitter)} icon="signal" tint={c.violet} /><Kpi label="Failures" value={latest.failures} icon="alert" tint={latest.failures ? c.red : c.green} /></KpiGrid> : <EmptyState icon="latency" title="No run yet" subtitle="Run the test to collect real latency samples." />}
      {latest ? <Card padded style={{ marginBottom: 12 }}><MetricRow label="Unauthenticated health" value={`${latest.health.length} real samples`} icon="globe" /><MetricRow label="Authenticated devices()" value={fmtMs(latest.devicesMs)} icon="devices" /><MetricRow label="Observed end-to-end acknowledgement" value={latest.ackMs ? fmtMs(latest.ackMs) : latest.ackStatus || "not run"} icon="sync" /><MetricRow label="Polling interval" value={latest.pollMs ? fmtMs(latest.pollMs) : "—"} icon="clock" last /></Card> : null}
      <Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Optional device acknowledgement target</Text><DeviceList devices={devices} selectedId={selected?.id} onPick={setSelected} />
      <Text style={{ color: c.text, fontWeight: "900", marginVertical: 12 }}>Past runs</Text>{history.length ? <Card padded>{history.map((r, i) => { const rs = latencyStats(r.health); return <MetricRow key={r.id} label={formatDateTime(r.ts)} value={`${fmtMs(rs.avg)} avg · ${r.failures} failures`} icon="history" last={i === history.length - 1} />; })}</Card> : null}
      <BottomSheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="Latency run CSV"><CodeBlock text={csv || "No runs yet"} label="CSV" maxHeight={420} /></BottomSheet>
    </>}</Page></Screen>;
}
