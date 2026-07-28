"use client";

// Command-latency observability for the IoT control plane.
//
// Primary data source is the live ring buffer in `@/lib/smarthome-realtime`,
// which every dashboard command writes to (send -> HTTP accept -> device echo).
// When an operator opens this page without having driven any devices in the
// current tab the buffer is empty, so a deterministic simulator keeps the
// charts meaningful. The active source is always labelled in the header.

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Cpu,
  Download,
  Gauge,
  Network,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Server,
  Signal,
  Timer,
  Trash2,
  Waypoints,
  Zap,
} from "lucide-react";
import {
  clearLatencySamples,
  percentile,
  summarizeLatency,
  useLatencySamples,
  type LatencySample,
} from "@/lib/smarthome-realtime";
import { BarChart, HBar, Legend, MultiLineChart, PALETTE, ProgressRing, RadarChart, Sparkline } from "../../charts";
import { rng } from "../_lib/store";
import { num } from "../_lib/format";
import {
  Badge,
  Btn,
  DataTable,
  Dot,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  SectionTitle,
  Segmented,
  StaggerGrid,
  StaggerItem,
  StatCard,
  Tabs,
  type Column,
  type Tone,
} from "../_ui";

type Tab = "overview" | "samples" | "devices" | "pipeline" | "network";
type Win = "5m" | "15m" | "1h";
type Source = "auto" | "live" | "demo";

const WIN_MS: Record<Win, number> = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000 };

/** SLO budget in ms for an end-to-end relay command. */
const SLO_MS = 800;

// ------------------------------------------------------------------- helpers

const fmtMs = (v: number) => `${Math.round(v)} ms`;
const clock = (t: number) =>
  new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

function toneForMs(ms: number): Tone {
  if (ms <= 400) return "green";
  if (ms <= SLO_MS) return "amber";
  return "red";
}

function colorForMs(ms: number): string {
  if (ms <= 400) return "#22c55e";
  if (ms <= SLO_MS) return "#f59e0b";
  return "#ef4444";
}

interface Bucket {
  t: number;
  label: string;
  p50: number;
  p90: number;
  p99: number;
  api: number;
  count: number;
  fails: number;
}

/** Split samples into `count` equal time buckets and percentile each one. */
function bucketize(list: LatencySample[], from: number, to: number, count: number): Bucket[] {
  const span = Math.max(1, to - from);
  const step = span / count;
  const bins: LatencySample[][] = Array.from({ length: count }, () => []);
  for (const s of list) {
    const idx = Math.min(count - 1, Math.max(0, Math.floor((s.sentAt - from) / step)));
    bins[idx].push(s);
  }
  return bins.map((bin, i) => {
    const rtts = bin.map((s) => s.rttMs).filter((v): v is number => v != null).sort((a, b) => a - b);
    const apis = bin.map((s) => s.apiMs).filter((v): v is number => v != null).sort((a, b) => a - b);
    const t = from + i * step;
    return {
      t,
      label: clock(t),
      p50: percentile(rtts, 50),
      p90: percentile(rtts, 90),
      p99: percentile(rtts, 99),
      api: percentile(apis, 50),
      count: bin.length,
      fails: bin.filter((s) => s.outcome !== "confirmed").length,
    };
  });
}

const HIST_EDGES = [100, 200, 300, 500, 750, 1000, 1500, 2500, 4000, Infinity];
const HIST_LABELS = ["<100", "100-200", "200-300", "300-500", "500-750", "0.75-1s", "1-1.5s", "1.5-2.5s", "2.5-4s", "4s+"];

function histogram(values: number[]): number[] {
  const out = HIST_EDGES.map(() => 0);
  for (const v of values) {
    const i = HIST_EDGES.findIndex((e) => v < e);
    out[i < 0 ? out.length - 1 : i] += 1;
  }
  return out;
}

interface DeviceRow {
  deviceId: string;
  deviceType: string;
  count: number;
  p50: number;
  p90: number;
  worst: number;
  fails: number;
  successRate: number;
  spark: number[];
}

