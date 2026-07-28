"use client";

/**
 * Security & safety posture.
 *
 * Everything here is read live from the Circuvent control plane or from this
 * console's own disk-backed config store. There is deliberately no CVE scanner,
 * no compliance score and no threat feed, because nothing in this stack actually
 * scans a fleet. What IS real:
 *   • device alarms   — firmware fault flags in each device's published state
 *   • security events — the control plane's own event log (SOS, motion, gate…)
 *   • offline / stale — a genuine "stopped reporting" signal, not a guess
 *   • certificates    — records the operator registers here, with real expiry math
 *   • transport facts — the actual HTTPS / WSS / bearer-JWT the console uses
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  ShieldAlert, ShieldCheck, TriangleAlert, RefreshCw, Siren, WifiOff, Clock,
  FileBadge, Plus, Trash2, Activity, Radio, Fingerprint, Globe, KeyRound,
} from "lucide-react";
import { LineChart } from "../../charts";
import {
  useAdminEvents, useAdminDevices, useAdminConfig, useFleetInsights,
  activeFaults, timeSeries, minutesSince,
  type Resource, type ConfigResource, type ConfigRecord,
} from "../_lib/api";
import {
  CONTROL_PLANE_URL, CONTROL_PLANE_WS, type AdminEvent, type AdminDevice,
} from "@/lib/control-plane";
import { relativeTime, fmtDate, fmtDateTime, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Tabs, SectionTitle, DataTable,
  StaggerGrid, StaggerItem, EmptyState, ResourceGate, ErrorState, LoadingState,
  Segmented, SearchInput, Modal, Field, Input, type Column, type Tone,
} from "../_ui";

type Tab = "posture" | "events" | "certs";
type Fleet = ReturnType<typeof useFleetInsights>;
type EventClass = "security" | "safety";
type ClassedEvent = { e: AdminEvent; cls: EventClass };

/** Fault flags the firmware publishes (see activeFaults in _lib/api). */
const FAULT_META: Record<string, { label: string; tone: Tone }> = {
  sos: { label: "SOS", tone: "red" },
  tamper: { label: "Tamper", tone: "red" },
  leak: { label: "Leak", tone: "red" },
  overflow: { label: "Overflow", tone: "amber" },
  dryRun: { label: "Dry-run", tone: "amber" },
  fault: { label: "Fault", tone: "amber" },
};

/**
 * Classify an event against the control plane's REAL event kinds. The plane logs
 * SOS, motion and gate activity under kind "security", and AquaGuard dry-run /
 * overflow under kind "alert" (see platform/api recordEvent calls). We also match
 * a few honest keywords in the title/body so hand-authored events are not missed.
 */
function classifyEvent(e: AdminEvent): EventClass | null {
  const kind = (e.kind ?? "").toLowerCase();
  const hay = `${e.title ?? ""} ${e.body ?? ""}`.toLowerCase();
  if (kind === "security") return "security";
  if (kind === "alert") return "safety";
  if (["sos", "tamper", "intrus", "breach", "gate", "denied", "unlock"].some((s) => hay.includes(s))) return "security";
  if (["overflow", "dry-run", "dryrun", "leak", "flood", "smoke", "gas"].some((s) => hay.includes(s))) return "safety";
  return null;
}

interface CertRecord extends ConfigRecord {
  name: string;
  subject?: string;
  issuer?: string;
  fingerprint?: string;
  expiresAt?: string | null;
}

function certStatus(c: CertRecord): { label: string; tone: Tone } {
  if (!c.expiresAt) return { label: "no expiry set", tone: "slate" };
  const t = Date.parse(c.expiresAt);
  if (Number.isNaN(t)) return { label: "invalid date", tone: "slate" };
  const days = Math.ceil((t - Date.now()) / 86400000);
  if (days < 0) return { label: "expired", tone: "red" };
  if (days <= 30) return { label: `expires in ${days}d`, tone: "amber" };
  return { label: "valid", tone: "green" };
}

