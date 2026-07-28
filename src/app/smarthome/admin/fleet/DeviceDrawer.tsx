"use client";

import { useMemo, useState } from "react";
import {
  Cpu, Wifi, Battery, Activity, Terminal, History, GitCompareArrows, Send, Power,
  RefreshCw, Crosshair, Trash2, Radio, Gauge as GaugeIcon,
} from "lucide-react";
import { LineChart, Sparkline } from "../../charts";
import type { FleetDevice } from "../_lib/sim";
import { rng, int, walk } from "../_lib/store";
import { relativeTime, uptime } from "../_lib/format";
import { Drawer, Tabs, Badge, Btn, Progress, Dot, TONE, type Tone } from "../_ui";

type Tab = "twin" | "telemetry" | "network" | "commands" | "history";

const healthTone = (h: string): Tone => (h === "healthy" ? "green" : h === "warning" ? "amber" : h === "critical" ? "red" : "slate");

export default function DeviceDrawer({ device, onClose, onCommand }: { device: FleetDevice | null; onClose: () => void; onCommand?: (id: string, cmd: string) => void }) {
  const [tab, setTab] = useState<Tab>("twin");
  if (!device) return null;
  return (
    <Drawer open={!!device} onClose={onClose} title={device.name} width={560}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={device.online ? "green" : "slate"}><Dot tone={device.online ? "green" : "slate"} pulse={device.online} /> {device.online ? "Online" : "Offline"}</Badge>
        <Badge tone={healthTone(device.health)}>Health {device.healthScore}</Badge>
        <Badge tone="blue">{device.lifecycle}</Badge>
        <Badge tone="slate">{device.model}</Badge>
        <span className="ml-auto font-mono text-xs ad-muted">{device.id}</span>
      </div>

      <div className="mb-4">
        <Tabs<Tab>
          value={tab} onChange={setTab}
          tabs={[
            { value: "twin", label: "Digital Twin", icon: <GitCompareArrows className="h-4 w-4" /> },
            { value: "telemetry", label: "Telemetry", icon: <Activity className="h-4 w-4" /> },
            { value: "network", label: "Network", icon: <Wifi className="h-4 w-4" /> },
            { value: "commands", label: "Commands", icon: <Terminal className="h-4 w-4" /> },
            { value: "history", label: "History", icon: <History className="h-4 w-4" /> },
          ]}
        />
      </div>

      {tab === "twin" && <TwinTab device={device} />}
      {tab === "telemetry" && <TelemetryTab device={device} />}
      {tab === "network" && <NetworkTab device={device} />}
      {tab === "commands" && <CommandsTab device={device} onCommand={onCommand} />}
      {tab === "history" && <HistoryTab device={device} />}
    </Drawer>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-sm last:border-0">
      <span className="ad-muted">{k}</span>
      <span className="font-medium text-white">{v}</span>
    </div>
  );
}

function TwinTab({ device }: { device: FleetDevice }) {
  const r = rng(device.id + "twin");
  const rows = [
    { field: "power", reported: "on", desired: "on" },
    { field: "brightness", reported: `${int(r, 20, 90)}%`, desired: `${int(r, 20, 90)}%` },
    { field: "target_temp", reported: `${int(r, 18, 24)}°C`, desired: `${int(r, 18, 24)}°C` },
    { field: "mode", reported: "auto", desired: "eco" },
    { field: "fw_version", reported: device.fw, desired: device.fw },
    { field: "report_interval", reported: "30s", desired: "15s" },
  ];
  return (
    <div className="space-y-4">
      <div className="ad-card rounded-xl p-4">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ad-muted">
          <span>Reported (device)</span><span /><span className="text-right">Desired (cloud)</span>
        </div>
        {rows.map((row) => {
          const drift = row.reported !== row.desired;
          return (
            <div key={row.field} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-white/5 py-2 text-sm">
              <span className="font-mono text-slate-200">{row.field}: <span className="text-white">{row.reported}</span></span>
              <span className={drift ? "text-amber-400" : "text-slate-600"}>{drift ? "≠" : "="}</span>
              <span className="text-right font-mono text-slate-200"><span className={drift ? "text-amber-300" : "text-white"}>{row.desired}</span></span>
            </div>
          );
        })}
      </div>
      <Btn variant="primary" className="w-full"><RefreshCw className="h-4 w-4" /> Reconcile desired state</Btn>
    </div>
  );
}

function TelemetryTab({ device }: { device: FleetDevice }) {
  const power = useMemo(() => walk(device.id + "pw", 60, 40, 6, 0), [device.id]);
  const temp = useMemo(() => walk(device.id + "tp", 60, 22, 1.2, 10), [device.id]);
  const rssi = useMemo(() => walk(device.id + "rs", 60, Math.abs(device.rssi), 4, 20), [device.id, device.rssi]);
  return (
    <div className="space-y-4">
      <MetricBlock title="Power draw" unit="W" value={power[power.length - 1].toFixed(1)} data={power} color="#22d3ee" />
      <MetricBlock title="Temperature" unit="°C" value={temp[temp.length - 1].toFixed(1)} data={temp} color="#f59e0b" />
      <MetricBlock title="Signal (RSSI)" unit="dBm" value={`-${rssi[rssi.length - 1].toFixed(0)}`} data={rssi} color="#8b5cf6" />
    </div>
  );
}

function MetricBlock({ title, unit, value, data, color }: { title: string; unit: string; value: string; data: number[]; color: string }) {
  return (
    <div className="ad-card rounded-xl p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="text-lg font-bold tabular-nums" style={{ color }}>{value}<span className="ml-0.5 text-xs ad-muted">{unit}</span></span>
      </div>
      <LineChart data={data} color={color} height={90} />
    </div>
  );
}

