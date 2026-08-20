"use client";

/**
 * OTA console — everything here is real.
 *
 *   Firmware catalogue  -> useAdminConfig("firmware"), disk-backed, audited CRUD.
 *   Firmware in field   -> useFleetInsights(useAdminDevices()).byFirmware, plus a
 *                          per-device-type breakdown derived from live devices.
 *   Pushing an update   -> controlPlane.adminOta (one device) /
 *                          controlPlane.adminOtaBroadcast (a type or the fleet).
 *   Rollout progress    -> recomputed from live device.fw_version as units report
 *                          in; never a fabricated percentage.
 *
 * There is no campaign history, no staged/canary timeline, no rollback tally and
 * no artefact download count: nothing records those, so nothing shows them.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  DownloadCloud, Package, Rocket, ServerCog, Cpu, WifiOff, Plus, Pencil, Trash2,
  ShieldCheck, CheckCircle2, RefreshCw, TriangleAlert, HardDrive, SendHorizontal,
} from "lucide-react";
import { controlPlane, type AdminDevice } from "@/lib/control-plane";
import {
  useAdminDevices, useAdminConfig, useFleetInsights, deviceHealth, combine,
  type ConfigRecord, type ConfigResource,
} from "../_lib/api";
import { relativeTime, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Tabs, Segmented, DataTable, Modal,
  Field, Input, Progress, SectionTitle, StaggerGrid, StaggerItem, EmptyState, CopyButton,
  ErrorState, LoadingState, ResourceGate, type Column,
} from "../_ui";
import { Donut, HBar } from "../../charts";

const DIST_COLORS = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6", "#f97316"];

function planeError(status: number, data: unknown): string {
  const detail = data && typeof data === "object" && "error" in data ? String((data as { error?: unknown }).error ?? "") : "";
  if (detail) return detail;
  if (status === 0) return "Cannot reach the control plane.";
  if (status === 401 || status === 403) return "Operator sign-in required.";
  return `Control plane returned ${status}.`;
}

interface FirmwareRow extends ConfigRecord {
  version: string;
  deviceType: string;
  url: string;
  sha256?: string;
  notes?: string;
}

type OtaTab = "deploy" | "field" | "catalogue";
type TargetKind = "device" | "type" | "fleet";

interface PushOutcome {
  version: string;
  url: string;
  targetLabel: string;
  targetIds: string[];
  sent: number;
  at: number;
}

export default function OtaPage() {
  const devicesRes = useAdminDevices();
  const fw = useAdminConfig<FirmwareRow>("firmware");
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);
  const firmware = fw.rows;
  const fleet = useFleetInsights(devicesRes.data);

  const [tab, setTab] = useState<OtaTab>("deploy");
  const [lastPush, setLastPush] = useState<PushOutcome | null>(null);

  const offline = useMemo(() => devices.filter((d) => deviceHealth(d) === "offline"), [devices]);
  const page = combine(devicesRes, fw);

  if (devicesRes.loading && devices.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingState rows={2} label="Loading OTA console…" />
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
        title="OTA updates"
        icon={<DownloadCloud className="h-5 w-5" />}
        subtitle="Publish firmware builds, push them to real devices over the control plane, and watch the fleet converge on the target version."
        actions={
          <Btn variant="subtle" onClick={page.reload} title="Refresh firmware and fleet">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Btn>
        }
      />

      {page.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {page.error}
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Firmware builds" value={fw.loading && firmware.length === 0 ? "—" : num(firmware.length)} icon={<Package className="h-4 w-4" />} tone="blue" sub="in catalogue" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Versions in field" value={num(fleet.byFirmware.length)} icon={<ServerCog className="h-4 w-4" />} tone="violet" sub="distinct" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Fleet devices" value={num(fleet.total)} icon={<Cpu className="h-4 w-4" />} tone="brand" sub={`${num(fleet.online)} online`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Offline" value={num(offline.length)} icon={<WifiOff className="h-4 w-4" />} tone={offline.length ? "amber" : "green"} sub="cannot update now" />
        </StaggerItem>
      </StaggerGrid>

      <Tabs<OtaTab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "deploy", label: "Deploy", icon: <Rocket className="h-4 w-4" /> },
          { value: "field", label: "In the field", icon: <ServerCog className="h-4 w-4" />, count: fleet.byFirmware.length },
          { value: "catalogue", label: "Catalogue", icon: <HardDrive className="h-4 w-4" />, count: firmware.length },
        ]}
      />

      {tab === "deploy" && (
        <DeployTab
          devices={devices} firmware={firmware} offline={offline}
          lastPush={lastPush} onPush={setLastPush}
          reloadDevices={devicesRes.reload}
          onGoCatalogue={() => setTab("catalogue")}
        />
      )}
      {tab === "field" && <FieldTab devices={devices} byFirmware={fleet.byFirmware} total={fleet.total} />}
      {tab === "catalogue" && <CatalogueTab fw={fw} deviceTypes={fleet.byType.map((t) => t.name)} />}
    </div>
  );
}

function DeployTab({
  devices, firmware, offline, lastPush, onPush, reloadDevices, onGoCatalogue,
}: {
  devices: AdminDevice[];
  firmware: FirmwareRow[];
  offline: AdminDevice[];
  lastPush: PushOutcome | null;
  onPush: (o: PushOutcome) => void;
  reloadDevices: () => void;
  onGoCatalogue: () => void;
}) {
  const [buildId, setBuildId] = useState("");
  const [kind, setKind] = useState<TargetKind>("type");
  const [deviceId, setDeviceId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const build = useMemo(() => firmware.find((f) => f.id === buildId) ?? null, [firmware, buildId]);
  const typeDevices = useMemo(
    () => (build ? devices.filter((d) => d.type === build.deviceType) : []),
    [devices, build]
  );
  const targetIds = useMemo(() => {
    if (!build) return [];
    if (kind === "device") return deviceId ? [deviceId] : [];
    if (kind === "type") return typeDevices.map((d) => d.id);
    return devices.map((d) => d.id);
  }, [build, kind, deviceId, typeDevices, devices]);
  const alreadyOn = useMemo(
    () => devices.filter((d) => targetIds.includes(d.id) && build != null && d.fw_version === build.version).length,
    [devices, targetIds, build]
  );
  const offlineTargeted = useMemo(
    () => targetIds.filter((id) => offline.some((o) => o.id === id)).length,
    [targetIds, offline]
  );

  if (firmware.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" />}
        title="No firmware builds yet"
        hint="Add a build to the catalogue before you can deploy it to devices."
        action={<Btn variant="primary" onClick={onGoCatalogue}><Plus className="h-4 w-4" /> Open catalogue</Btn>}
      />
    );
  }

  const targetLabel = (): string => {
    if (!build) return "";
    if (kind === "device") {
      const d = devices.find((x) => x.id === deviceId);
      return d ? d.name || d.id : deviceId;
    }
    if (kind === "type") return `all ${build.deviceType} devices`;
    return "the whole fleet";
  };

  const canPush = build != null && (kind !== "device" || deviceId !== "") && targetIds.length > 0 && !busy;

  async function runPush() {
    if (!build) return;
    setBusy(true);
    setResult(null);
    const ids = targetIds.slice();
    const label = targetLabel();
    let ok = false;
    let sent = 0;
    let message = "";
    if (kind === "device") {
      const r = await controlPlane.adminOta(deviceId, build.url, build.version);
      ok = r.ok; sent = 1;
      if (!ok) message = planeError(r.status, r.data);
    } else if (kind === "type") {
      const r = await controlPlane.adminOtaBroadcast({ type: build.deviceType, url: build.url, version: build.version });
      ok = r.ok; sent = r.ok ? r.data.sent : 0;
      if (!ok) message = planeError(r.status, r.data);
    } else {
      const r = await controlPlane.adminOtaBroadcast({ url: build.url, version: build.version });
      ok = r.ok; sent = r.ok ? r.data.sent : 0;
      if (!ok) message = planeError(r.status, r.data);
    }
    setBusy(false);
    setConfirming(false);
    if (ok) {
      onPush({ version: build.version, url: build.url, targetLabel: label, targetIds: ids, sent, at: Date.now() });
      setResult({ ok: true, message: `Update to ${build.version} dispatched to ${num(sent)} device${sent === 1 ? "" : "s"}. They download and reboot on their next check-in.` });
      reloadDevices();
    } else {
      setResult({ ok: false, message: message || "The update could not be dispatched." });
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>Push an update</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Firmware build">
            <select className="ad-input" value={buildId} onChange={(e) => { setBuildId(e.target.value); setDeviceId(""); setResult(null); }}>
              <option value="">Select a build…</option>
              {firmware.map((f) => (
                <option key={f.id} value={f.id}>{f.version} · {f.deviceType}</option>
              ))}
            </select>
          </Field>
          <Field label="Target">
            <Segmented<TargetKind>
              value={kind}
              onChange={(k) => { setKind(k); setResult(null); }}
              options={[
                { value: "device", label: "One device" },
                { value: "type", label: "By type" },
                { value: "fleet", label: "Whole fleet" },
              ]}
            />
          </Field>
        </div>

        {build && kind === "device" && (
          <div className="mt-4">
            <Field
              label={`Device (${build.deviceType})`}
              hint={
                typeDevices.length
                  ? undefined
                  : `No ${build.deviceType} devices are registered, so there is nothing this build can safely go to.`
              }
            >
              {/*
                * Only devices of the build's own type, with no fallback.
                *
                * This used to read `(typeDevices.length ? typeDevices : devices)`
                * — so whenever the filter matched nothing (a typo in the
                * catalogue's free-text deviceType, a type with no units yet) the
                * picker quietly listed the entire fleet instead: locks, cameras,
                * drones, meters. The option labels carry no type either, and the
                * confirmation below shows the *build's* declared type rather than
                * the chosen device's, so a mismatch stayed invisible right up to
                * dispatch. Flashing a binary built for other hardware is the one
                * mistake here that cannot be undone from this console.
                */}
              <select
                className="ad-input"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                disabled={!typeDevices.length}
              >
                <option value="">{typeDevices.length ? "Select a device…" : "No matching devices"}</option>
                {typeDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name || d.id} · {d.type} · {d.fw_version || "?"} · {d.online ? "online" : "offline"}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {build && (
          <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-4 text-sm">
            <div className="ad-muted">Binary <span className="ml-1 break-all font-mono text-[12px] text-slate-300">{build.url}</span></div>
            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1.5">
              <span className="text-slate-300"><span className="font-semibold text-white tabular-nums">{num(targetIds.length)}</span> device{targetIds.length === 1 ? "" : "s"} targeted</span>
              <span className="text-slate-300"><span className="font-semibold text-white tabular-nums">{num(alreadyOn)}</span> already on {build.version}</span>
              {kind !== "device" && <span className="text-slate-300"><span className="font-semibold text-white tabular-nums">{num(offlineTargeted)}</span> offline</span>}
            </div>
          </div>
        )}

        {result && (
          <div role="status" className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-green-500/25 bg-green-500/[0.07] text-green-200" : "border-red-500/25 bg-red-500/[0.07] text-red-200"}`}>
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}

        <div className="mt-4">
          <Btn variant="primary" disabled={!canPush} onClick={() => setConfirming(true)}>
            <SendHorizontal className="h-4 w-4" /> Review &amp; push
          </Btn>
        </div>
      </Panel>

      {lastPush && <RolloutPanel devices={devices} push={lastPush} />}

      <OfflinePanel offline={offline} />

      <Modal open={confirming} onClose={() => { if (!busy) setConfirming(false); }} title="Confirm firmware push">
        {build && (
          <div className="space-y-3 text-sm">
            <p className="ad-muted">This publishes a real OTA command over the control plane. Targeted devices download the binary and reboot into it on their next check-in.</p>
            <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/20 p-4">
              <Row k="Version" v={<span className="font-mono text-white">{build.version}</span>} />
              <Row k="Device type" v={<Badge tone="blue">{build.deviceType}</Badge>} />
              <Row k="Target" v={<span className="text-white">{targetLabel()}</span>} />
              <Row k="Devices" v={<span className="font-semibold text-white tabular-nums">{num(targetIds.length)}</span>} />
              <Row k="Binary" v={<span className="break-all font-mono text-[11px] text-slate-300">{build.url}</span>} />
            </div>
            <div className="flex gap-2">
              <Btn variant="subtle" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Btn>
              <Btn variant="primary" className="flex-1" onClick={runPush} disabled={busy || targetIds.length === 0}>
                {busy ? "Dispatching…" : <><Rocket className="h-4 w-4" /> Push to {num(targetIds.length)}</>}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RolloutPanel({ devices, push }: { devices: AdminDevice[]; push: PushOutcome }) {
  const targeted = useMemo(() => devices.filter((d) => push.targetIds.includes(d.id)), [devices, push.targetIds]);
  const onTarget = targeted.filter((d) => d.fw_version === push.version);
  const pending = targeted.filter((d) => d.fw_version !== push.version);
  const denom = push.targetIds.length || 1;
  const progress = (onTarget.length / denom) * 100;

  return (
    <Panel>
      <SectionTitle right={<span className="text-xs ad-muted">pushed {relativeTime(push.at)}</span>}>
        Rollout · {push.version} → {push.targetLabel}
      </SectionTitle>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-white tabular-nums">{num(onTarget.length)}/{num(push.targetIds.length)} on target</span>
        <span className="ad-muted tabular-nums">{progress.toFixed(0)}%</span>
      </div>
      <Progress value={progress} tone={progress >= 100 ? "green" : "brand"} />
      <p className="mt-2 text-[11px] ad-muted">Recomputed live from device state as units report in — not an estimate.</p>

      {pending.length > 0 && (
        <div className="mt-4">
          <SectionTitle>Still on an older version ({num(pending.length)})</SectionTitle>
          <div className="space-y-1.5">
            {pending.slice(0, 12).map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
                <Dot tone={d.online ? "amber" : "slate"} />
                <span className="min-w-0 flex-1 truncate text-white">{d.name || d.id}</span>
                <span className="font-mono text-xs text-slate-400">{d.fw_version || "?"}</span>
                <span className="text-xs ad-muted">{d.online ? "online" : "offline"}</span>
              </div>
            ))}
            {pending.length > 12 && <p className="pt-1 text-center text-xs ad-muted">+{num(pending.length - 12)} more</p>}
          </div>
        </div>
      )}
    </Panel>
  );
}

function OfflinePanel({ offline }: { offline: AdminDevice[] }) {
  return (
    <Panel>
      <SectionTitle right={<Badge tone={offline.length ? "amber" : "green"}>{num(offline.length)}</Badge>}>
        Offline — cannot update now
      </SectionTitle>
      {offline.length === 0 ? (
        <p className="py-4 text-center text-sm ad-muted">Every device is online and reachable for OTA.</p>
      ) : (
        <div className="space-y-1.5">
          {offline.slice(0, 12).map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
              <WifiOff className="h-4 w-4 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-white">{d.name || d.id}</span>
              <Badge tone="slate">{d.type}</Badge>
              <span className="text-xs ad-muted">seen {relativeTime(d.last_seen)}</span>
            </div>
          ))}
          {offline.length > 12 && <p className="pt-1 text-center text-xs ad-muted">+{num(offline.length - 12)} more</p>}
        </div>
      )}
    </Panel>
  );
}

