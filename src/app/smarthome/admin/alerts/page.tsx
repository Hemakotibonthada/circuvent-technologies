"use client";

import { useMemo, useState } from "react";
import {
  BellRing, TriangleAlert, CircleCheck, Clock, Mail, MessageSquare, Phone, Smartphone,
  Hash, Send, CheckCheck, ArrowUpRight, Bell, Volume2, Search as SearchIcon,
} from "lucide-react";
import { MultiLineChart, HBar, Donut } from "../../charts";
import { incidentsStore, type Incident } from "../_lib/sim";
import { useStore, walk } from "../_lib/store";
import { relativeTime, fmtDateTime, num, duration } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Tabs, Select, DataTable, Drawer, Toggle,
  SectionTitle, StaggerGrid, StaggerItem, type Column, type Tone,
} from "../_ui";

type Tab = "incidents" | "channels" | "escalation" | "analytics";

const sevTone = (s: string): Tone => (s === "critical" ? "red" : s === "major" ? "red" : s === "minor" ? "amber" : s === "warning" ? "amber" : "blue");
const statusTone: Record<string, Tone> = { active: "red", acknowledged: "amber", resolved: "green" };

export default function AlertsPage() {
  const incidents = useStore(incidentsStore);
  const [tab, setTab] = useState<Tab>("incidents");

  const stats = useMemo(() => {
    const active = incidents.filter((i) => i.status === "active").length;
    const resolved = incidents.filter((i) => i.status === "resolved" && i.resolvedAt);
    const mttrSec = resolved.length ? resolved.reduce((s, i) => s + (+new Date(i.resolvedAt!) - +new Date(i.openedAt)) / 1000, 0) / resolved.length : 0;
    const ack = incidents.filter((i) => i.status !== "active").length;
    return { active, mttr: mttrSec, ackRate: incidents.length ? (ack / incidents.length) * 100 : 0 };
  }, [incidents]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts & incident management" icon={<BellRing className="h-5 w-5" />}
        subtitle="Multi-channel dispatch, severity classification, acknowledgment workflow, escalation and MTTR analytics."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Active incidents" value={num(stats.active)} icon={<TriangleAlert className="h-4 w-4" />} tone={stats.active ? "red" : "green"} sub="need triage" /></StaggerItem>
        <StaggerItem><StatCard label="Mean time to resolve" value={duration(stats.mttr)} icon={<Clock className="h-4 w-4" />} tone="brand" delta={-8} /></StaggerItem>
        <StaggerItem><StatCard label="Ack rate" value={`${stats.ackRate.toFixed(0)}%`} icon={<CheckCheck className="h-4 w-4" />} tone="violet" /></StaggerItem>
        <StaggerItem><StatCard label="Alerts today" value="184" icon={<Bell className="h-4 w-4" />} tone="amber" sub="across all channels" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "incidents", label: "Incidents", icon: <TriangleAlert className="h-4 w-4" />, count: incidents.filter((i) => i.status !== "resolved").length },
          { value: "channels", label: "Channels", icon: <Send className="h-4 w-4" /> },
          { value: "escalation", label: "Escalation", icon: <ArrowUpRight className="h-4 w-4" /> },
          { value: "analytics", label: "Analytics", icon: <SearchIcon className="h-4 w-4" /> },
        ]}
      />

      {tab === "incidents" && <IncidentsTab incidents={incidents} />}
      {tab === "channels" && <ChannelsTab />}
      {tab === "escalation" && <EscalationTab />}
      {tab === "analytics" && <AnalyticsTab incidents={incidents} />}
    </div>
  );
}

