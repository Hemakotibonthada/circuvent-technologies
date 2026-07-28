"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Server, Boxes, Plug, CreditCard, Webhook, Activity, Database, Cloud, Cpu, HardDriveDownload,
  CircleCheck, CircleDot, RefreshCw, Bell, Languages, Mail, Flag, Code2, Send,
} from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { LineChart, HBar, ProgressRing } from "../../charts";
import {
  servicesStore, integrationsStore, invoicesStore, webhooksStore, flagsStore, tenantsStore,
  type Microservice, type Invoice,
} from "../_lib/sim";
import { useStore, walk } from "../_lib/store";
import { relativeTime, num, money, abbrNum, uptime } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Toggle, Tabs, DataTable, SectionTitle,
  StaggerGrid, StaggerItem, Progress, type Column, type Tone,
} from "../_ui";

type Tab = "health" | "integrations" | "billing" | "api";

export default function PlatformPage() {
  const services = useStore(servicesStore);
  const tenants = useStore(tenantsStore);
  const [tab, setTab] = useState<Tab>("health");
  const [health, setHealth] = useState<{ mqtt: boolean; db: boolean; uptimeSec: number } | null>(null);

  useEffect(() => {
    controlPlane.adminHealth().then((r) => { if (r.ok) setHealth({ mqtt: r.data.mqtt, db: r.data.db, uptimeSec: r.data.uptimeSec }); });
  }, []);

  const operational = services.filter((s) => s.status === "operational").length;
  const mrr = tenants.reduce((s, t) => s + t.mrr, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform & operations" icon={<Server className="h-5 w-5" />}
        subtitle="API gateway, integrations, usage-based billing, system health, auto-scaling, backups and feature management."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Services healthy" value={`${operational}/${services.length}`} icon={<CircleCheck className="h-4 w-4" />} tone={operational === services.length ? "green" : "amber"} /></StaggerItem>
        <StaggerItem><StatCard label="Platform uptime" value={health ? uptime(health.uptimeSec) : "99.98%"} icon={<Activity className="h-4 w-4" />} tone="brand" /></StaggerItem>
        <StaggerItem><StatCard label="MRR" value={money(mrr)} icon={<CreditCard className="h-4 w-4" />} tone="violet" delta={6} /></StaggerItem>
        <StaggerItem><StatCard label="API calls 24h" value="48.2M" icon={<Code2 className="h-4 w-4" />} tone="blue" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "health", label: "System Health", icon: <Server className="h-4 w-4" /> },
          { value: "integrations", label: "Integrations", icon: <Plug className="h-4 w-4" /> },
          { value: "billing", label: "Billing", icon: <CreditCard className="h-4 w-4" /> },
          { value: "api", label: "API & Webhooks", icon: <Webhook className="h-4 w-4" /> },
        ]}
      />

      {tab === "health" && <HealthTab services={services} health={health} />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "billing" && <BillingTab />}
      {tab === "api" && <ApiTab />}
    </div>
  );
}

