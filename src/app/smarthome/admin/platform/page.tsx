"use client";

/**
 * Platform administration.
 *
 * System health, totals and the documented API surface are read live from the
 * Circuvent control plane. Integrations, webhooks and feature flags are real
 * CRUD backed by this console's disk-backed config store
 * (/api/smarthome/admin/config). There is deliberately no billing, no invented
 * microservice mesh and no fabricated gateway throughput — this is a
 * single-tenant, self-hosted control plane.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Server, Plug, Webhook, Flag, Activity, Database, Radio, Cpu, Users, RefreshCw,
  Plus, Trash2, Code2, TriangleAlert,
} from "lucide-react";
import { HBar } from "../../charts";
import {
  useAdminHealth, useAdminStats, useAdminConfig,
  type Resource, type ConfigResource, type ConfigRecord,
} from "../_lib/api";
import {
  CONTROL_PLANE_URL, CONTROL_PLANE_WS, getToken,
  type AdminHealth, type AdminStats,
} from "@/lib/control-plane";
import { num, abbrNum, uptime, relativeTime } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Toggle, Tabs, DataTable, SectionTitle,
  StaggerGrid, StaggerItem, EmptyState, ResourceGate, ErrorState, LoadingState,
  Modal, Field, Input, Select, type Column, type Tone,
} from "../_ui";

type Tab = "health" | "integrations" | "webhooks" | "flags" | "api";

const BAR_COLORS = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6", "#f97316"];
const METHOD_TONE: Record<string, Tone> = { GET: "green", POST: "amber", PATCH: "blue", PUT: "blue", DELETE: "red" };

/**
 * Read the config store's `durable` flag with a tiny direct fetch. The shared
 * hook only exposes rows, and the task forbids editing _lib/api.ts — so we ask
 * the same route ourselves and surface an honest warning when persistence is
 * in-memory only (a read-only serverless filesystem).
 */
