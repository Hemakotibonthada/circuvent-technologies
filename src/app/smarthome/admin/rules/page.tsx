"use client";

import { useMemo, useState } from "react";
import {
  Workflow, Zap, Clock, MapPin, GitBranch, Bot, Webhook, Radio, Database, Bell,
  Play, Plus, Store, Bug, ChevronRight, CircleDot, TriangleAlert, Check,
} from "lucide-react";
import { rulesStore, type Rule } from "../_lib/sim";
import { useStore, rng, int, pick } from "../_lib/store";
import { relativeTime, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Toggle, Tabs, DataTable, SectionTitle,
  StaggerGrid, StaggerItem, Segmented, type Column, type Tone,
} from "../_ui";

type Tab = "rules" | "builder" | "executions" | "templates";

export default function RulesPage() {
  const rules = useStore(rulesStore);
  const [tab, setTab] = useState<Tab>("rules");
  const [selected, setSelected] = useState<Rule | null>(rules[0] ?? null);
  const enabled = rules.filter((r) => r.enabled).length;
  const runs = rules.reduce((s, r) => s + r.runs24h, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules & automation engine" icon={<Workflow className="h-5 w-5" />}
        subtitle="Visual node-based automation, complex event processing, schedules, edge deployment, and a step-by-step execution debugger."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Active rules" value={num(enabled)} icon={<Zap className="h-4 w-4" />} tone="brand" sub={`of ${rules.length}`} /></StaggerItem>
        <StaggerItem><StatCard label="Executions 24h" value={num(runs)} icon={<Play className="h-4 w-4" />} tone="violet" /></StaggerItem>
        <StaggerItem><StatCard label="Edge-deployed" value={num(Math.round(rules.length * 0.4))} icon={<GitBranch className="h-4 w-4" />} tone="green" /></StaggerItem>
        <StaggerItem><StatCard label="Dry-run" value={num(rules.filter((r) => r.mode === "dry-run").length)} icon={<Bug className="h-4 w-4" />} tone="amber" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "rules", label: "Rules", icon: <Workflow className="h-4 w-4" />, count: rules.length },
          { value: "builder", label: "Visual Builder", icon: <GitBranch className="h-4 w-4" /> },
          { value: "executions", label: "Executions", icon: <Bug className="h-4 w-4" /> },
          { value: "templates", label: "Marketplace", icon: <Store className="h-4 w-4" /> },
        ]}
      />

      {tab === "rules" && <RulesTab rules={rules} onOpen={(r) => { setSelected(r); setTab("builder"); }} />}
      {tab === "builder" && <BuilderTab rules={rules} selected={selected} onSelect={setSelected} />}
      {tab === "executions" && <ExecutionsTab rules={rules} />}
      {tab === "templates" && <TemplatesTab />}
    </div>
  );
}