function byDevice(list: LatencySample[]): DeviceRow[] {
  const map = new Map<string, LatencySample[]>();
  for (const s of list) {
    const arr = map.get(s.deviceId);
    if (arr) arr.push(s);
    else map.set(s.deviceId, [s]);
  }
  return [...map.entries()]
    .map(([deviceId, arr]) => {
      const rtts = arr.map((s) => s.rttMs).filter((v): v is number => v != null).sort((a, b) => a - b);
      const ok = arr.filter((s) => s.outcome === "confirmed").length;
      return {
        deviceId,
        deviceType: arr[arr.length - 1].deviceType || "device",
        count: arr.length,
        p50: percentile(rtts, 50),
        p90: percentile(rtts, 90),
        worst: rtts[rtts.length - 1] ?? 0,
        fails: arr.length - ok,
        successRate: arr.length ? (ok / arr.length) * 100 : 100,
        spark: arr.slice(-24).map((s) => s.rttMs ?? 0),
      };
    })
    .sort((a, b) => b.p90 - a.p90);
}

/**
 * Estimated per-hop split of a round trip. The control plane reports one
 * HTTP timing (`apiMs`) and one end-to-end timing (`rttMs`); the remainder is
 * apportioned across the MQTT legs using ratios observed on the reference
 * ESP32 fleet. Shown as an estimate, never as a measured value.
 */
const HOPS = [
  { key: "app", label: "App - Edge API", color: PALETTE[0], of: "api" as const, share: 0.45 },
  { key: "api", label: "API - MQTT broker", color: PALETTE[1], of: "api" as const, share: 0.55 },
  { key: "broker", label: "Broker - Device", color: PALETTE[2], of: "wire" as const, share: 0.4 },
  { key: "device", label: "Device switching", color: PALETTE[3], of: "wire" as const, share: 0.28 },
  { key: "echo", label: "Echo - Dashboard", color: PALETTE[4], of: "wire" as const, share: 0.32 },
];

function hopBreakdown(list: LatencySample[]): { name: string; value: number; color: string }[] {
  const conf = list.filter((s) => s.outcome === "confirmed" && s.rttMs != null);
  if (!conf.length) return HOPS.map((h) => ({ name: h.label, value: 0, color: h.color }));
  const api = conf.reduce((a, s) => a + (s.apiMs ?? 0), 0) / conf.length;
  const rtt = conf.reduce((a, s) => a + (s.rttMs ?? 0), 0) / conf.length;
  const wire = Math.max(0, rtt - api);
  return HOPS.map((h) => ({
    name: h.label,
    value: Math.round((h.of === "api" ? api : wire) * h.share),
    color: h.color,
  }));
}

// ---------------------------------------------------------------- simulator

const SIM_DEVICES: { id: string; type: string; base: number; jitter: number; loss: number }[] = [
  { id: "hub-livingroom", type: "home-hub", base: 210, jitter: 90, loss: 0.01 },
  { id: "hub-myroom", type: "home-hub", base: 260, jitter: 140, loss: 0.02 },
  { id: "touch-kitchen", type: "touchboard", base: 180, jitter: 70, loss: 0.005 },
  { id: "plug-fridge", type: "smart-plug", base: 320, jitter: 160, loss: 0.02 },
  { id: "tank-roof", type: "watertank", base: 480, jitter: 260, loss: 0.04 },
  { id: "gate-main", type: "rfid-gate", base: 620, jitter: 300, loss: 0.05 },
  { id: "door-front", type: "facedoor", base: 390, jitter: 150, loss: 0.02 },
];

const SIM_FIELDS: Record<string, string[]> = {
  "home-hub": ["power", "power2", "power3", "power4", "scene"],
  touchboard: ["g1", "g2", "g3"],
  "smart-plug": ["power"],
  watertank: ["pump", "auto"],
  "rfid-gate": ["barrier", "mode"],
  facedoor: ["locked"],
};