function HealthTab({ services, health }: { services: Microservice[]; health: { mqtt: boolean; db: boolean } | null }) {
  const statusTone: Record<string, Tone> = { operational: "green", degraded: "amber", down: "red" };
  const cols: Column<Microservice>[] = [
    { key: "name", header: "Service", render: (s) => (<div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-cyan-400" /><span className="font-mono text-white">{s.name}</span><span className="text-[11px] ad-muted">{s.version}</span></div>) },
    { key: "status", header: "Status", render: (s) => <Badge tone={statusTone[s.status]}><Dot tone={statusTone[s.status]} pulse={s.status !== "down"} /> {s.status}</Badge> },
    { key: "latency", header: "Latency", align: "right", sort: (a, b) => a.latencyMs - b.latencyMs, render: (s) => <span className="tabular-nums text-slate-300">{s.latencyMs}ms</span> },
    { key: "cpu", header: "CPU", render: (s) => <div className="w-16"><Progress value={s.cpu} tone={s.cpu > 80 ? "red" : "brand"} height={5} /></div> },
    { key: "mem", header: "Mem", render: (s) => <div className="w-16"><Progress value={s.mem} tone={s.mem > 85 ? "amber" : "violet"} height={5} /></div> },
    { key: "instances", header: "Instances", align: "right", render: (s) => <span className="tabular-nums text-white">{s.instances}×</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        {[["MQTT broker", health?.mqtt ?? true, Cpu], ["Database", health?.db ?? true, Database], ["Redis cache", true, HardDriveDownload], ["Object storage", true, Cloud]].map(([l, ok, Icon]) => (
          <Panel key={l as string}>
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}>{typeof Icon === "function" ? <Icon className="h-4 w-4" /> : null}</span>
              {ok ? <CircleCheck className="h-5 w-5 text-green-400" /> : <CircleDot className="h-5 w-5 text-red-400" />}
            </div>
            <div className="mt-2 font-semibold text-white">{l as string}</div>
            <div className="text-xs ad-muted">{ok ? "operational" : "down"}</div>
          </Panel>
        ))}
      </div>
      <DataTable rows={services} columns={cols} rowKey={(s) => s.id} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<Badge tone="brand">auto-scaling</Badge>}>Cluster load · MQTT brokers</SectionTitle>
          <LineChart data={walk("cluster", 40, 45, 8, 5, 100)} color="#22d3ee" height={150} />
          <div className="mt-2 flex justify-between text-xs ad-muted"><span>Target 60% · scale-out at 75%</span><span>6 → 9 instances today</span></div>
        </Panel>
        <Panel>
          <SectionTitle>Backup & disaster recovery</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"><span className="text-white">Last snapshot</span><span className="text-slate-300">42 min ago</span></div>
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"><span className="text-white">Point-in-time recovery</span><Badge tone="green">enabled</Badge></div>
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"><span className="text-white">Multi-region failover</span><Badge tone="green">us-east ↔ eu-central</Badge></div>
            <Btn variant="subtle" className="w-full"><RefreshCw className="h-4 w-4" /> Trigger manual snapshot</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const integrations = useStore(integrationsStore);
  const catIcon: Record<string, typeof Cloud> = { cloud: Cloud, database: Database, messaging: Send, erp: Boxes, notify: Bell };
  const statusTone: Record<string, Tone> = { connected: "green", error: "red", disconnected: "slate" };
  const toggle = (id: string) => integrationsStore.set((p) => p.map((i) => i.id === id ? { ...i, status: i.status === "connected" ? "disconnected" : "connected", lastSync: new Date().toISOString() } : i));
  return (
    <StaggerGrid className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {integrations.map((it) => {
        const Icon = catIcon[it.category];
        return (
          <StaggerItem key={it.id}>
            <Panel>
              <div className="flex items-start justify-between">
                <span className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><Icon className="h-4 w-4" /></span><span className="font-medium text-white">{it.name}</span></span>
                <Badge tone={statusTone[it.status]}><Dot tone={statusTone[it.status]} /> {it.status}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs ad-muted">
                <span>{it.lastSync ? `synced ${relativeTime(it.lastSync)}` : "never synced"} · {abbrNum(it.events24h)} events/24h</span>
              </div>
              <Btn size="sm" variant={it.status === "connected" ? "ghost" : "primary"} className="mt-3 w-full" onClick={() => toggle(it.id)}>{it.status === "connected" ? "Disconnect" : "Connect"}</Btn>
            </Panel>
          </StaggerItem>
        );
      })}
    </StaggerGrid>
  );
}

function BillingTab() {
  const invoices = useStore(invoicesStore);
  const tenants = useStore(tenantsStore);
  const statusTone: Record<string, Tone> = { paid: "green", open: "amber", overdue: "red" };
  const byTenant = tenants.map((t, i) => ({ name: t.name, value: t.mrr, color: ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899"][i % 6] }));
  const mrr = tenants.reduce((s, t) => s + t.mrr, 0);
  const cols: Column<Invoice>[] = [
    { key: "tenant", header: "Tenant", render: (i) => <span className="font-medium text-white">{i.tenant}</span> },
    { key: "period", header: "Period", render: (i) => <span className="text-slate-300">{i.period}</span> },
    { key: "devices", header: "Devices", align: "right", render: (i) => <span className="tabular-nums ad-muted">{num(i.devices)}</span> },
    { key: "api", header: "API calls", align: "right", render: (i) => <span className="tabular-nums ad-muted">{abbrNum(i.apiCalls)}</span> },
    { key: "amount", header: "Amount", align: "right", sort: (a, b) => a.amount - b.amount, render: (i) => <span className="font-semibold text-white tabular-nums">{money(i.amount)}</span> },
    { key: "status", header: "Status", align: "right", render: (i) => <Badge tone={statusTone[i.status]}>{i.status}</Badge> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle right={<Badge tone="green"><Dot tone="green" /> Stripe connected</Badge>}>Recurring revenue by tenant</SectionTitle>
          <HBar items={byTenant} unit="/mo" />
          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3"><span className="text-sm ad-muted">Total MRR</span><span className="text-xl font-extrabold text-white">{money(mrr)}</span></div>
        </Panel>
        <Panel>
          <SectionTitle>Billing model</SectionTitle>
          <div className="flex justify-center py-2"><ProgressRing value={78} max={100} size={130} label="78%" color="#8b5cf6" /></div>
          <p className="text-center text-xs ad-muted">Usage-based revenue share (devices + API + storage)</p>
        </Panel>
      </div>
      <div>
        <SectionTitle right={<Btn size="sm" variant="subtle"><CreditCard className="h-3.5 w-3.5" /> Export invoices</Btn>}>Invoices</SectionTitle>
        <DataTable rows={invoices} columns={cols} rowKey={(i) => i.id} />
      </div>
    </div>
  );
}

function ApiTab() {
  const webhooks = useStore(webhooksStore);
  const flags = useStore(flagsStore);
  const endpoints = [
    { m: "GET", path: "/v2/devices", tone: "green" as Tone }, { m: "POST", path: "/v2/devices/{id}/command", tone: "amber" as Tone },
    { m: "GET", path: "/v2/telemetry", tone: "green" as Tone }, { m: "POST", path: "/v2/ota/campaigns", tone: "amber" as Tone },
    { m: "GET", path: "/v2/incidents", tone: "green" as Tone }, { m: "DELETE", path: "/v2/devices/{id}", tone: "red" as Tone },
  ];
  const mTone: Record<string, Tone> = { GET: "green", POST: "amber", DELETE: "red", PUT: "blue" };
  const whTone: Record<string, Tone> = { active: "green", failing: "red", paused: "slate" };
  const toggleFlag = (id: string) => flagsStore.set((p) => p.map((f) => f.id === id ? { ...f, enabled: !f.enabled } : f));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<div className="flex gap-2"><Badge tone="brand">REST</Badge><Badge tone="violet">GraphQL</Badge></div>}>API gateway · OpenAPI</SectionTitle>
          <div className="space-y-1.5 font-mono text-xs">
            {endpoints.map((e) => (
              <div key={e.path} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <Badge tone={mTone[e.m]}>{e.m}</Badge><span className="text-slate-200">{e.path}</span>
              </div>
            ))}
          </div>
          <Btn variant="subtle" className="mt-3 w-full"><Code2 className="h-4 w-4" /> Open Swagger UI</Btn>
        </Panel>
        <Panel>
          <SectionTitle right={<Btn size="sm" variant="subtle"><Webhook className="h-3.5 w-3.5" /> Add</Btn>}>Outbound webhooks</SectionTitle>
          <div className="space-y-2">
            {webhooks.slice(0, 6).map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <Dot tone={whTone[w.status]} pulse={w.status === "active"} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{w.url}</span>
                <span className="text-[11px] ad-muted tabular-nums">{w.successRate}%</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<span className="flex items-center gap-1.5 text-xs ad-muted"><Flag className="h-3.5 w-3.5" /> {flags.filter((f) => f.enabled).length} on</span>}>Feature flags</SectionTitle>
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
                <span className="min-w-0"><span className="block truncate font-mono text-sm text-white">{f.key}</span><span className="block truncate text-[11px] ad-muted">{f.audience} · {f.rollout}%</span></span>
                <Toggle checked={f.enabled} onChange={() => toggleFlag(f.id)} />
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel>
            <SectionTitle>Localization (i18n)</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {["English", "Español", "Deutsch", "Français", "日本語", "हिन्दी"].map((l, i) => (
                <span key={l} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${i < 3 ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400"}`}><Languages className="h-3.5 w-3.5" /> {l}</span>
              ))}
            </div>
          </Panel>
          <Panel>
            <SectionTitle>System</SectionTitle>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"><span className="flex items-center gap-2 text-white"><Mail className="h-4 w-4 text-cyan-400" /> Custom SMTP gateway</span><Badge tone="green">configured</Badge></div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"><span className="flex items-center gap-2 text-white"><Bell className="h-4 w-4 text-amber-400" /> Maintenance banner</span><Toggle checked={false} onChange={() => {}} /></div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"><span className="text-white">Platform build</span><span className="font-mono text-xs ad-muted">v2.4.1 · #8f2a1c</span></div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