function NetworkTab({ device }: { device: FleetDevice }) {
  const r = rng(device.id + "net");
  const cpu = useMemo(() => walk(device.id + "cpu", 40, device.cpu, 8, 0, 100), [device.id, device.cpu]);
  const mem = useMemo(() => walk(device.id + "mem", 40, device.mem, 5, 0, 100), [device.id, device.mem]);
  return (
    <div className="space-y-4">
      <div className="ad-card rounded-xl p-4">
        <KV k="Connectivity" v={<span className="capitalize">{device.connectivity}</span>} />
        <KV k="IP address" v={<span className="font-mono">{`10.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 2, 254)}`}</span>} />
        <KV k="MAC" v={<span className="font-mono">{Array.from({ length: 6 }, () => "0123456789ABCDEF"[int(r, 0, 15)] + "0123456789ABCDEF"[int(r, 0, 15)]).join(":")}</span>} />
        <KV k="Signal (RSSI)" v={`${device.rssi} dBm`} />
        <KV k="Gateway" v={device.gateway ?? "direct"} />
        <KV k="Uptime" v={uptime(device.uptimeSec)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="ad-card rounded-xl p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs ad-muted"><Cpu className="h-3.5 w-3.5" /> CPU {device.cpu}%</div>
          <Sparkline data={cpu} color="#06b6d4" width={220} height={40} />
        </div>
        <div className="ad-card rounded-xl p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs ad-muted"><GaugeIcon className="h-3.5 w-3.5" /> Memory {device.mem}%</div>
          <Sparkline data={mem} color="#8b5cf6" width={220} height={40} />
        </div>
      </div>
      {device.battery !== null && (
        <div className="ad-card rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-white"><Battery className="h-4 w-4" /> Battery</span><span className="font-bold text-white">{device.battery}%</span></div>
          <Progress value={device.battery} tone={device.battery > 40 ? "green" : device.battery > 15 ? "amber" : "red"} />
          <div className="mt-1.5 text-xs ad-muted">Power source: {device.powerSource}</div>
        </div>
      )}
    </div>
  );
}

function CommandsTab({ device, onCommand }: { device: FleetDevice; onCommand?: (id: string, cmd: string) => void }) {
  const [log, setLog] = useState<string[]>([`$ connected to ${device.id} over ${device.connectivity}`, "$ awaiting command…"]);
  const run = (cmd: string) => {
    onCommand?.(device.id, cmd);
    setLog((l) => [...l, `$ ${cmd}`, `> ack (${Math.round(20 + Math.random() * 180)}ms)`]);
  };
  const cmds = [
    { label: "Reboot", icon: Power, cmd: "reboot" },
    { label: "Identify", icon: Crosshair, cmd: "identify --blink" },
    { label: "Calibrate", icon: RefreshCw, cmd: "calibrate_sensor" },
    { label: "Ping", icon: Radio, cmd: "ping" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {cmds.map((c) => (
          <Btn key={c.cmd} variant="subtle" onClick={() => run(c.cmd)}><c.icon className="h-4 w-4" /> {c.label}</Btn>
        ))}
      </div>
      <div className="ad-card rounded-xl p-3">
        <div className="mb-2 flex items-center gap-2 text-xs ad-muted"><Terminal className="h-3.5 w-3.5" /> Remote shell (RPC)</div>
        <div className="max-h-44 overflow-y-auto rounded-lg bg-black/50 p-3 font-mono text-xs text-emerald-300">
          {log.map((l, i) => <div key={i} className={l.startsWith(">") ? "text-cyan-300" : ""}>{l}</div>)}
        </div>
        <div className="mt-2 flex gap-2">
          <input placeholder="Type a command…" className="ad-input flex-1 font-mono" onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value) { run(e.currentTarget.value); e.currentTarget.value = ""; } }} />
          <Btn variant="primary"><Send className="h-4 w-4" /></Btn>
        </div>
      </div>
      <Btn variant="danger" className="w-full" onClick={() => run("factory_reset --confirm")}><Trash2 className="h-4 w-4" /> Factory reset</Btn>
    </div>
  );
}

function HistoryTab({ device }: { device: FleetDevice }) {
  const r = rng(device.id + "hist");
  const events = useMemo(() => {
    const kinds = [
      ["Connected", "green"], ["Disconnected", "amber"], ["OTA applied 3.4.1", "blue"],
      ["Config pushed", "violet"], ["Warning: high CPU", "amber"], ["Reboot", "slate"],
      ["Certificate renewed", "green"], ["Command: calibrate", "blue"],
    ] as const;
    return Array.from({ length: 10 }, (_, i) => {
      const [label, tone] = kinds[int(r, 0, kinds.length - 1)];
      return { id: i, label, tone: tone as Tone, ts: new Date(Date.now() - i * int(r, 1, 40) * 36e5).toISOString() };
    });
  }, [device.id]);
  return (
    <div className="relative space-y-0 pl-4">
      <div className="absolute left-[7px] top-1 h-full w-px bg-white/10" />
      {events.map((e) => (
        <div key={e.id} className="relative flex items-start gap-3 py-2.5">
          <span className="absolute -left-[1px] mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: TONE[e.tone].fg }} />
          <div className="ml-4 flex-1">
            <div className="text-sm text-white">{e.label}</div>
            <div className="text-xs ad-muted">{relativeTime(e.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