export default function SecurityPage() {
  const eventsRes = useAdminEvents(200);
  const devicesRes = useAdminDevices();
  const certsCfg = useAdminConfig<CertRecord>("certificates");
  const [tab, setTab] = useState<Tab>("posture");

  const fleet = useFleetInsights(devicesRes.data);
  const events = useMemo(() => eventsRes.data ?? [], [eventsRes.data]);

  const secEvents = useMemo<ClassedEvent[]>(
    () =>
      events
        .map((e) => ({ e, cls: classifyEvent(e) }))
        .filter((x): x is ClassedEvent => x.cls !== null),
    [events]
  );
  const events24h = useMemo(
    () => secEvents.filter((x) => (minutesSince(x.e.ts) ?? Infinity) <= 1440).length,
    [secEvents]
  );

  const offline = fleet.total - fleet.online;
  const alarms = fleet.faulted.length;
  const expiringCerts = certsCfg.rows.filter((c) => {
    const tone = certStatus(c).tone;
    return tone === "amber" || tone === "red";
  }).length;

  const refreshAll = () => {
    eventsRes.reload();
    devicesRes.reload();
    certsCfg.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & safety"
        icon={<ShieldAlert className="h-5 w-5" />}
        subtitle="Real device alarms, the control plane's security event log, offline/stale devices and operator-registered certificates. No CVE scanner, threat feed or compliance score — nothing here scans your fleet."
        actions={<Btn variant="subtle" onClick={refreshAll}><RefreshCw className="h-4 w-4" /> Refresh</Btn>}
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Active alarms" value={devicesRes.loading ? "—" : num(alarms)} icon={<Siren className="h-4 w-4" />} tone={alarms ? "red" : "green"} sub={alarms ? "devices in fault" : "no faults"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Security events · 24h" value={eventsRes.loading ? "—" : num(events24h)} icon={<Activity className="h-4 w-4" />} tone={events24h ? "amber" : "slate"} sub="logged by control plane" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Offline devices" value={devicesRes.loading ? "—" : num(offline)} icon={<WifiOff className="h-4 w-4" />} tone={offline ? "amber" : "green"} sub={fleet.total ? `of ${num(fleet.total)}` : "no devices"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Certs expiring" value={certsCfg.loading ? "—" : num(expiringCerts)} icon={<FileBadge className="h-4 w-4" />} tone={expiringCerts ? "amber" : "green"} sub="< 30 days or expired" />
        </StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "posture", label: "Alarms & devices", icon: <Siren className="h-4 w-4" />, count: alarms + offline || undefined },
          { value: "events", label: "Security events", icon: <Activity className="h-4 w-4" />, count: secEvents.length || undefined },
          { value: "certs", label: "Certificates", icon: <FileBadge className="h-4 w-4" />, count: certsCfg.rows.length || undefined },
        ]}
      />

      {tab === "posture" && <PostureTab devicesRes={devicesRes} fleet={fleet} />}
      {tab === "events" && <EventsTab eventsRes={eventsRes} secEvents={secEvents} />}
      {tab === "certs" && <CertsTab certs={certsCfg} />}
    </div>
  );
}

// ----------------------------------------------------------------- posture ---

