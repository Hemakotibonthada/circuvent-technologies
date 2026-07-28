"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Cpu, Wifi, TriangleAlert, ShieldAlert, Activity, Building2, DollarSign, Radar,
  ArrowRight, DownloadCloud, CircleCheck, CircleDot,
} from "lucide-react";
import { LineChart, MultiLineChart, Donut, HBar } from "../charts";
import {
  fleetStore, tenantsStore, incidentsStore, campaignsStore, servicesStore, auditStore,
  REGIONS, HEALTH, type Health,
} from "./_lib/sim";
import { useStore, walk } from "./_lib/store";
import { abbrNum, num, money, relativeTime } from "./_lib/format";
import { Panel, StatCard, Badge, Dot, Btn, SectionTitle, StaggerGrid, StaggerItem, Progress, TONE, type Tone } from "./_ui";

const HEALTH_TONE: Record<Health, Tone> = { healthy: "green", warning: "amber", critical: "red", offline: "slate" };

export default function AdminOverview() {
  const fleet = useStore(fleetStore);
  const tenants = useStore(tenantsStore);
  const incidents = useStore(incidentsStore);
  const campaigns = useStore(campaignsStore);
  const services = useStore(servicesStore);
  const audit = useStore(auditStore);
  const [ingest, setIngest] = useState(0);

  const stats = useMemo(() => {
    const totalDevices = tenants.reduce((s, t) => s + t.devices, 0);
    const online = fleet.filter((d) => d.online).length;
    const onlineRate = fleet.length ? (online / fleet.length) * 100 : 0;
    const health = HEALTH.map((h) => ({ h, n: fleet.filter((d) => d.health === h).length }));
    const byRegion = REGIONS.map((r) => ({ name: r, value: fleet.filter((d) => d.region === r).length }));
    const activeInc = incidents.filter((i) => i.status === "active").length;
    const mrr = tenants.reduce((s, t) => s + t.mrr, 0);
    const sev = ["critical", "major", "minor", "warning", "info"].map((s) => ({ name: s, value: incidents.filter((i) => i.severity === s).length }));
    return { totalDevices, online, onlineRate, health, byRegion, activeInc, mrr, sev };
  }, [fleet, tenants, incidents]);

  // Simulated live ingestion counter.
  useEffect(() => {
    const base = 14200;
    const tick = () => setIngest(base + Math.round(Math.sin(Date.now() / 3000) * 1800 + Math.random() * 600));
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, []);

  const growthActive = walk("growth-active", 30, 8200, 260, 5000);
  const growthProvisioned = walk("growth-prov", 30, 9600, 300, 6000);
  const throughput = walk("throughput", 48, 14, 3.2, 4).map((v) => Math.round(v * 1000));
  const rollingCampaigns = campaigns.filter((c) => c.status === "rolling" || c.status === "paused");
  const activeIncidents = incidents.filter((i) => i.status !== "resolved").slice(0, 6);
  const palette = ["#22c55e", "#f59e0b", "#ef4444", "#64748b"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
            <Radar className="h-4 w-4" /> Control Plane Overview
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Fleet command center</h1>
          <p className="mt-1 text-sm ad-muted">Real-time status across {num(tenants.length)} tenants and {abbrNum(stats.totalDevices)} managed devices.</p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="subtle"><Activity className="h-4 w-4" /> Live view</Btn>
          <Link href="/smarthome/admin/fleet"><Btn variant="primary">Open fleet <ArrowRight className="h-4 w-4" /></Btn></Link>
        </div>
      </div>

      {/* KPI row */}
      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StaggerItem><StatCard label="Managed devices" value={abbrNum(stats.totalDevices)} icon={<Cpu className="h-4 w-4" />} tone="brand" delta={4} sub="vs last week" /></StaggerItem>
        <StaggerItem><StatCard label="Online rate" value={`${stats.onlineRate.toFixed(1)}%`} icon={<Wifi className="h-4 w-4" />} tone="green" delta={1} sub={`${stats.online}/${fleet.length} sampled`} /></StaggerItem>
        <StaggerItem><StatCard label="Ingestion" value={`${abbrNum(ingest)}/s`} icon={<Activity className="h-4 w-4" />} tone="violet" sub="messages" /></StaggerItem>
        <StaggerItem><StatCard label="Active incidents" value={num(stats.activeInc)} icon={<ShieldAlert className="h-4 w-4" />} tone={stats.activeInc > 0 ? "red" : "green"} sub="needs triage" /></StaggerItem>
        <StaggerItem><StatCard label="Tenants" value={num(tenants.length)} icon={<Building2 className="h-4 w-4" />} tone="blue" sub={`${tenants.filter((t) => t.status === "active").length} active`} /></StaggerItem>
        <StaggerItem><StatCard label="MRR" value={money(stats.mrr)} icon={<DollarSign className="h-4 w-4" />} tone="amber" delta={6} sub="recurring" /></StaggerItem>
      </StaggerGrid>

      {/* Status matrix + charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle right={<Badge tone="green"><Dot tone="green" pulse /> streaming</Badge>}>Fleet growth · 30 days</SectionTitle>
          <MultiLineChart
            labels={Array.from({ length: 30 }, (_, i) => `${i + 1}`)}
            series={[
              { name: "Provisioned", data: growthProvisioned, color: "#8b5cf6" },
              { name: "Active", data: growthActive, color: "#06b6d4" },
            ]}
            height={240}
            area
          />
        </Panel>

        <Panel>
          <SectionTitle>Health distribution</SectionTitle>
          <div className="flex items-center justify-center py-2">
            <Donut size={168} segments={stats.health.map((h, i) => ({ label: h.h, value: h.n, color: palette[i] }))} />
          </div>
          <div className="mt-3 space-y-2">
            {stats.health.map((h) => (
              <div key={h.h} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 capitalize"><Dot tone={HEALTH_TONE[h.h]} /> {h.h}</span>
                <span className="font-semibold text-white tabular-nums">{h.n}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle right={<span className="text-xs ad-muted tabular-nums">{abbrNum(throughput[throughput.length - 1])}/s now</span>}>Telemetry throughput · 24h</SectionTitle>
          <LineChart data={throughput} color="#22d3ee" height={200} />
        </Panel>
        <Panel>
          <SectionTitle>Devices by region</SectionTitle>
          <HBar items={stats.byRegion.map((r, i) => ({ name: r.name, value: r.value, color: ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899"][i] }))} />
        </Panel>
      </div>

      {/* Incidents + OTA + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <SectionTitle right={<Link href="/smarthome/admin/alerts" className="text-xs text-cyan-400 hover:text-cyan-300">View all</Link>}>Active incidents</SectionTitle>
          <div className="space-y-2">
            {activeIncidents.length === 0 && <p className="py-6 text-center text-sm ad-muted">All clear — no open incidents.</p>}
            {activeIncidents.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: TONE[sevTone(i.severity)].bg, color: TONE[sevTone(i.severity)].fg }}>
                  <TriangleAlert className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{i.title}</div>
                  <div className="truncate text-xs ad-muted">{i.device} · {relativeTime(i.openedAt)}</div>
                </div>
                <Badge tone={sevTone(i.severity)}>{i.severity}</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle right={<Link href="/smarthome/admin/ota" className="text-xs text-cyan-400 hover:text-cyan-300">Campaigns</Link>}>OTA in progress</SectionTitle>
          <div className="space-y-3">
            {rollingCampaigns.length === 0 && <p className="py-6 text-center text-sm ad-muted">No active deployments.</p>}
            {rollingCampaigns.map((c) => {
              const done = c.total ? (c.success / c.total) * 100 : 0;
              return (
                <div key={c.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-white"><DownloadCloud className="h-4 w-4 text-cyan-400" /> {c.name}</span>
                    <Badge tone={c.status === "paused" ? "amber" : "brand"}>{c.status}</Badge>
                  </div>
                  <Progress value={done} tone="brand" />
                  <div className="mt-1.5 flex justify-between text-[11px] ad-muted tabular-nums">
                    <span>{num(c.success)}/{num(c.total)} · {done.toFixed(0)}%</span>
                    <span>{c.failed > 0 ? `${c.failed} failed` : "on track"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle right={<Link href="/smarthome/admin/platform" className="text-xs text-cyan-400 hover:text-cyan-300">Platform</Link>}>System health</SectionTitle>
          <div className="space-y-1.5">
            {services.slice(0, 7).map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                {s.status === "operational" ? <CircleCheck className="h-4 w-4 text-green-400" /> : <CircleDot className="h-4 w-4" style={{ color: s.status === "degraded" ? "#fbbf24" : "#f87171" }} />}
                <span className="flex-1 truncate text-sm text-slate-200">{s.name}</span>
                <span className="text-xs ad-muted tabular-nums">{s.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Activity feed */}
      <Panel>
        <SectionTitle right={<Link href="/smarthome/admin/access" className="text-xs text-cyan-400 hover:text-cyan-300">Audit log</Link>}>Recent platform activity</SectionTitle>
        <div className="divide-y divide-white/5">
          {audit.slice(0, 8).map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Dot tone={a.category === "security" ? "red" : a.category === "billing" ? "amber" : "brand"} />
              <span className="text-slate-200"><span className="font-semibold text-white">{a.actor}</span> {a.action}</span>
              <span className="ad-muted">· {a.target}</span>
              <span className="ml-auto text-xs ad-muted">{relativeTime(a.ts)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function sevTone(sev: string): Tone {
  return sev === "critical" ? "red" : sev === "major" ? "red" : sev === "minor" ? "amber" : sev === "warning" ? "amber" : "blue";
}