function IncidentsTab({ incidents }: { incidents: Incident[] }) {
  const [sev, setSev] = useState("all");
  const [status, setStatus] = useState("all");
  const [sel, setSel] = useState<Incident | null>(null);
  const filtered = incidents.filter((i) => (sev === "all" || i.severity === sev) && (status === "all" || i.status === status));

  const ack = (id: string) => incidentsStore.set((p) => p.map((i) => i.id === id ? { ...i, status: "acknowledged", assignee: i.assignee ?? "You" } : i));
  const resolve = (id: string) => incidentsStore.set((p) => p.map((i) => i.id === id ? { ...i, status: "resolved", resolvedAt: new Date().toISOString() } : i));

  const cols: Column<Incident>[] = [
    { key: "sev", header: "Severity", render: (i) => <Badge tone={sevTone(i.severity)}>{i.severity}</Badge> },
    { key: "title", header: "Incident", render: (i) => (<div><div className="font-medium text-white">{i.title}</div><div className="font-mono text-[11px] ad-muted">{i.device} · {i.tenant}</div></div>) },
    { key: "channel", header: "Channels", render: (i) => <div className="flex gap-1">{i.channel.map((c) => <span key={c} className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-300">{c}</span>)}</div> },
    { key: "assignee", header: "Assignee", render: (i) => i.assignee ? <span className="text-slate-300">{i.assignee}</span> : <span className="text-slate-600">unassigned</span> },
    { key: "status", header: "Status", render: (i) => <Badge tone={statusTone[i.status]}><Dot tone={statusTone[i.status]} pulse={i.status === "active"} /> {i.status}</Badge> },
    { key: "opened", header: "Opened", align: "right", sort: (a, b) => +new Date(a.openedAt) - +new Date(b.openedAt), render: (i) => <span className="text-xs ad-muted">{relativeTime(i.openedAt)}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sev} onChange={setSev} options={[{ value: "all", label: "All severities" }, ...["critical", "major", "minor", "warning", "info"].map((s) => ({ value: s, label: s }))]} />
        <Select value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, ...["active", "acknowledged", "resolved"].map((s) => ({ value: s, label: s }))]} />
        <span className="ml-auto text-sm ad-muted">{num(filtered.length)} incidents</span>
      </div>
      <DataTable rows={filtered} columns={cols} rowKey={(i) => i.id} onRowClick={setSel} />
      <IncidentDrawer incident={sel} onClose={() => setSel(null)} onAck={ack} onResolve={resolve} />
    </div>
  );
}

function IncidentDrawer({ incident, onClose, onAck, onResolve }: { incident: Incident | null; onClose: () => void; onAck: (id: string) => void; onResolve: (id: string) => void }) {
  const [rca, setRca] = useState("");
  if (!incident) return null;
  const timeline = [
    { label: "Incident opened", ts: incident.openedAt, tone: "red" as Tone },
    { label: `Dispatched via ${incident.channel.join(", ")}`, ts: incident.openedAt, tone: "blue" as Tone },
    ...(incident.status !== "active" ? [{ label: `Acknowledged by ${incident.assignee ?? "operator"}`, ts: incident.openedAt, tone: "amber" as Tone }] : []),
    ...(incident.resolvedAt ? [{ label: "Resolved", ts: incident.resolvedAt, tone: "green" as Tone }] : []),
  ];
  return (
    <Drawer open={!!incident} onClose={onClose} title={incident.title} width={520}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={sevTone(incident.severity)}>{incident.severity}</Badge>
          <Badge tone={statusTone[incident.status]}>{incident.status}</Badge>
          <span className="ml-auto font-mono text-xs ad-muted">{incident.id}</span>
        </div>
        <div className="ad-card rounded-xl p-4 text-sm">
          <div className="flex justify-between border-b border-white/5 py-2"><span className="ad-muted">Device</span><span className="font-mono text-white">{incident.device}</span></div>
          <div className="flex justify-between border-b border-white/5 py-2"><span className="ad-muted">Tenant</span><span className="text-white">{incident.tenant}</span></div>
          <div className="flex justify-between py-2"><span className="ad-muted">Opened</span><span className="text-white">{fmtDateTime(incident.openedAt)}</span></div>
        </div>

        <div>
          <SectionTitle>Timeline</SectionTitle>
          <div className="relative space-y-0 pl-4">
            <div className="absolute left-[7px] top-1 h-full w-px bg-white/10" />
            {timeline.map((t, i) => (
              <div key={i} className="relative flex items-start gap-3 py-2">
                <span className="absolute -left-[1px] mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: t.tone === "red" ? "#ef4444" : t.tone === "amber" ? "#f59e0b" : t.tone === "green" ? "#22c55e" : "#3b82f6" }} />
                <div className="ml-4"><div className="text-sm text-white">{t.label}</div><div className="text-xs ad-muted">{relativeTime(t.ts)}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>Root cause analysis</SectionTitle>
          <textarea value={rca} onChange={(e) => setRca(e.target.value)} rows={3} placeholder="Document findings and resolution steps…" className="ad-input resize-none" />
        </div>

        <div className="flex gap-2">
          {incident.status === "active" && <Btn variant="subtle" className="flex-1" onClick={() => onAck(incident.id)}><CheckCheck className="h-4 w-4" /> Acknowledge</Btn>}
          {incident.status !== "resolved" && <Btn variant="primary" className="flex-1" onClick={() => { onResolve(incident.id); onClose(); }}><CircleCheck className="h-4 w-4" /> Resolve</Btn>}
        </div>
      </div>
    </Drawer>
  );
}

function ChannelsTab() {
  const [ch, setCh] = useState({ email: true, sms: true, whatsapp: false, push: true, voice: false, slack: true, teams: true, telegram: false, discord: false });
  const channels = [
    { k: "email", label: "Email", icon: Mail, tone: "blue" as Tone }, { k: "sms", label: "SMS (Twilio)", icon: MessageSquare, tone: "green" as Tone },
    { k: "whatsapp", label: "WhatsApp", icon: MessageSquare, tone: "green" as Tone }, { k: "push", label: "Push notifications", icon: Smartphone, tone: "brand" as Tone },
    { k: "voice", label: "Voice call", icon: Phone, tone: "amber" as Tone }, { k: "slack", label: "Slack", icon: Hash, tone: "violet" as Tone },
    { k: "teams", label: "Microsoft Teams", icon: Hash, tone: "blue" as Tone }, { k: "telegram", label: "Telegram", icon: Send, tone: "brand" as Tone },
    { k: "discord", label: "Discord", icon: Hash, tone: "violet" as Tone },
  ] as const;
  return (
    <div className="space-y-4">
      <StaggerGrid className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((c) => (
          <StaggerItem key={c.k}>
            <Panel>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><c.icon className="h-4 w-4" /></span>
                  <span className="font-medium text-white">{c.label}</span>
                </span>
                <Toggle checked={ch[c.k]} onChange={(v) => setCh((s) => ({ ...s, [c.k]: v }))} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs ad-muted">
                <span className="flex items-center gap-1.5"><Dot tone={ch[c.k] ? "green" : "slate"} /> {ch[c.k] ? "active" : "disabled"}</span>
                <button className="text-cyan-400 hover:text-cyan-300">Send test</button>
              </div>
            </Panel>
          </StaggerItem>
        ))}
      </StaggerGrid>
      <Panel>
        <SectionTitle>Rate limiting & suppression</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="text-sm text-white flex items-center gap-2"><Volume2 className="h-4 w-4 text-amber-400" /> Deduplicate similar alerts</span><Toggle checked onChange={() => {}} /></div>
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="text-sm text-white">Max 50 alerts / tenant / hour</span><Toggle checked onChange={() => {}} /></div>
        </div>
      </Panel>
    </div>
  );
}

function EscalationTab() {
  const tiers = [
    { tier: "Tier 1", after: "0 min", who: "On-call engineer", channels: ["push", "slack"], tone: "brand" as Tone },
    { tier: "Tier 2", after: "10 min", who: "Team lead", channels: ["sms", "email"], tone: "amber" as Tone },
    { tier: "Tier 3", after: "25 min", who: "Engineering manager", channels: ["voice", "sms"], tone: "red" as Tone },
    { tier: "Tier 4", after: "45 min", who: "Incident commander + status page", channels: ["voice", "email", "teams"], tone: "red" as Tone },
  ];
  return (
    <Panel>
      <SectionTitle right={<Btn size="sm" variant="subtle">Edit matrix</Btn>}>Escalation matrix — unacknowledged incidents</SectionTitle>
      <div className="space-y-3">
        {tiers.map((t, i) => (
          <div key={t.tier} className="flex flex-wrap items-center gap-4 rounded-xl border border-white/5 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}>{i + 1}</span>
              <div><div className="font-semibold text-white">{t.tier}</div><div className="text-xs ad-muted">after {t.after} unacked</div></div>
            </div>
            <div className="text-sm text-slate-300">{t.who}</div>
            <div className="ml-auto flex gap-1">{t.channels.map((c) => <span key={c} className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-300">{c}</span>)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AnalyticsTab({ incidents }: { incidents: Incident[] }) {
  const mttrTrend = walk("mttr", 14, 42, 8, 10);
  const volTrend = walk("vol", 14, 30, 10, 5).map((v) => Math.round(v));
  const bySev = ["critical", "major", "minor", "warning", "info"].map((s, i) => ({ label: s, value: incidents.filter((x) => x.severity === s).length, color: ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#3b82f6"][i] }));
  const topDevices = useMemo(() => {
    const m = new Map<string, number>();
    incidents.forEach((i) => m.set(i.device, (m.get(i.device) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value], i) => ({ name, value, color: ["#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#22c55e", "#3b82f6"][i] }));
  }, [incidents]);
  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>MTTR & incident volume · 14 days</SectionTitle>
        <MultiLineChart labels={Array.from({ length: 14 }, (_, i) => `${i + 1}`)} series={[{ name: "MTTR (min)", data: mttrTrend, color: "#06b6d4" }, { name: "Volume", data: volTrend, color: "#f59e0b" }]} height={220} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel><SectionTitle>By severity</SectionTitle><div className="flex justify-center py-2"><Donut size={168} segments={bySev} /></div></Panel>
        <Panel><SectionTitle>Top failing devices</SectionTitle><HBar items={topDevices} /></Panel>
      </div>
    </div>
  );
}
