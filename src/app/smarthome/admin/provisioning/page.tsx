"use client";

/**
 * Provisioning console — everything here is real.
 *
 *   Register a device -> controlPlane.adminProvision; the returned id + claim key
 *                        + MQTT credentials are shown once, plus a QR that encodes
 *                        the claim payload the installer scans in the app.
 *   Bulk provisioning -> a genuine loop of adminProvision calls over operator
 *                        pasted rows, with real per-row success / failure.
 *   Directory         -> unclaimed devices (no owner_email) and provisioning
 *                        events, both derived from live control-plane data.
 *
 * There are no fabricated templates, JIT enrolment statistics, onboarding funnels
 * or invented queue counts: if the control plane reports nothing, we say so.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  PackagePlus, Cpu, Boxes, Inbox, KeyRound, CheckCircle2, TriangleAlert, RefreshCw,
  ShieldCheck, Play, Users, Wifi, Radio,
} from "lucide-react";
import { controlPlane, type AdminDevice, type AdminUser, type AdminEvent } from "@/lib/control-plane";
import { useAdminDevices, useAdminUsers, useAdminEvents, useFleetInsights, combine } from "../_lib/api";
import { relativeTime, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Tabs, DataTable, Field, Input,
  SectionTitle, StaggerGrid, StaggerItem, EmptyState, CopyButton,
  ErrorState, LoadingState, type Column,
} from "../_ui";

function planeError(status: number, data: unknown): string {
  const detail = data && typeof data === "object" && "error" in data ? String((data as { error?: unknown }).error ?? "") : "";
  if (detail) return detail;
  if (status === 0) return "Cannot reach the control plane.";
  if (status === 401 || status === 403) return "Operator sign-in required.";
  return `Control plane returned ${status}.`;
}

type ProvTab = "single" | "bulk" | "directory";
interface Claim { id: string; key: string; mqttUsername: string; mqttPassword: string; }

export default function ProvisioningPage() {
  const devicesRes = useAdminDevices();
  const usersRes = useAdminUsers();
  const eventsRes = useAdminEvents(200);
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);
  const users = useMemo(() => usersRes.data ?? [], [usersRes.data]);
  const events = useMemo(() => eventsRes.data ?? [], [eventsRes.data]);
  const fleet = useFleetInsights(devicesRes.data);

  const [tab, setTab] = useState<ProvTab>("single");
  const unclaimed = useMemo(() => devices.filter((d) => !d.owner_email), [devices]);
  const page = combine(devicesRes, usersRes, eventsRes);

  if (devicesRes.loading && devices.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingState rows={2} label="Loading provisioning console…" />
        <LoadingState rows={4} />
      </div>
    );
  }

  if (devicesRes.error && devices.length === 0) {
    return <ErrorState message={devicesRes.error} unauthorized={devicesRes.unauthorized} onRetry={page.reload} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provisioning"
        icon={<PackagePlus className="h-5 w-5" />}
        subtitle="Register real devices on the control plane, hand the installer a working claim payload, and keep track of everything still waiting for an owner."
        actions={<Btn variant="subtle" onClick={page.reload}><RefreshCw className="h-4 w-4" /> Refresh</Btn>}
      />

      {page.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {page.error}
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Registered devices" value={num(devices.length)} icon={<Cpu className="h-4 w-4" />} tone="brand" sub={`${num(fleet.online)} online`} /></StaggerItem>
        <StaggerItem><StatCard label="Online" value={num(fleet.online)} icon={<Wifi className="h-4 w-4" />} tone={fleet.online ? "green" : "slate"} sub="reachable now" /></StaggerItem>
        <StaggerItem><StatCard label="Unclaimed" value={num(unclaimed.length)} icon={<Inbox className="h-4 w-4" />} tone={unclaimed.length ? "amber" : "green"} sub="no owner yet" /></StaggerItem>
        <StaggerItem><StatCard label="Accounts" value={usersRes.error && users.length === 0 ? "—" : num(users.length)} icon={<Users className="h-4 w-4" />} tone="blue" sub="can own devices" /></StaggerItem>
      </StaggerGrid>

      <Tabs<ProvTab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "single", label: "Provision", icon: <PackagePlus className="h-4 w-4" /> },
          { value: "bulk", label: "Bulk", icon: <Boxes className="h-4 w-4" /> },
          { value: "directory", label: "Directory", icon: <Inbox className="h-4 w-4" />, count: unclaimed.length },
        ]}
      />

      {tab === "single" && <SingleProvision users={users} deviceTypes={fleet.byType.map((t) => t.name)} onProvisioned={devicesRes.reload} />}
      {tab === "bulk" && <BulkProvision users={users} deviceTypes={fleet.byType.map((t) => t.name)} onDone={devicesRes.reload} />}
      {tab === "directory" && <DirectoryTab devices={devices} unclaimed={unclaimed} events={events} eventsError={eventsRes.error} />}
    </div>
  );
}

function SingleProvision({ users, deviceTypes, onProvisioned }: { users: AdminUser[]; deviceTypes: string[]; onProvisioned: () => void }) {
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const submit = async () => {
    const t = type.trim();
    if (!t) { setError("A device type is required."); return; }
    setBusy(true); setError(null); setClaim(null); setQr(null);
    const body: { type: string; name?: string; owner_id?: number } = { type: t };
    if (name.trim()) body.name = name.trim();
    if (ownerId) body.owner_id = Number(ownerId);
    const r = await controlPlane.adminProvision(body);
    setBusy(false);
    if (r.ok && r.data.id) {
      const c: Claim = { id: r.data.id, key: r.data.key, mqttUsername: r.data.mqttUsername, mqttPassword: r.data.mqttPassword };
      setClaim(c);
      try {
        const { toDataURL } = await import("qrcode");
        setQr(await toDataURL(JSON.stringify({ id: c.id, key: c.key }), { margin: 1, width: 240 }));
      } catch { setQr(null); }
      onProvisioned();
    } else {
      setError(r.data.error || planeError(r.status, r.data));
    }
  };

  const reset = () => { setType(""); setName(""); setOwnerId(""); setClaim(null); setQr(null); setError(null); };

  if (claim) return <ClaimResultView claim={claim} qr={qr} onAgain={reset} />;

  return (
    <Panel>
      <SectionTitle>Register a device</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Device type" hint="The firmware type this unit runs.">
          <Input list="prov-types" value={type} onChange={(e) => setType(e.target.value)} placeholder="smart-plug" />
          <datalist id="prov-types">{deviceTypes.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Name" hint="Optional friendly name."><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lobby plug" /></Field>
      </div>
      <div className="mt-4">
        <Field label="Assign to owner" hint="Optional — leave unassigned to claim later.">
          <select className="ad-input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </Field>
      </div>
      {error && <p className="mt-3 flex items-center gap-1.5 text-sm text-red-300"><TriangleAlert className="h-4 w-4" /> {error}</p>}
      <div className="mt-4">
        <Btn variant="primary" disabled={busy || !type.trim()} onClick={submit}>
          {busy ? "Provisioning…" : <><ShieldCheck className="h-4 w-4" /> Provision device</>}
        </Btn>
      </div>
    </Panel>
  );
}

function ClaimResultView({ claim, qr, onAgain }: { claim: Claim; qr: string | null; onAgain: () => void }) {
  const payload = JSON.stringify({ id: claim.id, key: claim.key }, null, 2);
  return (
    <Panel>
      <SectionTitle right={<Badge tone="green"><CheckCircle2 className="h-3.5 w-3.5" /> Provisioned</Badge>}>Device ready to claim</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="flex flex-col items-center gap-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Device claim QR code" width={220} height={220} className="rounded-xl border border-white/10 bg-white p-2" />
          ) : (
            <div className="grid h-[220px] w-[220px] place-items-center rounded-xl border border-dashed border-white/15 px-4 text-center text-xs ad-muted">QR unavailable — use the claim payload on the right.</div>
          )}
          <p className="text-center text-xs ad-muted">Scan in the Circuvent app to claim, or copy the payload.</p>
        </div>
        <div className="space-y-3">
          <ClaimField icon={<Cpu className="h-4 w-4" />} label="Device ID" value={claim.id} />
          <ClaimField icon={<KeyRound className="h-4 w-4" />} label="Claim key" value={claim.key} />
          <ClaimField icon={<Radio className="h-4 w-4" />} label="MQTT username" value={claim.mqttUsername} />
          <ClaimField icon={<KeyRound className="h-4 w-4" />} label="MQTT password" value={claim.mqttPassword} />
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">
            These credentials are shown once. Store them with the device before leaving this screen.
          </div>
          <div className="rounded-xl border border-white/5 bg-black/30 p-3">
            <div className="mb-1.5 flex items-center justify-between text-xs ad-muted"><span>Claim payload</span><CopyButton text={payload} /></div>
            <pre className="overflow-auto font-mono text-[11px] text-slate-300">{payload}</pre>
          </div>
          <Btn variant="subtle" onClick={onAgain}><PackagePlus className="h-4 w-4" /> Provision another</Btn>
        </div>
      </div>
    </Panel>
  );
}

function ClaimField({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
      <span className="text-cyan-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] ad-muted">{label}</div>
        <div className="truncate font-mono text-sm text-white">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

interface BulkRow { type: string; name: string; ownerEmail: string; valid: boolean; issue?: string; ownerId?: number; }
interface BulkResult { idx: number; type: string; name: string; ok: boolean; id?: string; key?: string; error?: string; }

function BulkProvision({ users, deviceTypes, onDone }: { users: AdminUser[]; deviceTypes: string[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [done, setDone] = useState(0);

  const emailToId = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users) m.set(u.email.toLowerCase(), u.id);
    return m;
  }, [users]);

  const parse = () => {
    const parsed: BulkRow[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [type = "", name = "", ownerEmail = ""] = line.split(",").map((c) => c.trim());
      let valid = true;
      let issue: string | undefined;
      let ownerId: number | undefined;
      if (!type) { valid = false; issue = "missing type"; }
      else if (ownerEmail) {
        const id = emailToId.get(ownerEmail.toLowerCase());
        if (id === undefined) { valid = false; issue = "unknown owner"; }
        else ownerId = id;
      }
      parsed.push({ type, name, ownerEmail, valid, issue, ownerId });
    }
    setRows(parsed);
    setResults(null);
    setDone(0);
  };

  const run = async () => {
    if (!rows) return;
    const valid = rows.filter((r) => r.valid);
    setRunning(true);
    setResults([]);
    setDone(0);
    const out: BulkResult[] = [];
    for (const row of valid) {
      const body: { type: string; name?: string; owner_id?: number } = { type: row.type };
      if (row.name) body.name = row.name;
      if (row.ownerId !== undefined) body.owner_id = row.ownerId;
      const r = await controlPlane.adminProvision(body);
      if (r.ok && r.data.id) out.push({ idx: out.length, type: row.type, name: row.name, ok: true, id: r.data.id, key: r.data.key });
      else out.push({ idx: out.length, type: row.type, name: row.name, ok: false, error: r.data.error || planeError(r.status, r.data) });
      setResults([...out]);
      setDone(out.length);
    }
    setRunning(false);
    onDone();
  };

  const validCount = rows ? rows.filter((r) => r.valid).length : 0;
  const invalidCount = rows ? rows.length - validCount : 0;

  const cols: Column<BulkResult>[] = [
    { key: "device", header: "Device", render: (r) => (<div><div className="text-white">{r.name || <span className="ad-muted">unnamed</span>}</div><div className="text-[11px] ad-muted">{r.type}</div></div>) },
    { key: "status", header: "Status", render: (r) => r.ok ? <Badge tone="green"><CheckCircle2 className="h-3.5 w-3.5" /> created</Badge> : <Badge tone="red"><TriangleAlert className="h-3.5 w-3.5" /> failed</Badge> },
    { key: "id", header: "Device ID", render: (r) => r.id ? <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">{r.id} <CopyButton text={r.id} /></span> : <span className="text-xs ad-muted">—</span> },
    { key: "key", header: "Claim key", render: (r) => r.key ? <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">{r.key} <CopyButton text={r.key} /></span> : <span className="text-xs text-red-300">{r.error}</span> },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>Bulk provisioning</SectionTitle>
        <p className="mb-3 text-sm ad-muted">Paste one device per line as <span className="font-mono text-slate-300">type,name,owner_email</span>. Name and owner are optional; lines starting with <span className="font-mono">#</span> are ignored. Each valid row is a real provisioning call.</p>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
          className="ad-input h-40 resize-y font-mono text-xs"
          placeholder={"smart-plug,Lobby plug,owner@example.com\nmotion-sensor,Hallway sensor\ngateway"}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn variant="subtle" onClick={parse} disabled={running || !text.trim()}><Play className="h-4 w-4" /> Parse</Btn>
          {rows && <span className="text-xs ad-muted">{num(validCount)} valid{invalidCount ? <> · <span className="text-red-300">{num(invalidCount)} skipped</span></> : null}</span>}
          {rows && validCount > 0 && (
            <Btn variant="primary" className="ml-auto" onClick={run} disabled={running}>
              {running ? `Provisioning… ${done}/${validCount}` : <><ShieldCheck className="h-4 w-4" /> Provision {num(validCount)}</>}
            </Btn>
          )}
        </div>
      </Panel>

      {rows && !results && (
        <Panel>
          <SectionTitle right={<Badge tone={invalidCount ? "amber" : "green"}>{num(validCount)} ready</Badge>}>Preview</SectionTitle>
          {rows.length === 0 ? (
            <p className="py-4 text-center text-sm ad-muted">Nothing to provision — every line was blank or a comment.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
                  {r.valid ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <TriangleAlert className="h-4 w-4 text-amber-400" />}
                  <span className="font-mono text-white">{r.type || <span className="text-red-300">?</span>}</span>
                  {r.name && <span className="ad-muted">{r.name}</span>}
                  {r.ownerEmail && <span className="text-xs ad-muted">→ {r.ownerEmail}</span>}
                  {r.issue && <span className="ml-auto text-xs text-amber-300">{r.issue}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {results && (
        <Panel>
          <SectionTitle right={<Badge tone="green">{num(results.filter((r) => r.ok).length)} created{results.some((r) => !r.ok) ? <> · <span className="text-red-300">{num(results.filter((r) => !r.ok).length)} failed</span></> : null}</Badge>}>
            Results {running && <span className="ml-1 text-xs ad-muted">({done}/{validCount})</span>}
          </SectionTitle>
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm ad-muted">Working…</p>
          ) : (
            <DataTable rows={results} columns={cols} rowKey={(r) => String(r.idx)} />
          )}
        </Panel>
      )}
    </div>
  );
}

function DirectoryTab({ devices, unclaimed, events, eventsError }: { devices: AdminDevice[]; unclaimed: AdminDevice[]; events: AdminEvent[]; eventsError: string | null }) {
  const provisioningEvents = useMemo(
    () => events.filter((e) => /provision|claim|register|onboard|enroll/i.test(`${e.kind} ${e.title}`)),
    [events]
  );
  const recent = useMemo(
    () => [...devices].sort((a, b) => (Date.parse(b.last_seen ?? "") || 0) - (Date.parse(a.last_seen ?? "") || 0)).slice(0, 8),
    [devices]
  );

  const unclaimedCols: Column<AdminDevice>[] = [
    { key: "id", header: "Device", render: (d) => (<div className="flex items-center gap-1.5"><span className="font-mono text-xs text-white">{d.id}</span><CopyButton text={d.id} /></div>) },
    { key: "type", header: "Type", render: (d) => <Badge tone="slate">{d.type}</Badge> },
    { key: "state", header: "State", render: (d) => <span className="flex items-center gap-1.5 text-xs"><Dot tone={d.online ? "green" : "slate"} /> {d.online ? "online" : "offline"}</span> },
    { key: "seen", header: "Last seen", align: "right", render: (d) => <span className="text-xs ad-muted">{relativeTime(d.last_seen)}</span> },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <SectionTitle right={<Badge tone={unclaimed.length ? "amber" : "green"}>{num(unclaimed.length)}</Badge>}>Unclaimed devices</SectionTitle>
        {unclaimed.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Every device has an owner" hint="Newly provisioned devices with no owner appear here for claiming." />
        ) : (
          <DataTable rows={unclaimed} columns={unclaimedCols} rowKey={(d) => d.id} dense />
        )}
      </Panel>

      <Panel>
        <SectionTitle>Provisioning activity</SectionTitle>
        {eventsError && events.length === 0 ? (
          <p className="py-6 text-center text-sm text-red-300">{eventsError}</p>
        ) : provisioningEvents.length === 0 ? (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="No provisioning events" hint="Provision or claim events reported by the control plane will show up here." />
        ) : (
          <div className="divide-y divide-white/5">
            {provisioningEvents.slice(0, 12).map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Dot tone="brand" />
                <span className="min-w-0 flex-1 truncate text-slate-200"><span className="font-semibold text-white">{e.title}</span>{e.body && <span className="ad-muted"> — {e.body}</span>}</span>
                <span className="shrink-0 text-xs ad-muted">{relativeTime(e.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="lg:col-span-2">
        <SectionTitle>Recently seen devices</SectionTitle>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm ad-muted">No devices registered yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-cyan-300"><Cpu className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{d.name || d.id}</div>
                  <div className="truncate text-xs ad-muted">{d.type}{d.owner_email ? ` · ${d.owner_email}` : " · unclaimed"}</div>
                </div>
                <span className="flex items-center gap-1.5 text-xs ad-muted"><Dot tone={d.online ? "green" : "slate"} /> {relativeTime(d.last_seen)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