function makeSample(r: () => number, at: number, seq: number): LatencySample {
  const d = SIM_DEVICES[Math.floor(r() * SIM_DEVICES.length) % SIM_DEVICES.length];
  const fields = SIM_FIELDS[d.type] ?? ["power"];
  const field = fields[Math.floor(r() * fields.length) % fields.length];
  const spike = r() < 0.04 ? 3 + r() * 4 : 1;
  const rtt = Math.round((d.base + (r() - 0.35) * d.jitter) * spike);
  const api = Math.round(Math.min(rtt * 0.55, 45 + r() * 90));
  const dropped = r() < d.loss;
  return {
    id: `sim-${seq}`,
    deviceId: d.id,
    deviceType: d.type,
    fields: [field],
    sentAt: at,
    apiMs: dropped && r() < 0.4 ? null : api,
    rttMs: dropped ? null : Math.max(api + 20, rtt),
    outcome: dropped ? (r() < 0.4 ? "error" : "timeout") : "confirmed",
    error: dropped ? "device did not echo within 6000 ms" : undefined,
  };
}

function seedDemo(now: number, n: number): LatencySample[] {
  const r = rng("cv-latency-demo");
  const out: LatencySample[] = [];
  for (let i = 0; i < n; i++) {
    out.push(makeSample(r, now - Math.round(((n - i) / n) * 60 * 60_000), i));
  }
  return out;
}

// -------------------------------------------------------------------- page