function useConfigDurable(): boolean | null {
  const [durable, setDurable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const token = getToken();
    fetch("/api/smarthome/admin/config?collection=feature-flags", {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: { durable?: boolean }) => {
        if (alive && typeof d.durable === "boolean") setDurable(d.durable);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return durable;
}

export default function PlatformPage() {
  const healthRes = useAdminHealth();
  const statsRes = useAdminStats();
  const durable = useConfigDurable();
  const [tab, setTab] = useState<Tab>("health");

  const health = healthRes.data;
  const stats = statsRes.data;

  const refreshAll = () => {
    healthRes.reload();
    statsRes.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform & operations"
        icon={<Server className="h-5 w-5" />}
        subtitle="Live system health and totals from the Circuvent control plane, the real API surface this console calls, and operator-managed integrations, webhooks and feature flags persisted server-side."
        actions={<Btn variant="subtle" onClick={refreshAll}><RefreshCw className="h-4 w-4" /> Refresh</Btn>}
      />

      {durable === false && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Configuration is running in memory only (read-only filesystem). Integration, webhook and feature-flag changes will not survive a restart.
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="MQTT broker" value={healthRes.loading ? "—" : health?.mqtt ? "Up" : "Down"} icon={<Radio className="h-4 w-4" />} tone={health?.mqtt ? "green" : "red"} sub="message bus" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Database" value={healthRes.loading ? "—" : health?.db ? "Up" : "Down"} icon={<Database className="h-4 w-4" />} tone={health?.db ? "green" : "red"} sub="control-plane store" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="API uptime" value={health ? uptime(health.uptimeSec) : "—"} icon={<Activity className="h-4 w-4" />} tone="brand" sub={health?.node ? `Node ${health.node}` : "process"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Managed devices" value={statsRes.loading ? "—" : num(stats?.devices ?? 0)} icon={<Cpu className="h-4 w-4" />} tone="violet" sub={`${num(stats?.online ?? 0)} online`} />
        </StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "health", label: "System health", icon: <Server className="h-4 w-4" /> },
          { value: "integrations", label: "Integrations", icon: <Plug className="h-4 w-4" /> },
          { value: "webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" /> },
          { value: "flags", label: "Feature flags", icon: <Flag className="h-4 w-4" /> },
          { value: "api", label: "API surface", icon: <Code2 className="h-4 w-4" /> },
        ]}
      />

      {tab === "health" && <HealthTab healthRes={healthRes} statsRes={statsRes} />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "flags" && <FlagsTab />}
      {tab === "api" && <ApiTab />}
    </div>
  );
}

// ------------------------------------------------------------------ health ---

function HealthTab({ healthRes, statsRes }: { healthRes: Resource<AdminHealth>; statsRes: Resource<AdminStats> }) {
  const health = healthRes.data;
  const stats = statsRes.data;
  const byType = useMemo(() => (stats?.byType ?? []).map((t) => ({ name: t.type, value: t.count })), [stats]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Control-plane health</SectionTitle>
          {healthRes.error ? (
            <ErrorState message={healthRes.error} unauthorized={healthRes.unauthorized} onRetry={healthRes.reload} />
          ) : (
            <div className="space-y-1.5">
              <HealthRow icon={<Radio className="h-4 w-4" />} name="MQTT broker" ok={health?.mqtt === true} detail={healthRes.loading ? "…" : health ? (health.mqtt ? "connected" : "down") : "unknown"} />
              <HealthRow icon={<Database className="h-4 w-4" />} name="Database" ok={health?.db === true} detail={healthRes.loading ? "…" : health ? (health.db ? "up" : "down") : "unknown"} />
              <HealthRow icon={<Activity className="h-4 w-4" />} name="API uptime" ok detail={health ? uptime(health.uptimeSec) : "—"} />
              <HealthRow icon={<Server className="h-4 w-4" />} name="Runtime" ok detail={health?.node ?? "—"} />
            </div>
          )}
        </Panel>
        <Panel>
          <SectionTitle>Control-plane totals</SectionTitle>
          {statsRes.error ? (
            <ErrorState message={statsRes.error} unauthorized={statsRes.unauthorized} onRetry={statsRes.reload} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat icon={<Users className="h-4 w-4" />} label="Accounts" value={num(stats?.users ?? 0)} />
              <MiniStat icon={<Cpu className="h-4 w-4" />} label="Devices" value={num(stats?.devices ?? 0)} />
              <MiniStat icon={<Activity className="h-4 w-4" />} label="Events · 7d" value={abbrNum(stats?.events7d ?? 0)} />
              <MiniStat icon={<TriangleAlert className="h-4 w-4" />} label="Pending signups" value={num(stats?.pendingSignups ?? 0)} />
            </div>
          )}
        </Panel>
      </div>
      <Panel>
        <SectionTitle>Devices by type</SectionTitle>
        {statsRes.loading ? (
          <LoadingState rows={2} />
        ) : byType.length === 0 ? (
          <p className="py-8 text-center text-sm ad-muted">No devices registered.</p>
        ) : (
          <HBar items={byType.map((t, i) => ({ name: t.name, value: t.value, color: BAR_COLORS[i % BAR_COLORS.length] }))} />
        )}
      </Panel>
    </div>
  );
}

function HealthRow({ icon, name, ok, detail }: { icon: ReactNode; name: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <span style={{ color: ok ? "#4ade80" : "#f87171" }}>{icon}</span>
      <span className="flex-1 truncate text-sm text-slate-200">{name}</span>
      <span className="text-xs ad-muted tabular-nums">{detail}</span>
      <Dot tone={ok ? "green" : "red"} />
    </div>
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

// ----------------------------------------------------------- shared helpers ---

function ErrBox({ msg }: { msg: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
      <TriangleAlert className="h-4 w-4 shrink-0" /> {msg}
    </div>
  );
}

// ------------------------------------------------------------ integrations ---

interface IntegrationRecord extends ConfigRecord {
  name: string;
  kind: string;
  endpoint?: string;
  enabled: boolean;
}

const INTEGRATION_KINDS = [
  { value: "http", label: "HTTP service" },
  { value: "mqtt", label: "MQTT bridge" },
  { value: "cloud", label: "Cloud service" },
  { value: "database", label: "Database" },
  { value: "messaging", label: "Messaging" },
  { value: "other", label: "Other" },
];

function IntegrationsTab() {
  const cfg = useAdminConfig<IntegrationRecord>("integrations");
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm ad-muted">
          Integration records persisted by this console. Enablement and metadata are stored server-side; the console tracks them but does not itself run the integration.
        </p>
        <Btn variant="primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add integration</Btn>
      </div>
      <ResourceGate
        loading={cfg.loading}
        error={cfg.error}
        unauthorized={cfg.unauthorized}
        onRetry={cfg.reload}
        isEmpty={cfg.rows.length === 0}
        empty={
          <EmptyState
            icon={<Plug className="h-6 w-6" />}
            title="No integrations yet"
            hint="Register an integration to track its endpoint and whether it's enabled."
            action={<Btn variant="primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add integration</Btn>}
          />
        }
        skeletonRows={3}
      >
        <StaggerGrid className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cfg.rows.map((it) => (
            <StaggerItem key={it.id}>
              <Panel>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><Plug className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-white">{it.name}</span>
                      <span className="block truncate text-[11px] ad-muted">{it.kind}</span>
                    </span>
                  </span>
                  <Toggle checked={it.enabled} onChange={(v) => cfg.update(it.id, { enabled: v })} />
                </div>
                {it.endpoint && <div className="mt-3 truncate font-mono text-[11px] ad-muted">{it.endpoint}</div>}
                <div className="mt-3 flex items-center justify-between">
                  <Badge tone={it.enabled ? "green" : "slate"}><Dot tone={it.enabled ? "green" : "slate"} /> {it.enabled ? "enabled" : "disabled"}</Badge>
                  <button onClick={() => cfg.remove(it.id)} disabled={cfg.saving} className="text-slate-500 transition hover:text-red-300" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Panel>
            </StaggerItem>
          ))}
        </StaggerGrid>
      </ResourceGate>
      <IntegrationModal open={show} onClose={() => setShow(false)} cfg={cfg} />
    </div>
  );
}

function IntegrationModal({ open, onClose, cfg }: { open: boolean; onClose: () => void; cfg: ConfigResource<IntegrationRecord> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("http");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => {
    setName(""); setKind("http"); setEndpoint(""); setErr(null); setBusy(false);
    onClose();
  };

  const save = async () => {
    if (!name.trim()) {
      setErr("Give the integration a name.");
      return;
    }
    setBusy(true);
    setErr(null);
    const rec = await cfg.create({ name: name.trim(), kind, endpoint: endpoint.trim() || undefined, enabled: true });
    setBusy(false);
    if (rec) close();
    else setErr("Could not save. Confirm you're still signed in as an operator and try again.");
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) close(); }} title="Add integration">
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grafana Cloud" /></Field>
        <Field label="Kind"><Select value={kind} onChange={setKind} options={INTEGRATION_KINDS} /></Field>
        <Field label="Endpoint" hint="Optional"><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://…" className="font-mono" /></Field>
        {err && <ErrBox msg={err} />}
        <Btn variant="primary" className="w-full" onClick={save} disabled={busy}><Plug className="h-4 w-4" /> {busy ? "Saving…" : "Add integration"}</Btn>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- webhooks ----

interface WebhookRecord extends ConfigRecord {
  url: string;
  events?: string[];
  secret?: string;
  enabled: boolean;
}

function WebhooksTab() {
  const cfg = useAdminConfig<WebhookRecord>("webhooks");
  const [show, setShow] = useState(false);

  const cols: Column<WebhookRecord>[] = [
    { key: "url", header: "Endpoint", render: (w) => <span className="break-all font-mono text-xs text-white">{w.url}</span> },
    {
      key: "events", header: "Events",
      render: (w) => {
        const ev = w.events ?? [];
        return ev.length ? (
          <div className="flex flex-wrap gap-1">
            {ev.map((e) => <span key={e} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{e}</span>)}
          </div>
        ) : (
          <span className="text-xs ad-muted">all</span>
        );
      },
    },
    { key: "secret", header: "Secret", render: (w) => <span className="text-xs ad-muted">{w.secret ? "set" : "—"}</span> },
    { key: "created", header: "Added", align: "right", render: (w) => <span className="text-xs ad-muted">{relativeTime(w.createdAt)}</span> },
    { key: "enabled", header: "Enabled", align: "right", render: (w) => <Toggle checked={w.enabled} onChange={(v) => cfg.update(w.id, { enabled: v })} /> },
    { key: "act", header: "", align: "right", render: (w) => <button onClick={() => cfg.remove(w.id)} disabled={cfg.saving} className="text-slate-500 transition hover:text-red-300" title="Delete"><Trash2 className="h-4 w-4" /></button> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm ad-muted">
          Outbound webhook subscriptions persisted by this console. They are stored here for your own workers to consume — the console does not itself deliver events, so no invented delivery stats are shown.
        </p>
        <Btn variant="primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add webhook</Btn>
      </div>
      <ResourceGate
        loading={cfg.loading}
        error={cfg.error}
        unauthorized={cfg.unauthorized}
        onRetry={cfg.reload}
        isEmpty={cfg.rows.length === 0}
        empty={
          <EmptyState
            icon={<Webhook className="h-6 w-6" />}
            title="No webhooks yet"
            hint="Register an endpoint and the events it should receive."
            action={<Btn variant="primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add webhook</Btn>}
          />
        }
        skeletonRows={3}
      >
        <DataTable rows={cfg.rows} columns={cols} rowKey={(w) => w.id} />
      </ResourceGate>
      <WebhookModal open={show} onClose={() => setShow(false)} cfg={cfg} />
    </div>
  );
}

function WebhookModal({ open, onClose, cfg }: { open: boolean; onClose: () => void; cfg: ConfigResource<WebhookRecord> }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => {
    setUrl(""); setEvents(""); setSecret(""); setErr(null); setBusy(false);
    onClose();
  };

  const save = async () => {
    const u = url.trim();
    if (!u) {
      setErr("Enter the webhook URL.");
      return;
    }
    try {
      new URL(u);
    } catch {
      setErr("Enter a valid absolute URL (including https://).");
      return;
    }
    const evArr = events.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setErr(null);
    const rec = await cfg.create({ url: u, events: evArr, secret: secret.trim() || undefined, enabled: true });
    setBusy(false);
    if (rec) close();
    else setErr("Could not save. Confirm you're still signed in as an operator and try again.");
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) close(); }} title="Add webhook">
      <div className="space-y-3">
        <Field label="Endpoint URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/circuvent" className="font-mono" /></Field>
        <Field label="Events" hint="Comma-separated; leave blank for all"><Input value={events} onChange={(e) => setEvents(e.target.value)} placeholder="sos, gate, device.offline" className="font-mono" /></Field>
        <Field label="Signing secret" hint="Optional; only a flag that it's set is displayed"><Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="whsec_…" className="font-mono" /></Field>
        {err && <ErrBox msg={err} />}
        <Btn variant="primary" className="w-full" onClick={save} disabled={busy}><Webhook className="h-4 w-4" /> {busy ? "Saving…" : "Add webhook"}</Btn>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ feature flags ---

interface FlagRecord extends ConfigRecord {
  key: string;
  description?: string;
  enabled: boolean;
}

function FlagsTab() {
  const cfg = useAdminConfig<FlagRecord>("feature-flags");
  const [show, setShow] = useState(false);
  const on = cfg.rows.filter((f) => f.enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm ad-muted">
          Feature flags persisted by this console. Toggling a flag saves immediately; consumers that read these flags decide how to act on them.
        </p>
        <Btn variant="primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add flag</Btn>
      </div>
      <ResourceGate
        loading={cfg.loading}
        error={cfg.error}
        unauthorized={cfg.unauthorized}
        onRetry={cfg.reload}
        isEmpty={cfg.rows.length === 0}
        empty={
          <EmptyState
            icon={<Flag className="h-6 w-6" />}
            title="No feature flags yet"
            hint="Create a flag to toggle behaviour for consumers that read it."
            action={<Btn variant="primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Add flag</Btn>}
          />
        }
        skeletonRows={3}
      >
        <Panel>
          <SectionTitle right={<Badge tone="slate">{num(on)} on</Badge>}>Flags</SectionTitle>
          <div className="space-y-2">
            {cfg.rows.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm text-white">{f.key}</span>
                    <Badge tone={f.enabled ? "green" : "slate"}>{f.enabled ? "on" : "off"}</Badge>
                  </div>
                  {f.description && <div className="truncate text-[11px] ad-muted">{f.description}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle checked={f.enabled} onChange={(v) => cfg.update(f.id, { enabled: v })} />
                  <button onClick={() => cfg.remove(f.id)} disabled={cfg.saving} className="text-slate-500 transition hover:text-red-300" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </ResourceGate>
      <FlagModal open={show} onClose={() => setShow(false)} cfg={cfg} />
    </div>
  );
}

function FlagModal({ open, onClose, cfg }: { open: boolean; onClose: () => void; cfg: ConfigResource<FlagRecord> }) {
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => {
    setKey(""); setDescription(""); setEnabled(false); setErr(null); setBusy(false);
    onClose();
  };

  const save = async () => {
    const k = key.trim();
    if (!k) {
      setErr("Give the flag a key.");
      return;
    }
    setBusy(true);
    setErr(null);
    const rec = await cfg.create({ key: k, description: description.trim() || undefined, enabled });
    setBusy(false);
    if (rec) close();
    else setErr("Could not save. Confirm you're still signed in as an operator and try again.");
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) close(); }} title="Add feature flag">
      <div className="space-y-3">
        <Field label="Key"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="new-dashboard" className="font-mono" /></Field>
        <Field label="Description" hint="Optional"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Roll out the redesigned dashboard" /></Field>
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
          <span className="text-sm text-white">Enabled on creation</span>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>
        {err && <ErrBox msg={err} />}
        <Btn variant="primary" className="w-full" onClick={save} disabled={busy}><Flag className="h-4 w-4" /> {busy ? "Saving…" : "Add flag"}</Btn>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- api surface --

interface Endpoint {
  m: string;
  path: string;
  purpose: string;
}

const CONTROL_ENDPOINTS: { group: string; items: Endpoint[] }[] = [
  {
    group: "Health & stats",
    items: [
      { m: "GET", path: "/admin/health", purpose: "MQTT + DB reachability, uptime, runtime" },
      { m: "GET", path: "/admin/stats", purpose: "Device, user and event totals" },
      { m: "GET", path: "/admin/me", purpose: "Operator identity check" },
    ],
  },
  {
    group: "Devices",
    items: [
      { m: "GET", path: "/admin/devices", purpose: "Full device fleet" },
      { m: "GET", path: "/admin/devices/{id}", purpose: "One device" },
      { m: "PATCH", path: "/admin/devices/{id}", purpose: "Rename / reassign" },
      { m: "DELETE", path: "/admin/devices/{id}", purpose: "Remove device" },
      { m: "POST", path: "/admin/devices/{id}/command", purpose: "Send a command" },
      { m: "POST", path: "/admin/devices/{id}/ota", purpose: "Push firmware" },
      { m: "GET", path: "/admin/devices/{id}/telemetry", purpose: "Stored telemetry frames" },
      { m: "POST", path: "/admin/devices/provision", purpose: "Provision a new device" },
      { m: "POST", path: "/admin/broadcast", purpose: "Broadcast a command" },
      { m: "POST", path: "/admin/ota-broadcast", purpose: "Broadcast firmware" },
    ],
  },
  {
    group: "Users & events",
    items: [
      { m: "GET", path: "/admin/users", purpose: "Accounts" },
      { m: "PATCH", path: "/admin/users/{id}", purpose: "Set operator role" },
      { m: "DELETE", path: "/admin/users/{id}", purpose: "Delete account" },
      { m: "GET", path: "/admin/events", purpose: "Event log" },
    ],
  },
];

function ApiTab() {
  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>Endpoints</SectionTitle>
        <p className="mb-3 text-xs ad-muted">
          The actual control-plane routes this console calls, as defined in <span className="font-mono">src/lib/control-plane.ts</span>. Base <span className="font-mono text-slate-300">{CONTROL_PLANE_URL}</span> · realtime <span className="font-mono text-slate-300">{CONTROL_PLANE_WS}</span>. Request counts, latency and error rates are intentionally omitted — the console does not meter them.
        </p>
        <div className="space-y-4">
          {CONTROL_ENDPOINTS.map((grp) => (
            <div key={grp.group}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider ad-muted">{grp.group}</div>
              <div className="space-y-1.5">
                {grp.items.map((e) => (
                  <div key={e.m + e.path} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                    <Badge tone={METHOD_TONE[e.m] ?? "slate"}>{e.m}</Badge>
                    <span className="font-mono text-xs text-slate-200">{e.path}</span>
                    <span className="ml-auto hidden truncate text-[11px] ad-muted sm:block">{e.purpose}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider ad-muted">This console · persisted config</div>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
              <div className="flex gap-1">
                <Badge tone="green">GET</Badge>
                <Badge tone="amber">POST</Badge>
                <Badge tone="blue">PATCH</Badge>
                <Badge tone="red">DELETE</Badge>
              </div>
              <span className="font-mono text-xs text-slate-200">/api/smarthome/admin/config</span>
              <span className="ml-auto hidden truncate text-[11px] ad-muted sm:block">operator config store (this console)</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