function FieldTab({ devices, byFirmware, total }: { devices: AdminDevice[]; byFirmware: { name: string; value: number }[]; total: number }) {
  const byTypeFirmware = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const d of devices) {
      const t = d.type || "unknown";
      const v = d.fw_version || "unknown";
      if (!map.has(t)) map.set(t, new Map());
      const inner = map.get(t)!;
      inner.set(v, (inner.get(v) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([type, versions]) => ({
        type,
        total: [...versions.values()].reduce((a, b) => a + b, 0),
        versions: [...versions.entries()].map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }, [devices]);

  if (total === 0) {
    return <EmptyState icon={<ServerCog className="h-6 w-6" />} title="No devices reporting firmware" hint="Once devices connect, the versions they run appear here." />;
  }

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>Firmware distribution</SectionTitle>
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <div className="flex justify-center">
            <Donut size={180} segments={byFirmware.slice(0, 8).map((f, i) => ({ label: f.name, value: f.value, color: DIST_COLORS[i % DIST_COLORS.length] }))} />
          </div>
          <div className="space-y-3">
            {byFirmware.slice(0, 8).map((f, i) => {
              const share = total ? (f.value / total) * 100 : 0;
              return (
                <div key={f.name} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-white">
                      <span className="h-2.5 w-2.5 rounded" style={{ background: DIST_COLORS[i % DIST_COLORS.length] }} />
                      <span className="font-mono">{f.name}</span>
                    </span>
                    <span className="text-xs ad-muted tabular-nums">{num(f.value)} · {share.toFixed(0)}%</span>
                  </div>
                  <Progress value={share} tone="brand" />
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>By device type</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {byTypeFirmware.map((t) => (
            <div key={t.type} className="rounded-xl border border-white/5 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-white"><Cpu className="h-4 w-4 text-cyan-400" /> {t.type}</span>
                <Badge tone="slate">{num(t.total)}</Badge>
              </div>
              <HBar items={t.versions.map((v, i) => ({ name: v.version, value: v.count, color: DIST_COLORS[i % DIST_COLORS.length] }))} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CatalogueTab({ fw, deviceTypes }: { fw: ConfigResource<FirmwareRow>; deviceTypes: string[] }) {
  const [editing, setEditing] = useState<FirmwareRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<FirmwareRow | null>(null);

  const cols: Column<FirmwareRow>[] = [
    {
      key: "version", header: "Version", sort: (a, b) => a.version.localeCompare(b.version),
      render: (f) => (<div className="flex items-center gap-2"><Package className="h-4 w-4 text-cyan-400" /><span className="font-mono font-medium text-white">{f.version}</span></div>),
    },
    { key: "type", header: "Device type", render: (f) => <Badge tone="blue">{f.deviceType}</Badge> },
    {
      key: "url", header: "Binary",
      render: (f) => (<span className="flex items-center gap-1.5"><span className="block max-w-[240px] truncate font-mono text-[11px] text-slate-300">{f.url}</span><CopyButton text={f.url} /></span>),
    },
    {
      key: "sha", header: "SHA-256",
      render: (f) => f.sha256 ? (<span className="flex items-center gap-1.5 font-mono text-[11px] ad-muted">{f.sha256.slice(0, 12)}… <CopyButton text={f.sha256} /></span>) : <span className="text-xs ad-muted">—</span>,
    },
    {
      key: "added", header: "Added",
      render: (f) => (<div className="text-xs"><div className="text-slate-300">{relativeTime(f.createdAt)}</div><div className="ad-muted">{f.createdBy}</div></div>),
    },
    {
      key: "actions", header: "", align: "right",
      render: (f) => (
        <div className="flex justify-end gap-1.5">
          <Btn size="sm" variant="subtle" onClick={() => setEditing(f)}><Pencil className="h-3.5 w-3.5" /></Btn>
          <Btn size="sm" variant="danger" onClick={() => setDeleting(f)}><Trash2 className="h-3.5 w-3.5" /></Btn>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm ad-muted">Builds persist server-side and every change is written to the operator audit log.</p>
        <Btn variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add build</Btn>
      </div>

      <ResourceGate
        loading={fw.loading} error={fw.error} unauthorized={fw.unauthorized} onRetry={fw.reload}
        isEmpty={fw.rows.length === 0}
        empty={<EmptyState icon={<HardDrive className="h-6 w-6" />} title="No firmware builds" hint="Add your first build to start deploying real firmware." action={<Btn variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add build</Btn>} />}
        skeletonRows={4}
      >
        <DataTable rows={fw.rows} columns={cols} rowKey={(f) => f.id} />
      </ResourceGate>

      {(creating || editing) && (
        <FirmwareForm fw={fw} deviceTypes={deviceTypes} existing={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}

      <Modal open={!!deleting} onClose={() => { if (!fw.saving) setDeleting(null); }} title="Delete firmware build">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm ad-muted">Remove <span className="font-mono text-white">{deleting.version}</span> ({deleting.deviceType}) from the catalogue? Devices already running it are unaffected — you simply won’t be able to deploy it again.</p>
            <div className="flex gap-2">
              <Btn variant="subtle" className="flex-1" onClick={() => setDeleting(null)} disabled={fw.saving}>Cancel</Btn>
              <Btn variant="danger" className="flex-1" disabled={fw.saving} onClick={async () => { const ok = await fw.remove(deleting.id); if (ok) setDeleting(null); }}>
                {fw.saving ? "Deleting…" : <><Trash2 className="h-4 w-4" /> Delete</>}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FirmwareForm({ fw, deviceTypes, existing, onClose }: {
  fw: ConfigResource<FirmwareRow>; deviceTypes: string[]; existing: FirmwareRow | null; onClose: () => void;
}) {
  const [version, setVersion] = useState(existing?.version ?? "");
  const [deviceType, setDeviceType] = useState(existing?.deviceType ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [sha256, setSha256] = useState(existing?.sha256 ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const v = version.trim();
    const t = deviceType.trim();
    const u = url.trim();
    const s = sha256.trim();
    if (!v) { setErr("A version is required."); return; }
    if (!t) { setErr("A device type is required."); return; }
    if (!/^https?:\/\/.+/i.test(u)) { setErr("A valid http(s) binary URL is required."); return; }
    if (s && !/^[a-f0-9]{64}$/i.test(s)) { setErr("SHA-256 must be 64 hex characters, or left blank."); return; }
    setErr(null);
    const body: Record<string, unknown> = { version: v, deviceType: t, url: u, sha256: s ? s.toLowerCase() : "", notes: notes.trim() };
    const saved = existing ? await fw.update(existing.id, body) : await fw.create(body);
    if (saved) onClose();
    else setErr("Could not save. Confirm you are signed in as an operator and try again.");
  };

  return (
    <Modal open onClose={onClose} title={existing ? "Edit firmware build" : "Add firmware build"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Version"><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="3.4.2" className="font-mono" /></Field>
        <Field label="Device type">
          <Input list="ota-device-types" value={deviceType} onChange={(e) => setDeviceType(e.target.value)} placeholder="smart-plug" />
          <datalist id="ota-device-types">{deviceTypes.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      </div>
      <div className="mt-4"><Field label="Binary URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/firmware.bin" className="font-mono" /></Field></div>
      <div className="mt-4"><Field label="SHA-256" hint="Optional integrity hash the device verifies before flashing."><Input value={sha256} onChange={(e) => setSha256(e.target.value)} placeholder="64 hex characters" className="font-mono" /></Field></div>
      <div className="mt-4"><Field label="Release notes" hint="Optional."><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="ad-input h-24 resize-none" placeholder="What changed in this build…" /></Field></div>
      {err && <p className="mt-3 flex items-center gap-1.5 text-sm text-red-300"><TriangleAlert className="h-4 w-4" /> {err}</p>}
      <div className="mt-5 flex gap-2">
        <Btn variant="subtle" className="flex-1" onClick={onClose} disabled={fw.saving}>Cancel</Btn>
        <Btn variant="primary" className="flex-1" onClick={save} disabled={fw.saving}>
          {fw.saving ? "Saving…" : <><ShieldCheck className="h-4 w-4" /> {existing ? "Save changes" : "Add build"}</>}
        </Btn>
      </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="ad-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