export default function LatencyPage() {
  const liveSamples = useLatencySamples();
  const [mounted, setMounted] = useState(false);
  const [demo, setDemo] = useState<LatencySample[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [source, setSource] = useState<Source>("auto");
  const [win, setWin] = useState<Win>("15m");
  const [tab, setTab] = useState<Tab>("overview");
  const [now, setNow] = useState(0);

  useEffect(() => {
    const t = Date.now();
    setNow(t);
    setDemo(seedDemo(t, 420));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !streaming) return;
    let seq = 100000;
    const r = rng(`cv-latency-stream-${Math.floor(Date.now() / 1000)}`);
    const t = setInterval(() => {
      seq += 1;
      setDemo((prev) => [...prev.slice(-599), makeSample(r, Date.now(), seq)]);
    }, 1600);
    return () => clearInterval(t);
  }, [mounted, streaming]);

  const usingDemo = source === "demo" || (source === "auto" && liveSamples.length < 5);
  const pool = usingDemo ? demo : liveSamples;

  const from = now - WIN_MS[win];
  const samples = useMemo(() => pool.filter((s) => s.sentAt >= from), [pool, from]);
  const stats = useMemo(() => summarizeLatency(samples), [samples]);
  const buckets = useMemo(() => bucketize(samples, from, now || Date.now(), 24), [samples, from, now]);
  const devices = useMemo(() => byDevice(samples), [samples]);
  const hops = useMemo(() => hopBreakdown(samples), [samples]);

  const rtts = useMemo(() => samples.map((s) => s.rttMs).filter((v): v is number => v != null), [samples]);
  const withinSlo = rtts.length ? (rtts.filter((v) => v <= SLO_MS).length / rtts.length) * 100 : 100;
  const throughput = samples.length / (WIN_MS[win] / 60_000);

  function exportCsv() {
    const head = "sentAt,deviceId,deviceType,fields,apiMs,rttMs,outcome\n";
    const body = samples
      .map((s) =>
        [
          new Date(s.sentAt).toISOString(),
          s.deviceId,
          s.deviceType,
          `"${s.fields.join("|")}"`,
          s.apiMs ?? "",
          s.rttMs ?? "",
          s.outcome,
        ].join(",")
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `command-latency-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!mounted) {
    return (
      <div className="space-y-6">
        <PageHeader title="Latency & performance" icon={<Timer className="h-5 w-5" />} subtitle="Loading telemetry…" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ad-card h-24 animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="ad-card h-72 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Latency & performance"
        icon={<Timer className="h-5 w-5" />}
        subtitle="End-to-end command round trips measured from the dashboard tap to the device state echo, with per-hop attribution, SLO burn and link health."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Source>
              value={source}
              onChange={setSource}
              options={[
                { value: "auto", label: "Auto" },
                { value: "live", label: "Live" },
                { value: "demo", label: "Simulated" },
              ]}
            />
            <Btn variant="ghost" onClick={() => setStreaming((v) => !v)} title={streaming ? "Pause stream" : "Resume stream"}>
              {streaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {streaming ? "Pause" : "Resume"}
            </Btn>
            <Btn variant="ghost" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Btn>
          </div>
        }
      />

      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Dot tone={usingDemo ? "amber" : "green"} pulse={streaming} />
          <span className="font-semibold text-white">{usingDemo ? "Simulated fleet" : "Live control plane"}</span>
          <span className="ad-muted">
            {usingDemo
              ? "No commands recorded in this tab yet — showing a synthetic fleet with realistic timing."
              : `${num(liveSamples.length)} real commands captured in this session.`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<Win>
            value={win}
            onChange={setWin}
            options={[
              { value: "5m", label: "5m" },
              { value: "15m", label: "15m" },
              { value: "1h", label: "1h" },
            ]}
          />
          <Btn variant="ghost" size="sm" onClick={() => setNow(Date.now())} title="Refresh window">
            <RefreshCw className="h-4 w-4" />
          </Btn>
          {!usingDemo && (
            <Btn variant="ghost" size="sm" onClick={() => clearLatencySamples()} title="Clear captured samples">
              <Trash2 className="h-4 w-4" />
            </Btn>
          )}
        </div>
      </Panel>

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="p50 round trip"
            value={fmtMs(stats.p50)}
            icon={<Zap className="h-4 w-4" />}
            tone={toneForMs(stats.p50)}
            sub={`avg ${fmtMs(stats.avg)}`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="p90 round trip"
            value={fmtMs(stats.p90)}
            icon={<Activity className="h-4 w-4" />}
            tone={toneForMs(stats.p90)}
            sub={`p99 ${fmtMs(stats.p99)}`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Within SLO"
            value={`${withinSlo.toFixed(1)}%`}
            icon={<Gauge className="h-4 w-4" />}
            tone={withinSlo >= 99 ? "green" : withinSlo >= 95 ? "amber" : "red"}
            sub={`target under ${SLO_MS} ms`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Command throughput"
            value={`${throughput.toFixed(1)}/min`}
            icon={<ArrowDownUp className="h-4 w-4" />}
            tone="violet"
            sub={`${num(samples.length)} in ${win} · ${stats.failed} failed`}
          />
        </StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview", icon: <Activity className="h-4 w-4" /> },
          { value: "samples", label: "Round trips", icon: <Timer className="h-4 w-4" />, count: samples.length },
          { value: "devices", label: "Per device", icon: <Cpu className="h-4 w-4" />, count: devices.length },
          { value: "pipeline", label: "Hop analysis", icon: <Waypoints className="h-4 w-4" /> },
          { value: "network", label: "Link health", icon: <Network className="h-4 w-4" /> },
        ]}
      />

      {samples.length === 0 ? (
        <EmptyState
          icon={<Timer className="h-6 w-6" />}
          title="No commands in this window"
          hint="Widen the time window, switch the source to Simulated, or send a command from the device console to start recording."
          action={
            <Btn variant="primary" onClick={() => setSource("demo")}>
              Show simulated data
            </Btn>
          }
        />
      ) : (
        <>
          {tab === "overview" && <OverviewTab buckets={buckets} rtts={rtts} stats={stats} hops={hops} />}
          {tab === "samples" && <SamplesTab samples={samples} />}
          {tab === "devices" && <DevicesTab devices={devices} />}
          {tab === "pipeline" && <PipelineTab buckets={buckets} hops={hops} />}
          {tab === "network" && <NetworkTab buckets={buckets} devices={devices} stats={stats} />}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- tabs

type Stats = ReturnType<typeof summarizeLatency>;
type Hop = { name: string; value: number; color: string };

function OverviewTab({ buckets, rtts, stats, hops }: { buckets: Bucket[]; rtts: number[]; stats: Stats; hops: Hop[] }) {
  const labels = buckets.map((b) => b.label);
  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle
          right={
            <Legend
              items={[
                { name: "p50", color: PALETTE[0] },
                { name: "p90", color: PALETTE[3] },
                { name: "p99", color: PALETTE[6] },
              ]}
            />
          }
        >
          Round-trip percentiles
        </SectionTitle>
        <MultiLineChart
          labels={labels}
          unit=" ms"
          area
          height={260}
          yFmt={(v) => `${Math.round(v)}`}
          series={[
            { name: "p50", data: buckets.map((b) => b.p50), color: PALETTE[0] },
            { name: "p90", data: buckets.map((b) => b.p90), color: PALETTE[3] },
            { name: "p99", data: buckets.map((b) => b.p99), color: PALETTE[6] },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle>Round-trip distribution</SectionTitle>
          <BarChart labels={HIST_LABELS} data={histogram(rtts)} unit=" cmds" height={220} color={PALETTE[1]} />
        </Panel>
        <Panel>
          <SectionTitle>Reliability</SectionTitle>
          <div className="flex items-center justify-center py-2">
            <ProgressRing
              value={stats.successRate}
              label="confirmed"
              size={140}
              thickness={12}
              color={stats.successRate >= 99 ? "#22c55e" : stats.successRate >= 95 ? "#f59e0b" : "#ef4444"}
            />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Confirmed" value={num(stats.confirmed)} tone="green" />
            <Row label="Timed out / errored" value={num(stats.failed)} tone={stats.failed ? "red" : "slate"} />
            <Row label="Fastest" value={fmtMs(stats.min)} tone="green" />
            <Row label="Slowest" value={fmtMs(stats.max)} tone={toneForMs(stats.max)} />
            <Row label="API accept p50" value={fmtMs(stats.apiP50)} tone="blue" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<Badge tone="slate">estimated</Badge>}>Where the time goes</SectionTitle>
          <HBar items={hops} unit=" ms" />
          <p className="mt-3 text-xs ad-muted">
            Measured leg: browser to API accept. Remaining legs are apportioned from the observed device-echo
            delay using reference-fleet ratios.
          </p>
        </Panel>
        <Panel>
          <SectionTitle>Throughput & failures</SectionTitle>
          <MultiLineChart
            labels={labels}
            height={200}
            yFmt={(v) => `${Math.round(v)}`}
            series={[
              { name: "commands", data: buckets.map((b) => b.count), color: PALETTE[4] },
              { name: "failures", data: buckets.map((b) => b.fails), color: PALETTE[6] },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between">
      <span className="ad-muted">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

function SamplesTab({ samples }: { samples: LatencySample[] }) {
  const [filter, setFilter] = useState<"all" | "confirmed" | "failed">("all");
  const rows = useMemo(
    () =>
      [...samples]
        .filter((s) =>
          filter === "all" ? true : filter === "confirmed" ? s.outcome === "confirmed" : s.outcome !== "confirmed"
        )
        .sort((a, b) => b.sentAt - a.sentAt)
        .slice(0, 250),
    [samples, filter]
  );

  const columns: Column<LatencySample>[] = [
    {
      key: "sentAt",
      header: "Sent",
      sort: (a, b) => a.sentAt - b.sentAt,
      render: (r) => (
        <span className="tabular-nums ad-muted">{new Date(r.sentAt).toLocaleTimeString("en-IN", { hour12: false })}</span>
      ),
    },
    {
      key: "deviceId",
      header: "Device",
      sort: (a, b) => a.deviceId.localeCompare(b.deviceId),
      render: (r) => <span className="font-medium text-white">{r.deviceId}</span>,
    },
    { key: "deviceType", header: "Type", render: (r) => <Badge tone="violet">{r.deviceType}</Badge> },
    { key: "fields", header: "Fields", render: (r) => <span className="ad-muted">{r.fields.join(", ") || "—"}</span> },
    {
      key: "apiMs",
      header: "API",
      align: "right",
      sort: (a, b) => (a.apiMs ?? 1e9) - (b.apiMs ?? 1e9),
      render: (r) => <span className="tabular-nums ad-muted">{r.apiMs == null ? "—" : `${r.apiMs} ms`}</span>,
    },
    {
      key: "rttMs",
      header: "Round trip",
      align: "right",
      sort: (a, b) => (a.rttMs ?? 1e9) - (b.rttMs ?? 1e9),
      render: (r) =>
        r.rttMs == null ? (
          <span className="ad-muted">—</span>
        ) : (
          <span className="font-semibold tabular-nums" style={{ color: colorForMs(r.rttMs) }}>
            {r.rttMs} ms
          </span>
        ),
    },
    {
      key: "outcome",
      header: "Outcome",
      render: (r) => (
        <Badge tone={r.outcome === "confirmed" ? "green" : r.outcome === "timeout" ? "amber" : "red"}>{r.outcome}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<"all" | "confirmed" | "failed">
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "confirmed", label: "Confirmed" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <span className="text-xs ad-muted">
          Showing latest {rows.length} of {samples.length}
        </span>
      </div>
      <Panel pad={false}>
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} dense empty="No commands match this filter." />
      </Panel>
    </div>
  );
}

function DevicesTab({ devices }: { devices: DeviceRow[] }) {
  const columns: Column<DeviceRow>[] = [
    {
      key: "deviceId",
      header: "Device",
      sort: (a, b) => a.deviceId.localeCompare(b.deviceId),
      render: (r) => <span className="font-medium text-white">{r.deviceId}</span>,
    },
    { key: "deviceType", header: "Type", render: (r) => <Badge tone="violet">{r.deviceType}</Badge> },
    {
      key: "count",
      header: "Commands",
      align: "right",
      sort: (a, b) => a.count - b.count,
      render: (r) => <span className="tabular-nums">{num(r.count)}</span>,
    },
    {
      key: "p50",
      header: "p50",
      align: "right",
      sort: (a, b) => a.p50 - b.p50,
      render: (r) => (
        <span className="tabular-nums" style={{ color: colorForMs(r.p50) }}>
          {fmtMs(r.p50)}
        </span>
      ),
    },
    {
      key: "p90",
      header: "p90",
      align: "right",
      sort: (a, b) => a.p90 - b.p90,
      render: (r) => (
        <span className="font-semibold tabular-nums" style={{ color: colorForMs(r.p90) }}>
          {fmtMs(r.p90)}
        </span>
      ),
    },
    {
      key: "worst",
      header: "Worst",
      align: "right",
      sort: (a, b) => a.worst - b.worst,
      render: (r) => <span className="tabular-nums ad-muted">{fmtMs(r.worst)}</span>,
    },
    {
      key: "successRate",
      header: "Success",
      align: "right",
      sort: (a, b) => a.successRate - b.successRate,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <div className="w-16">
            <Progress value={r.successRate} tone={r.successRate >= 99 ? "green" : r.successRate >= 95 ? "amber" : "red"} height={6} />
          </div>
          <span className="w-12 text-right tabular-nums">{r.successRate.toFixed(0)}%</span>
        </div>
      ),
    },
    { key: "spark", header: "Trend", render: (r) => <Sparkline data={r.spark} color={colorForMs(r.p90)} width={80} height={26} /> },
  ];

  const worst = devices.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<Badge tone="amber">slowest first</Badge>}>p90 by device</SectionTitle>
          <HBar items={worst.map((d) => ({ name: d.deviceId, value: Math.round(d.p90), color: colorForMs(d.p90) }))} unit=" ms" />
        </Panel>
        <Panel>
          <SectionTitle>Command volume</SectionTitle>
          <HBar items={worst.map((d, i) => ({ name: d.deviceId, value: d.count, color: PALETTE[i % PALETTE.length] }))} />
        </Panel>
      </div>
      <Panel pad={false}>
        <DataTable rows={devices} columns={columns} rowKey={(r) => r.deviceId} empty="No device activity in this window." />
      </Panel>
    </div>
  );
}

function PipelineTab({ buckets, hops }: { buckets: Bucket[]; hops: Hop[] }) {
  const total = hops.reduce((a, h) => a + h.value, 0) || 1;
  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle right={<Badge tone="slate">tap to relay to dashboard</Badge>}>Command pipeline</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {hops.map((h, i) => (
            <div key={h.name} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ad-muted">
                <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ background: h.color }}>
                  {i + 1}
                </span>
                stage
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{h.name}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: h.color }}>
                {h.value}
                <span className="text-sm ad-muted"> ms</span>
              </p>
              <div className="mt-2">
                <Progress value={(h.value / total) * 100} tone="brand" height={5} />
              </div>
              <p className="mt-1 text-[11px] ad-muted">{((h.value / total) * 100).toFixed(0)}% of budget</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle>API accept vs full round trip</SectionTitle>
          <MultiLineChart
            labels={buckets.map((b) => b.label)}
            height={240}
            unit=" ms"
            area
            yFmt={(v) => `${Math.round(v)}`}
            series={[
              { name: "API accept (p50)", data: buckets.map((b) => b.api), color: PALETTE[5] },
              { name: "Full round trip (p50)", data: buckets.map((b) => b.p50), color: PALETTE[0] },
            ]}
          />
        </Panel>
        <Panel>
          <SectionTitle>Budget split</SectionTitle>
          <div className="space-y-3">
            {hops.map((h) => (
              <div key={h.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-300">{h.name}</span>
                  <span className="tabular-nums text-white">{h.value} ms</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div className="h-2 rounded-full" style={{ width: `${(h.value / total) * 100}%`, background: h.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Optimistic UI hides the first stages from the operator — the switch animates on tap and reconciles when the
            device echoes.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function NetworkTab({ buckets, devices, stats }: { buckets: Bucket[]; devices: DeviceRow[]; stats: Stats }) {
  const jitter = useMemo(() => {
    const vals = buckets.map((b) => b.p50).filter((v) => v > 0);
    if (vals.length < 2) return 0;
    const diffs = vals.slice(1).map((v, i) => Math.abs(v - vals[i]));
    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }, [buckets]);

  const lossPct = stats.count ? (stats.failed / stats.count) * 100 : 0;
  const top = devices.slice(0, 6);
  const radarAxes = top.map((d) => d.deviceId.split("-")[0] || d.deviceId);
  const radarSeries = [
    { name: "p50", data: top.map((d) => Math.round(d.p50)), color: PALETTE[0] },
    { name: "p90", data: top.map((d) => Math.round(d.p90)), color: PALETTE[3] },
  ];

  return (
    <div className="space-y-4">
      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Jitter (p50 drift)"
            value={fmtMs(jitter)}
            icon={<Signal className="h-4 w-4" />}
            tone={jitter < 60 ? "green" : jitter < 150 ? "amber" : "red"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Command loss"
            value={`${lossPct.toFixed(2)}%`}
            icon={<Radio className="h-4 w-4" />}
            tone={lossPct < 1 ? "green" : lossPct < 3 ? "amber" : "red"}
            sub="timeouts + errors"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Broker" value="MQTT 3.1.1" icon={<Server className="h-4 w-4" />} tone="blue" sub="TLS · QoS 1 · retained state" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Dashboard link" value="WebSocket" icon={<Network className="h-4 w-4" />} tone="violet" sub="adaptive poll fallback" />
        </StaggerItem>
      </StaggerGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Latency profile by device</SectionTitle>
          {radarAxes.length >= 3 ? (
            <RadarChart axes={radarAxes} series={radarSeries} size={260} />
          ) : (
            <p className="py-8 text-center text-sm ad-muted">Needs at least three active devices.</p>
          )}
        </Panel>
        <Panel>
          <SectionTitle>Transport strategy</SectionTitle>
          <div className="space-y-3 text-sm">
            <HopCard icon={<Zap className="h-3.5 w-3.5" />} title="Optimistic paint" desc="Projected device state applied on tap — 0 ms perceived." tone="green" />
            <HopCard icon={<Radio className="h-3.5 w-3.5" />} title="MQTT push" desc="Device echo fans out over WebSocket, typically under 400 ms." tone="brand" />
            <HopCard icon={<RefreshCw className="h-3.5 w-3.5" />} title="Adaptive poll" desc="900 ms while a command is unconfirmed, 15 s when idle." tone="blue" />
            <HopCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Bounded optimism" desc="Unconfirmed writes are released after 6 s and surfaced as failed." tone="amber" />
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionTitle>Failure rate over time</SectionTitle>
        <BarChart labels={buckets.map((b) => b.label)} data={buckets.map((b) => b.fails)} color={PALETTE[6]} height={200} unit=" failed" />
      </Panel>
    </div>
  );
}

function HopCard({ icon, title, desc, tone }: { icon: React.ReactNode; title: string; desc: string; tone: Tone }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <Badge tone={tone}>{icon}</Badge>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-xs ad-muted">{desc}</p>
      </div>
    </div>
  );
}