function RulesTab({ rules, onOpen }: { rules: Rule[]; onOpen: (r: Rule) => void }) {
  const toggle = (id: string) => rulesStore.set((p) => p.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const cols: Column<Rule>[] = [
    { key: "name", header: "Rule", render: (r) => (<div><div className="font-medium text-white">{r.name}</div><div className="font-mono text-[11px] ad-muted">{r.condition}</div></div>) },
    { key: "action", header: "Action", render: (r) => <span className="text-slate-300">{r.action}</span> },
    { key: "mode", header: "Mode", render: (r) => <Badge tone={r.mode === "live" ? "green" : "amber"}>{r.mode}</Badge> },
    { key: "runs", header: "Runs 24h", align: "right", sort: (a, b) => a.runs24h - b.runs24h, render: (r) => <span className="tabular-nums text-white">{num(r.runs24h)}</span> },
    { key: "last", header: "Last run", align: "right", render: (r) => <span className="text-xs ad-muted">{r.lastRun ? relativeTime(r.lastRun) : "never"}</span> },
    { key: "enabled", header: "Enabled", align: "center", render: (r) => <div onClick={(e) => e.stopPropagation()} className="flex justify-center"><Toggle checked={r.enabled} onChange={() => toggle(r.id)} /></div> },
    { key: "chev", header: "", align: "right", render: () => <ChevronRight className="h-4 w-4 text-slate-600" /> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Btn variant="primary"><Plus className="h-4 w-4" /> New rule</Btn></div>
      <DataTable rows={rules} columns={cols} rowKey={(r) => r.id} onRowClick={onOpen} />
    </div>
  );
}

// ------------------------------------------------------------- visual node ---

interface FlowNode { id: string; kind: "trigger" | "condition" | "action"; label: string; sub: string; icon: typeof Zap; x: number; y: number; }

function BuilderTab({ rules, selected, onSelect }: { rules: Rule[]; selected: Rule | null; onSelect: (r: Rule) => void }) {
  const rule = selected ?? rules[0];
  const nodes: FlowNode[] = useMemo(() => rule ? [
    { id: "t", kind: "trigger", label: "Trigger", sub: rule.condition.split(" ").slice(0, 2).join(" "), icon: rule.trigger === "every" ? Clock : Zap, x: 40, y: 120 },
    { id: "c", kind: "condition", label: "Condition (CEP)", sub: rule.condition, icon: GitBranch, x: 320, y: 60 },
    { id: "d", kind: "condition", label: "Debounce", sub: "cooldown 5m", icon: Clock, x: 320, y: 200 },
    { id: "a", kind: "action", label: "Action", sub: rule.action, icon: Bell, x: 620, y: 120 },
  ] : [], [rule]);

  const paletteNodes = [
    { icon: Zap, label: "Threshold", tone: "brand" as Tone }, { icon: Clock, label: "Schedule (cron)", tone: "blue" as Tone },
    { icon: MapPin, label: "Geofence", tone: "green" as Tone }, { icon: GitBranch, label: "Boolean logic", tone: "violet" as Tone },
    { icon: Bot, label: "ML anomaly", tone: "violet" as Tone }, { icon: Webhook, label: "Webhook", tone: "amber" as Tone },
    { icon: Radio, label: "MQTT publish", tone: "brand" as Tone }, { icon: Database, label: "DB insert", tone: "blue" as Tone },
    { icon: Bell, label: "Notify", tone: "red" as Tone },
  ];

  const edges = [["t", "c"], ["t", "d"], ["c", "a"], ["d", "a"]];
  const nodeById = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Panel>
        <SectionTitle>Node palette</SectionTitle>
        <div className="mb-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider ad-muted">Rules</div>
          <select className="ad-input" value={rule?.id} onChange={(e) => { const r = rules.find((x) => x.id === e.target.value); if (r) onSelect(r); }}>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          {paletteNodes.map((p) => (
            <div key={p.label} draggable className="flex cursor-grab items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-slate-200 transition hover:bg-white/[0.07]">
              <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><p.icon className="h-3.5 w-3.5" /></span>
              {p.label}
            </div>
          ))}
        </div>
      </Panel>

      <Panel pad={false} className="relative overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{rule?.name}</span>
          <div className="flex gap-2"><Badge tone={rule?.mode === "live" ? "green" : "amber"}>{rule?.mode}</Badge><Btn size="sm" variant="primary"><Check className="h-3.5 w-3.5" /> Deploy to edge</Btn></div>
        </div>
        <div className="relative overflow-x-auto rounded-xl border border-white/5 bg-[repeating-linear-gradient(0deg,transparent,transparent_23px,rgba(148,163,184,.05)_23px,rgba(148,163,184,.05)_24px),repeating-linear-gradient(90deg,transparent,transparent_23px,rgba(148,163,184,.05)_23px,rgba(148,163,184,.05)_24px)]" style={{ minHeight: 340 }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ minWidth: 820 }}>
            {edges.map(([from, to], i) => {
              const a = nodeById(from), b = nodeById(to);
              const x1 = a.x + 180, y1 = a.y + 34, x2 = b.x, y2 = b.y + 34;
              const mx = (x1 + x2) / 2;
              return <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke="rgba(6,182,212,.4)" strokeWidth={2} />;
            })}
          </svg>
          <div className="relative" style={{ minWidth: 820, minHeight: 340 }}>
            {nodes.map((n) => (
              <div key={n.id} className="absolute w-[180px] rounded-xl border p-3 shadow-lg" style={{ left: n.x, top: n.y, background: "rgba(15,23,42,.92)", borderColor: n.kind === "trigger" ? "rgba(6,182,212,.4)" : n.kind === "action" ? "rgba(239,68,68,.4)" : "rgba(139,92,246,.4)" }}>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: "rgba(6,182,212,.12)", color: "#22d3ee" }}><n.icon className="h-3.5 w-3.5" /></span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide ad-muted">{n.label}</span>
                </div>
                <div className="mt-2 font-mono text-xs text-white">{n.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ExecutionsTab({ rules }: { rules: Rule[] }) {
  const [filter, setFilter] = useState<"all" | "fired" | "skipped">("all");
  const execs = useMemo(() => {
    const r = rng("execs");
    return Array.from({ length: 26 }, (_, i) => {
      const rule = pick(r, rules);
      const fired = int(r, 0, 10) > 3;
      return { id: i, rule: rule.name, input: `${rule.trigger}=${int(r, 10, 95)}`, result: fired ? "fired" : "skipped", latency: int(r, 4, 120), ts: new Date(Date.now() - i * int(r, 1, 30) * 6e4).toISOString() };
    });
  }, [rules]);
  const filtered = execs.filter((e) => filter === "all" || e.result === filter);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Segmented<"all" | "fired" | "skipped"> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "fired", label: "Fired" }, { value: "skipped", label: "Skipped" }]} />
        <span className="text-sm ad-muted">Step-by-step debugger — input values &amp; evaluation</span>
      </div>
      <Panel pad={false}>
        <div className="divide-y divide-white/5">
          {filtered.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {e.result === "fired" ? <CircleDot className="h-4 w-4 text-green-400" /> : <TriangleAlert className="h-4 w-4 text-slate-600" />}
              <span className="w-48 truncate font-medium text-white">{e.rule}</span>
              <span className="font-mono text-xs text-cyan-300">{e.input}</span>
              <Badge tone={e.result === "fired" ? "green" : "slate"}>{e.result}</Badge>
              <span className="ml-auto text-xs ad-muted tabular-nums">{e.latency}ms · {relativeTime(e.ts)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TemplatesTab() {
  const templates = [
    { name: "HVAC optimization", desc: "Occupancy-based setpoints with peak shaving", installs: "2.1k", icon: Zap },
    { name: "Cold chain monitor", desc: "Temperature excursion alerts + escalation", installs: "1.4k", icon: TriangleAlert },
    { name: "Leak auto-shutoff", desc: "Close valve on leak, notify on-call", installs: "980", icon: Radio },
    { name: "Energy demand response", desc: "Shift load to battery when grid price spikes", installs: "760", icon: GitBranch },
    { name: "Predictive maintenance", desc: "ML anomaly score triggers work order", installs: "1.9k", icon: Bot },
    { name: "Geofence arming", desc: "Arm security when everyone leaves", installs: "3.3k", icon: MapPin },
  ];
  return (
    <StaggerGrid className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <StaggerItem key={t.name}>
          <Panel className="flex h-full flex-col">
            <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><t.icon className="h-4 w-4" /></span><span className="font-semibold text-white">{t.name}</span></div>
            <p className="mt-2 flex-1 text-sm ad-muted">{t.desc}</p>
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3"><span className="text-xs ad-muted">{t.installs} installs</span><Btn size="sm" variant="subtle"><Plus className="h-3.5 w-3.5" /> Import</Btn></div>
          </Panel>
        </StaggerItem>
      ))}
    </StaggerGrid>
  );
}