function PostureTab({ devicesRes, fleet }: { devicesRes: Resource<AdminDevice[]>; fleet: Fleet }) {
  const faulted = fleet.faulted;
  const stale = fleet.stale;
  const offline = useMemo(() => (devicesRes.data ?? []).filter((d) => !d.online), [devicesRes.data]);

  return (
    <ResourceGate
      loading={devicesRes.loading}
      error={devicesRes.error}
      unauthorized={devicesRes.unauthorized}
      onRetry={devicesRes.reload}
      isEmpty={(devicesRes.data ?? []).length === 0}
      empty={<EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No devices to monitor" hint="Provision a device to see its real security and safety posture here." />}
      skeletonRows={5}
    >
      <div className="space-y-4">
        <Panel>
          <SectionTitle right={<Badge tone={faulted.length ? "red" : "green"}>{num(faulted.length)} in fault</Badge>}>
            Device alarm board
          </SectionTitle>
          <p className="mb-3 text-xs ad-muted">
            Devices whose firmware is currently reporting a fault flag (sos, tamper, leak, overflow, dry-run, fault). This is a genuine safety board, read straight from device state.
          </p>
          {faulted.length === 0 ? (
            <p className="py-8 text-center text-sm ad-muted">No device is reporting an alarm right now.</p>
          ) : (
            <div className="space-y-2">
              {faulted.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(239,68,68,.12)", color: "#f87171" }}>
                    <Siren className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{d.name || d.id}</div>
                    <div className="truncate text-xs ad-muted">{d.type}{d.room ? ` · ${d.room}` : ""} · seen {relativeTime(d.last_seen)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {activeFaults(d.state).map((f) => {
                      const meta = FAULT_META[f] ?? { label: f, tone: "red" as Tone };
                      return <Badge key={f} tone={meta.tone}>{meta.label}</Badge>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <SectionTitle right={<Badge tone={offline.length ? "amber" : "green"}>{num(offline.length)}</Badge>}>Offline devices</SectionTitle>
            <p className="mb-3 text-xs ad-muted">Devices the control plane currently reports as disconnected.</p>
            {offline.length === 0 ? (
              <p className="py-6 text-center text-sm ad-muted">Every device is online.</p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {offline.map((d) => (
                  <div key={d.id} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                    <WifiOff className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{d.name || d.id}</span>
                    <span className="shrink-0 text-[11px] ad-muted">seen {relativeTime(d.last_seen)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <SectionTitle right={<Badge tone={stale.length ? "amber" : "green"}>{num(stale.length)}</Badge>}>Stale devices</SectionTitle>
            <p className="mb-3 text-xs ad-muted">Online but silent for more than 15 minutes — a real &ldquo;stopped reporting&rdquo; signal.</p>
            {stale.length === 0 ? (
              <p className="py-6 text-center text-sm ad-muted">No stale devices.</p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {stale.map((d) => {
                  const mins = minutesSince(d.last_seen);
                  return (
                    <div key={d.id} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                      <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{d.name || d.id}</span>
                      <span className="shrink-0 text-[11px] ad-muted">{mins !== null ? `${Math.round(mins)}m silent` : "silent"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ResourceGate>
  );
}

// ------------------------------------------------------------------ events ---

function EventsTab({ eventsRes, secEvents }: { eventsRes: Resource<AdminEvent[]>; secEvents: ClassedEvent[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | EventClass>("all");

  const rate = useMemo(() => timeSeries(secEvents.map((x) => x.e), (e) => e.ts, 24, 3600000), [secEvents]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return secEvents.filter(
      ({ e, cls }) =>
        (filter === "all" || cls === filter) &&
        (!needle || `${e.title} ${e.body} ${e.owner_email ?? ""} ${e.device_id ?? ""}`.toLowerCase().includes(needle))
    );
  }, [secEvents, q, filter]);

  const cols: Column<ClassedEvent>[] = [
    {
      key: "cls", header: "Type",
      render: ({ cls }) =>
        cls === "security" ? (
          <Badge tone="violet"><ShieldAlert className="h-3 w-3" /> security</Badge>
        ) : (
          <Badge tone="amber"><TriangleAlert className="h-3 w-3" /> safety</Badge>
        ),
    },
    {
      key: "title", header: "Event",
      render: ({ e }) => (
        <div>
          <div className="font-medium text-white">{e.title}</div>
          {e.body && <div className="text-xs ad-muted">{e.body}</div>}
        </div>
      ),
    },
    { key: "device", header: "Device", render: ({ e }) => <span className="font-mono text-xs ad-muted">{e.device_id ?? "—"}</span> },
    { key: "owner", header: "Owner", render: ({ e }) => <span className="text-xs ad-muted">{e.owner_email ?? "—"}</span> },
    {
      key: "ts", header: "When", align: "right",
      sort: (a, b) => Date.parse(a.e.ts) - Date.parse(b.e.ts),
      render: ({ e }) => <span className="text-xs ad-muted" title={fmtDateTime(e.ts)}>{relativeTime(e.ts)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle right={<Badge tone={secEvents.length ? "green" : "slate"}><Dot tone={secEvents.length ? "green" : "slate"} pulse={secEvents.length > 0} /> {num(secEvents.length)} events</Badge>}>
          Security &amp; safety events · last 24 hours
        </SectionTitle>
        {eventsRes.error ? (
          <ErrorState message={eventsRes.error} unauthorized={eventsRes.unauthorized} onRetry={eventsRes.reload} />
        ) : eventsRes.loading ? (
          <LoadingState rows={3} />
        ) : secEvents.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No security events" hint="Alarms, SOS, motion and gate activity from the control plane will appear here as they happen." />
        ) : (
          <LineChart data={rate.data} color="#c084fc" height={200} />
        )}
      </Panel>

      {secEvents.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search security events…" className="min-w-[220px] flex-1" />
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "security", label: "Security" },
                { value: "safety", label: "Safety" },
              ]}
            />
          </div>
          <DataTable
            rows={filtered}
            columns={cols}
            rowKey={({ e }) => String(e.id)}
            dense
            empty={<p className="py-6 text-center text-sm ad-muted">No events match your filter.</p>}
          />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ certificates ---

function CertsTab({ certs }: { certs: ConfigResource<CertRecord> }) {
  const [showCreate, setShowCreate] = useState(false);
  const isHttps = CONTROL_PLANE_URL.toLowerCase().startsWith("https://");
  const isWss = CONTROL_PLANE_WS.toLowerCase().startsWith("wss://");

  const cols: Column<CertRecord>[] = [
    {
      key: "name", header: "Name",
      render: (c) => (
        <div className="flex items-center gap-2">
          <FileBadge className="h-4 w-4 shrink-0 text-cyan-400" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{c.name}</div>
            {c.subject && <div className="truncate font-mono text-[11px] ad-muted">{c.subject}</div>}
          </div>
        </div>
      ),
    },
    { key: "issuer", header: "Issuer", render: (c) => <span className="text-xs ad-muted">{c.issuer || "—"}</span> },
    { key: "fp", header: "Fingerprint", render: (c) => (c.fingerprint ? <span className="font-mono text-[11px] ad-muted">{c.fingerprint}</span> : <span className="text-xs ad-muted">—</span>) },
    {
      key: "expiry", header: "Expiry", align: "right",
      sort: (a, b) => (Date.parse(a.expiresAt ?? "") || 0) - (Date.parse(b.expiresAt ?? "") || 0),
      render: (c) => <span className="text-xs ad-muted">{c.expiresAt ? fmtDate(c.expiresAt) : "—"}</span>,
    },
    {
      key: "status", header: "Status", align: "right",
      render: (c) => {
        const s = certStatus(c);
        return <Badge tone={s.tone}><Dot tone={s.tone} /> {s.label}</Badge>;
      },
    },
    {
      key: "act", header: "", align: "right",
      render: (c) => (
        <button onClick={() => certs.remove(c.id)} disabled={certs.saving} className="text-slate-500 transition hover:text-red-300" title="Delete record">
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle right={<span className="flex items-center gap-1.5 text-xs ad-muted"><Globe className="h-3.5 w-3.5 text-cyan-400" /> live transport</span>}>Transport security</SectionTitle>
        <p className="mb-3 text-xs ad-muted">The transport the console actually uses to reach the control plane — stated as fact, with no invented scores or grades.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <TransportRow icon={<Globe className="h-4 w-4" />} label="Control-plane API" value={CONTROL_PLANE_URL} ok={isHttps} okLabel={isHttps ? "HTTPS" : "insecure"} />
          <TransportRow icon={<Radio className="h-4 w-4" />} label="Realtime channel" value={CONTROL_PLANE_WS} ok={isWss} okLabel={isWss ? "WSS" : "insecure"} />
          <TransportRow icon={<KeyRound className="h-4 w-4" />} label="Authentication" value="Bearer JWT, sent per request" ok />
          <TransportRow icon={<ShieldCheck className="h-4 w-4" />} label="Operator authorization" value="verified via /admin/me" ok />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm ad-muted">
          Certificate records you register here are persisted by this console&rsquo;s disk-backed config store. &ldquo;Expiring soon&rdquo; is computed from the expiry dates you enter — this console does not fetch or scan live certificates.
        </p>
        <Btn variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Register certificate</Btn>
      </div>

      <ResourceGate
        loading={certs.loading}
        error={certs.error}
        unauthorized={certs.unauthorized}
        onRetry={certs.reload}
        isEmpty={certs.rows.length === 0}
        empty={
          <EmptyState
            icon={<Fingerprint className="h-6 w-6" />}
            title="No certificates registered"
            hint="Register a certificate to track its subject, issuer, fingerprint and expiry in one place."
            action={<Btn variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Register certificate</Btn>}
          />
        }
        skeletonRows={4}
      >
        <DataTable rows={certs.rows} columns={cols} rowKey={(c) => c.id} />
      </ResourceGate>

      <CertModal open={showCreate} onClose={() => setShowCreate(false)} certs={certs} />
    </div>
  );
}

function TransportRow({ icon, label, value, ok, okLabel }: { icon: ReactNode; label: string; value: string; ok: boolean; okLabel?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
      <span style={{ color: ok ? "#4ade80" : "#f87171" }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white">{label}</div>
        <div className="truncate font-mono text-[11px] ad-muted">{value}</div>
      </div>
      <Badge tone={ok ? "green" : "red"}>{okLabel ?? (ok ? "ok" : "check")}</Badge>
    </div>
  );
}

function CertModal({ open, onClose, certs }: { open: boolean; onClose: () => void; certs: ConfigResource<CertRecord> }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [issuer, setIssuer] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => {
    setName(""); setSubject(""); setIssuer(""); setFingerprint(""); setExpiry(""); setErr(null); setBusy(false);
    onClose();
  };

  const save = async () => {
    if (!name.trim()) {
      setErr("Give the certificate a name.");
      return;
    }
    let expiresAt: string | null = null;
    if (expiry) {
      const t = Date.parse(expiry);
      if (Number.isNaN(t)) {
        setErr("Enter a valid expiry date.");
        return;
      }
      expiresAt = new Date(t).toISOString();
    }
    setBusy(true);
    setErr(null);
    const rec = await certs.create({
      name: name.trim(),
      subject: subject.trim() || undefined,
      issuer: issuer.trim() || undefined,
      fingerprint: fingerprint.trim() || undefined,
      expiresAt,
    });
    setBusy(false);
    if (rec) close();
    else setErr("Could not save the record. Confirm you're still signed in as an operator and try again.");
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) close(); }} title="Register certificate">
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Device fleet CA" /></Field>
        <Field label="Subject (CN)" hint="Optional"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="CN=devices.circuvent.com" className="font-mono" /></Field>
        <Field label="Issuer" hint="Optional"><Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Circuvent Root CA" /></Field>
        <Field label="SHA-256 fingerprint" hint="Optional"><Input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="AB:CD:EF:…" className="font-mono" /></Field>
        <Field label="Expiry date" hint="Used to compute expiry warnings"><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
        {err && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}
        <Btn variant="primary" className="w-full" onClick={save} disabled={busy}>
          <FileBadge className="h-4 w-4" /> {busy ? "Saving…" : "Register certificate"}
        </Btn>
      </div>
    </Modal>
  );
}
