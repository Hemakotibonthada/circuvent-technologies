"use client";

/**
 * Telemetry explorer.
 *
 * Every value on this page is read live from the Circuvent control plane. There
 * is no synthetic stream, no ingestion-rate meter and no fabricated pipeline —
 * we plot the actual stored frames for a device, show the real latest payload,
 * derive the observed schema from those frames, and summarise the real fleet.
 * Retention policies are genuinely persisted operator preferences (advisory).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, Cpu, Wifi, Zap, RefreshCw, Download, Clock, Layers, ListTree,
  Inbox, Plus, Trash2, Radio,
} from "lucide-react";
import { MultiLineChart, HBar, PALETTE } from "../../charts";
import {
  useAdminDevices, useDeviceTelemetry, useEnergySummary, useAdminConfig,
  useFleetInsights, availableMetrics, telemetrySeries, deviceHealth,
  type ConfigRecord, type DeviceHealth,
} from "../_lib/api";
import { num, relativeTime, fmtDateTime, duration } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Btn, Badge, Dot, SectionTitle, StaggerGrid, StaggerItem,
  Segmented, SearchInput, Input, EmptyState, ResourceGate, type Tone,
} from "../_ui";
import type { AdminDevice } from "@/lib/control-plane";

type Frame = { ts: string; payload: Record<string, unknown> };

const HEALTH_TONE: Record<DeviceHealth, Tone> = {
  healthy: "green", warning: "amber", critical: "red", offline: "slate",
};

function jsType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function TelemetryPage() {
  const devicesRes = useAdminDevices();
  const energyRes = useEnergySummary();
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);
  const fleet = useFleetInsights(devicesRes.data);
  const energy = energyRes.data;

  const [q, setQ] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return devices;
    return devices.filter((d) => `${d.name} ${d.id} ${d.type} ${d.room}`.toLowerCase().includes(s));
  }, [devices, q]);

  const device = useMemo(() => devices.find((d) => d.id === deviceId) ?? null, [devices, deviceId]);
  const onlineRate = fleet.total ? (fleet.online / fleet.total) * 100 : 0;

  const topConsumers = useMemo(
    () =>
      (energy?.byDevice ?? [])
        .filter((d) => Number.isFinite(d.watts) && d.watts > 0)
        .sort((a, b) => b.watts - a.watts)
        .slice(0, 8),
    [energy]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telemetry explorer"
        icon={<Activity className="h-5 w-5" />}
        subtitle="Inspect real stored telemetry frames per device — plot metrics, read the latest payload and see the observed schema. Everything here is read from the control plane."
        actions={
          <Btn variant="subtle" onClick={() => { devicesRes.reload(); energyRes.reload(); }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Btn>
        }
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Managed devices" value={num(fleet.total)} icon={<Cpu className="h-4 w-4" />} tone="brand" sub="registered" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Online now" value={num(fleet.online)} icon={<Wifi className="h-4 w-4" />}
            tone={onlineRate >= 80 ? "green" : onlineRate >= 50 ? "amber" : "red"}
            sub={fleet.total ? `${onlineRate.toFixed(0)}% of fleet` : "no devices"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Live load" value={energy ? `${num(energy.liveWatts)} W` : "—"}
            icon={<Zap className="h-4 w-4" />} tone="amber"
            sub={energyRes.error ? "unavailable" : energy ? "metered now" : "loading…"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Energy today" value={energy ? `${num(energy.todayKwh, 1)} kWh` : "—"}
            icon={<Activity className="h-4 w-4" />} tone="violet"
            sub={energyRes.error ? "unavailable" : "since midnight"}
          />
        </StaggerItem>
      </StaggerGrid>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel className="flex flex-col">
          <SectionTitle right={<Badge tone="slate">{num(filtered.length)}</Badge>}>Devices</SectionTitle>
          <SearchInput value={q} onChange={setQ} placeholder="Search devices…" className="mb-3" />
          <ResourceGate
            loading={devicesRes.loading} error={devicesRes.error} unauthorized={devicesRes.unauthorized}
            onRetry={devicesRes.reload}
            isEmpty={filtered.length === 0}
            empty={<p className="py-8 text-center text-sm ad-muted">{devices.length ? "No devices match your search." : "No devices registered."}</p>}
            skeletonRows={6}
          >
            <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
              {filtered.map((d) => {
                const h = deviceHealth(d);
                const active = d.id === deviceId;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDeviceId(d.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      active ? "border-cyan-500/40 bg-cyan-500/10" : "border-white/5 bg-black/20 hover:border-white/15"
                    }`}
                  >
                    <Dot tone={HEALTH_TONE[h]} pulse={d.online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{d.name || d.id}</span>
                      <span className="block truncate text-[11px] ad-muted">{d.type}{d.room ? ` · ${d.room}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-[10px] ad-muted">{d.online ? "online" : relativeTime(d.last_seen)}</span>
                  </button>
                );
              })}
            </div>
          </ResourceGate>
        </Panel>

        {device ? (
          <DeviceTelemetry key={device.id} device={device} />
        ) : (
          <Panel className="grid place-items-center">
            <EmptyState
              icon={<Radio className="h-6 w-6" />}
              title="Select a device"
              hint="Pick a device on the left to load its real telemetry frames, plot metrics and inspect the latest payload."
            />
          </Panel>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Devices by type</SectionTitle>
          {fleet.byType.length === 0 ? (
            <p className="py-8 text-center text-sm ad-muted">No devices registered.</p>
          ) : (
            <HBar items={fleet.byType.map((t, i) => ({ name: t.name, value: t.value, color: PALETTE[i % PALETTE.length] }))} />
          )}
        </Panel>
        <Panel>
          <SectionTitle right={<Zap className="h-4 w-4 text-amber-400" />}>Live power by device</SectionTitle>
          {energyRes.error ? (
            <p className="py-8 text-center text-sm text-red-300">{energyRes.error}</p>
          ) : topConsumers.length === 0 ? (
            <p className="py-8 text-center text-sm ad-muted">No devices are metering power right now.</p>
          ) : (
            <HBar unit=" W" items={topConsumers.map((d, i) => ({ name: d.name || d.id, value: Math.round(d.watts), color: PALETTE[i % PALETTE.length] }))} />
          )}
        </Panel>
      </div>

      <RetentionPolicies />
    </div>
  );
}

// -------------------------------------------------------------- device view --

function DeviceTelemetry({ device }: { device: AdminDevice }) {
  const [limit, setLimit] = useState<100 | 200 | 500>(200);
  const tele = useDeviceTelemetry(device.id, limit, 20000);
  const frames = useMemo<Frame[]>(() => tele.data ?? [], [tele.data]);
  const sorted = useMemo(() => [...frames].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)), [frames]);

  const metrics = useMemo(() => availableMetrics(frames), [frames]);
  const [selected, setSelected] = useState<string[]>([]);

  // Keep the plotted metrics valid for the current device without discarding a
  // deliberate operator selection on every background refresh.
  useEffect(() => {
    setSelected((prev) => {
      const valid = prev.filter((m) => metrics.includes(m));
      if (valid.length) return valid.length === prev.length ? prev : valid;
      return metrics.slice(0, 2);
    });
  }, [metrics]);

  const chart = useMemo(() => {
    const per = selected.map((m) => ({ m, s: telemetrySeries(frames, m) }));
    const labels = per.reduce((a, p) => (p.s.labels.length > a.length ? p.s.labels : a), [] as string[]);
    const series = per.map((p, i) => ({ name: p.m, data: p.s.data, color: PALETTE[i % PALETTE.length] }));
    return { labels, series };
  }, [frames, selected]);

  const latest = sorted.length ? sorted[sorted.length - 1] : null;

  const schema = useMemo(() => {
    const map = new Map<string, { type: string; value: unknown }>();
    for (const f of sorted) for (const [k, v] of Object.entries(f.payload ?? {})) map.set(k, { type: jsType(v), value: v });
    return [...map.entries()].map(([name, info]) => ({ name, ...info })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sorted]);

  const span = useMemo(() => {
    const ts = frames.map((f) => Date.parse(f.ts)).filter((t) => !Number.isNaN(t));
    if (ts.length < 2) return null;
    return (Math.max(...ts) - Math.min(...ts)) / 1000;
  }, [frames]);

  const toggle = (m: string) => setSelected((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold text-white">{device.name || device.id}</h2>
            <Badge tone={device.online ? "green" : "slate"}><Dot tone={device.online ? "green" : "slate"} pulse={device.online} /> {device.online ? "online" : "offline"}</Badge>
          </div>
          <p className="truncate text-xs ad-muted">
            {device.type}{device.room ? ` · ${device.room}` : ""} · seen {relativeTime(device.last_seen)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<"100" | "200" | "500">
            value={String(limit) as "100" | "200" | "500"}
            onChange={(v) => setLimit(Number(v) as 100 | 200 | 500)}
            options={[{ value: "100", label: "100" }, { value: "200", label: "200" }, { value: "500", label: "500" }]}
          />
          <Btn variant="subtle" onClick={() => downloadCsv(device.id, sorted)} disabled={sorted.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Btn>
          <Btn variant="subtle" onClick={tele.reload}><RefreshCw className="h-4 w-4" /></Btn>
        </div>
      </div>

      <ResourceGate
        loading={tele.loading} error={tele.error} unauthorized={tele.unauthorized} onRetry={tele.reload}
        isEmpty={frames.length === 0}
        empty={<EmptyState icon={<Inbox className="h-6 w-6" />} title="No telemetry stored" hint="This device has not reported any frames the control plane has retained yet." />}
        skeletonRows={4}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat icon={<Layers className="h-4 w-4" />} label="Frames" value={num(frames.length)} />
          <MiniStat icon={<Clock className="h-4 w-4" />} label="Time span" value={span !== null ? duration(span) : "—"} />
          <MiniStat icon={<Activity className="h-4 w-4" />} label="Latest" value={latest ? relativeTime(latest.ts) : "—"} />
          <MiniStat icon={<ListTree className="h-4 w-4" />} label="Metrics" value={num(metrics.length)} />
        </div>

        <div>
          <SectionTitle>Metrics</SectionTitle>
          {metrics.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-black/20 px-3 py-4 text-center text-sm ad-muted">
              These frames contain no numeric metrics to plot.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {metrics.map((m, i) => {
                  const on = selected.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggle(m)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition ${
                        on ? "text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
                      }`}
                      style={on ? { borderColor: `${PALETTE[i % PALETTE.length]}66`, background: `${PALETTE[i % PALETTE.length]}22` } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      {m}
                    </button>
                  );
                })}
              </div>
              {chart.series.length === 0 ? (
                <p className="py-8 text-center text-sm ad-muted">Select a metric above to plot it.</p>
              ) : (
                <MultiLineChart labels={chart.labels} series={chart.series} height={240} area={chart.series.length === 1} />
              )}
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <SectionTitle right={latest ? <span className="text-[11px] ad-muted">{fmtDateTime(latest.ts)}</span> : undefined}>Latest frame</SectionTitle>
            {latest ? (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-3 font-mono text-xs">
                {Object.entries(latest.payload ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 border-b border-white/[0.04] py-1 last:border-0">
                    <span className="w-32 shrink-0 truncate text-cyan-300">{k}</span>
                    <span className="truncate font-semibold text-white">{displayValue(v)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm ad-muted">No frame to inspect.</p>
            )}
          </div>

          <div>
            <SectionTitle right={<Badge tone="slate">{num(schema.length)} fields</Badge>}>Observed schema</SectionTitle>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-3 text-xs">
              {schema.map((f) => (
                <div key={f.name} className="flex items-center gap-3 border-b border-white/[0.04] py-1 last:border-0">
                  <span className="w-32 shrink-0 truncate font-mono text-slate-200">{f.name}</span>
                  <Badge tone={f.type === "number" ? "brand" : f.type === "boolean" ? "amber" : "slate"}>{f.type}</Badge>
                  <span className="ml-auto truncate font-mono text-slate-400">{displayValue(f.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ResourceGate>
    </Panel>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider ad-muted">{icon}{label}</div>
      <div className="mt-1 text-lg font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}

// ----------------------------------------------------------------- retention --

interface RetentionRecord extends ConfigRecord {
  metric: string;
  days: number;
}

function RetentionPolicies() {
  const cfg = useAdminConfig<RetentionRecord>("retention");
  const [metric, setMetric] = useState("");
  const [days, setDays] = useState("30");

  const add = async () => {
    const m = metric.trim();
    const d = Math.round(Number(days));
    if (!m || !Number.isFinite(d) || d <= 0) return;
    await cfg.create({ metric: m, days: d });
    setMetric("");
    setDays("30");
  };

  return (
    <Panel>
      <SectionTitle right={<Badge tone="slate">advisory · stored, not enforced</Badge>}>Retention policies</SectionTitle>
      <p className="mb-3 text-xs ad-muted">
        Saved retention preferences per metric. These persist on the server for reference; the ingestion pipeline does not currently enforce them.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="metric e.g. temperature" className="min-w-[180px] flex-1 font-mono" />
        <Input type="number" min={1} max={3650} aria-label="Retention period in days" value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
        <span className="text-xs ad-muted">days</span>
        <Btn variant="primary" onClick={add} disabled={cfg.saving || !metric.trim()}><Plus className="h-4 w-4" /> Add</Btn>
      </div>
      <ResourceGate
        loading={cfg.loading} error={cfg.error} unauthorized={cfg.unauthorized} onRetry={cfg.reload}
        isEmpty={cfg.rows.length === 0}
        empty={<p className="py-6 text-center text-sm ad-muted">No retention policies saved yet.</p>}
        skeletonRows={2}
      >
        <div className="space-y-2">
          {cfg.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
              <span className="font-mono text-sm text-white">{r.metric}</span>
              <span className="text-xs ad-muted tabular-nums">{num(r.days)} day{r.days === 1 ? "" : "s"}</span>
              <span className="ml-auto text-[11px] ad-muted">saved {relativeTime(r.createdAt)}</span>
              <button
                onClick={() => { if (confirm(`Delete the retention policy for "${r.metric}" (${r.days} day${r.days === 1 ? "" : "s"})? This cannot be undone.`)) cfg.remove(r.id); }}
                className="text-slate-500 transition hover:text-red-300" title="Delete" disabled={cfg.saving}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </ResourceGate>
    </Panel>
  );
}

// ------------------------------------------------------------------ csv util --

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadCsv(deviceId: string, frames: Frame[]): void {
  if (typeof window === "undefined" || frames.length === 0) return;
  const keys = [...frames.reduce((s, f) => { for (const k of Object.keys(f.payload ?? {})) s.add(k); return s; }, new Set<string>())].sort();
  const header = ["ts", ...keys];
  const lines = [header.map(csvCell).join(",")];
  for (const f of frames) {
    const row = [f.ts, ...keys.map((k) => {
      const v = f.payload?.[k];
      return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    })];
    lines.push(row.map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `telemetry-${deviceId}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
