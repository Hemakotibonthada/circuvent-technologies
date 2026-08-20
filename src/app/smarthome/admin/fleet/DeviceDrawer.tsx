"use client";

/**
 * Real device detail.
 *
 * Everything shown is loaded live from the control plane for the given id:
 *   - `controlPlane.adminDevice(id)` for metadata + reported state
 *   - `useDeviceTelemetry(id)` for stored telemetry frames
 * Operator actions (rename/move, command, OTA, delete) are wired straight to the
 * control plane, each with a pending state, the real success/error message, and
 * a refresh. Nothing here is fabricated.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Activity, Cpu, Terminal, Send, DownloadCloud, Trash2, Save, RefreshCw,
  TriangleAlert, ListTree, Sliders, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { LineChart } from "../../charts";
import { controlPlane, type AdminDevice, type ApiResult } from "@/lib/control-plane";
import {
  useResource, useDeviceTelemetry, availableMetrics, telemetrySeries,
  deviceHealth, activeFaults, type DeviceHealth, type Resource,
} from "../_lib/api";
import { relativeTime, fmtDateTime, num } from "../_lib/format";
import {
  Drawer, Tabs, Badge, Btn, Dot, Field, Input, Select, Skeleton,
  ErrorState, EmptyState, Modal, type Tone,
} from "../_ui";

type Tab = "state" | "telemetry" | "actions";
type TelemetryResource = Resource<{ ts: string; payload: Record<string, unknown> }[]>;

const HEALTH_TONE: Record<DeviceHealth, Tone> = { healthy: "green", warning: "amber", critical: "red", offline: "slate" };

/** Human-readable failure reason for a raw control-plane response envelope. */
function errText(r: { status: number; data: unknown }): string {
  const body = r.data;
  if (body && typeof body === "object" && "error" in body) {
    const m = String((body as { error?: unknown }).error ?? "");
    if (m) return m;
  }
  if (r.status === 0) return "Cannot reach the control plane.";
  if (r.status === 401) return "Not signed in to the control plane.";
  if (r.status === 403) return "This account is not an operator.";
  if (r.status === 404) return "Device not found on the control plane.";
  return `Control plane returned ${r.status}.`;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function DeviceDrawer({
  deviceId,
  onClose,
  onChanged,
}: {
  deviceId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("state");

  const detail = useResource(
    useCallback(
      (): Promise<ApiResult<{ device: AdminDevice | null }>> =>
        deviceId
          ? controlPlane.adminDevice(deviceId)
          : Promise.resolve({ ok: true, status: 200, data: { device: null } }),
      [deviceId]
    ),
    (r) => r.device,
    15000
  );
  const telemetry = useDeviceTelemetry(deviceId, 200, 15000);

  const device = detail.data;

  if (!deviceId) return null;

  const health: DeviceHealth = device ? deviceHealth(device) : "offline";

  return (
    <Drawer open onClose={onClose} title={device?.name || deviceId} width={620}>
      {detail.loading && !device ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : detail.error && !device ? (
        <ErrorState message={detail.error} unauthorized={detail.unauthorized} onRetry={detail.reload} />
      ) : !device ? (
        <EmptyState icon={<Cpu className="h-6 w-6" />} title="Device not found" hint="It may have been deleted or is not visible to this operator." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={device.online ? "green" : "slate"}><Dot tone={device.online ? "green" : "slate"} pulse={device.online} /> {device.online ? "Online" : "Offline"}</Badge>
            <Badge tone={HEALTH_TONE[health]}>{health}</Badge>
            <Badge tone="slate">{device.type}</Badge>
            {device.fw_version && <Badge tone="blue">fw {device.fw_version}</Badge>}
            <span className="ml-auto font-mono text-xs ad-muted">{device.id}</span>
          </div>

          <div className="mb-4">
            <Tabs<Tab>
              value={tab} onChange={setTab}
              tabs={[
                { value: "state", label: "State", icon: <ListTree className="h-4 w-4" /> },
                { value: "telemetry", label: "Telemetry", icon: <Activity className="h-4 w-4" /> },
                { value: "actions", label: "Actions", icon: <Sliders className="h-4 w-4" /> },
              ]}
            />
          </div>

          {tab === "state" && <StateTab device={device} />}
          {tab === "telemetry" && <TelemetryTab telemetry={telemetry} />}
          {tab === "actions" && (
            <ActionsTab
              device={device}
              onChanged={() => { detail.reload(); onChanged?.(); }}
              onDeleted={() => { onChanged?.(); onClose(); }}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-sm last:border-0">
      <span className="ad-muted">{k}</span>
      <span className="min-w-0 truncate text-right font-medium text-white">{v}</span>
    </div>
  );
}

function StateTab({ device }: { device: AdminDevice }) {
  const faults = activeFaults(device.state);
  const entries = Object.entries(device.state ?? {});
  return (
    <div className="space-y-4">
      <div className="ad-card rounded-xl p-4">
        <KV k="Name" v={device.name || "—"} />
        <KV k="Type" v={device.type} />
        <KV k="Room" v={(device.room && device.room.trim()) || "Unassigned"} />
        <KV k="Owner" v={device.owner_email || "unclaimed"} />
        <KV k="Firmware" v={<span className="font-mono">{device.fw_version || "—"}</span>} />
        <KV k="Last seen" v={device.last_seen ? `${fmtDateTime(device.last_seen)} · ${relativeTime(device.last_seen)}` : "never"} />
        <KV k="Status" v={<span className="inline-flex items-center gap-1.5"><Dot tone={device.online ? "green" : "slate"} pulse={device.online} /> {device.online ? "Online" : "Offline"}</span>} />
      </div>

      {faults.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5">
          <TriangleAlert className="h-4 w-4 shrink-0 text-red-300" />
          <span className="text-sm text-red-200">Active faults:</span>
          {faults.map((f) => <Badge key={f} tone="red">{f}</Badge>)}
        </div>
      )}

      <div className="ad-card rounded-xl p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider ad-muted">Reported state</div>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm ad-muted">This device has not reported any state yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono text-slate-400">{k}</span>
                <span className="max-w-[60%] truncate text-right font-medium text-white" title={formatValue(v)}>{formatValue(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TelemetryTab({ telemetry }: { telemetry: TelemetryResource }) {
  const frames = useMemo(() => telemetry.data ?? [], [telemetry.data]);
  const metrics = useMemo(() => availableMetrics(frames), [frames]);
  const [metric, setMetric] = useState<string>("");
  const active = metric && metrics.includes(metric) ? metric : metrics[0] ?? "";
  const series = useMemo(() => (active ? telemetrySeries(frames, active) : { labels: [], data: [] }), [frames, active]);

  if (telemetry.loading && frames.length === 0) {
    return <div className="space-y-3"><Skeleton className="h-9 w-40" /><Skeleton className="h-56 w-full" /></div>;
  }
  if (telemetry.error && frames.length === 0) {
    return <ErrorState message={telemetry.error} unauthorized={telemetry.unauthorized} onRetry={telemetry.reload} />;
  }
  if (frames.length === 0 || metrics.length === 0) {
    return <EmptyState icon={<Activity className="h-6 w-6" />} title="No telemetry recorded" hint="Numeric telemetry frames chart here once the device reports them." />;
  }

  const values = series.data;
  const last = values.length ? values[values.length - 1] : null;
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Select value={active} onChange={setMetric} options={metrics.map((m) => ({ value: m, label: m }))} className="min-w-[160px]" />
        <Btn size="sm" variant="subtle" onClick={telemetry.reload}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Btn>
      </div>
      <div className="ad-card rounded-xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white">{active}</span>
          <span className="text-lg font-bold tabular-nums text-cyan-300">{last !== null ? String(last) : "—"}</span>
        </div>
        {values.length ? (
          <LineChart data={values} color="#22d3ee" height={200} />
        ) : (
          <p className="py-8 text-center text-sm ad-muted">No numeric points for “{active}”.</p>
        )}
        <div className="mt-3 flex gap-4 text-xs ad-muted">
          <span>min <span className="tabular-nums text-white">{min !== null ? String(min) : "—"}</span></span>
          <span>max <span className="tabular-nums text-white">{max !== null ? String(max) : "—"}</span></span>
          <span className="ml-auto">{num(frames.length)} frames</span>
        </div>
      </div>
    </div>
  );
}

function ActionsTab({
  device, onChanged, onDeleted,
}: {
  device: AdminDevice;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(device.name ?? "");
  const [room, setRoom] = useState(device.room ?? "");
  const [command, setCommand] = useState('{ "power": true }');
  const [otaUrl, setOtaUrl] = useState("");
  const [otaVersion, setOtaVersion] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCommand, setConfirmCommand] = useState(false);
  const [confirmOta, setConfirmOta] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ action: string; ok: boolean; msg: string } | null>(null);

  const run = useCallback(
    async (
      action: string,
      fn: () => Promise<ApiResult<{ success?: boolean; error?: string }>>,
      okMsg: string,
      after?: () => void
    ) => {
      setBusy(action);
      setResult(null);
      const r = await fn();
      const ok = r.ok && r.data?.success !== false;
      setBusy(null);
      setResult({ action, ok, msg: ok ? okMsg : errText(r) });
      if (ok) after?.();
    },
    []
  );

  const metaDirty = name.trim() !== (device.name ?? "") || room.trim() !== (device.room ?? "");

  const parsedCommand = useMemo<{ value: Record<string, unknown> | null; error: string }>(() => {
    try {
      const p: unknown = JSON.parse(command);
      if (p && typeof p === "object" && !Array.isArray(p)) return { value: p as Record<string, unknown>, error: "" };
      return { value: null, error: "Command must be a JSON object." };
    } catch {
      return { value: null, error: "Invalid JSON." };
    }
  }, [command]);

  const status = (action: string) =>
    result && result.action === action ? (
      <div className={`mt-2 flex items-center gap-1.5 text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}>
        {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {result.msg}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <section className="ad-card rounded-xl p-4">
        <div className="mb-3 text-sm font-semibold text-white">Identity</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name" /></Field>
          <Field label="Room"><Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" /></Field>
        </div>
        <div className="mt-3">
          <Btn
            variant="primary" size="sm" disabled={!metaDirty || busy === "meta"}
            onClick={() => run("meta", () => controlPlane.adminPatchDevice(device.id, { name: name.trim(), room: room.trim() }), "Saved device metadata.", onChanged)}
          >
            {busy === "meta" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Btn>
          {status("meta")}
        </div>
      </section>

      <section className="ad-card rounded-xl p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white"><Terminal className="h-4 w-4" /> Send command</div>
        <p className="mb-2 text-xs ad-muted">Publishes a JSON command to the device over MQTT.</p>
        <textarea
          value={command} onChange={(e) => setCommand(e.target.value)} rows={3} spellCheck={false}
          className="ad-input w-full font-mono text-xs"
        />
        {parsedCommand.error && <div className="mt-1 text-xs text-amber-300">{parsedCommand.error}</div>}
        <div className="mt-2">
          <Btn
            variant="subtle" size="sm" disabled={!parsedCommand.value || busy === "command"}
            onClick={() => setConfirmCommand(true)}
          >
            {busy === "command" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </Btn>
          {status("command")}
        </div>
      </section>

      <section className="ad-card rounded-xl p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white"><DownloadCloud className="h-4 w-4" /> Push firmware (OTA)</div>
        <p className="mb-2 text-xs ad-muted">Instructs the device to download and flash a firmware image.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Image URL"><Input value={otaUrl} onChange={(e) => setOtaUrl(e.target.value)} placeholder="https://…/firmware.bin" /></Field>
          <Field label="Version (optional)"><Input value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} placeholder="1.2.3" /></Field>
        </div>
        <div className="mt-3">
          <Btn
            variant="subtle" size="sm" disabled={!otaUrl.trim() || busy === "ota"}
            onClick={() => setConfirmOta(true)}
          >
            {busy === "ota" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />} Push OTA
          </Btn>
          {status("ota")}
        </div>
      </section>

      <section className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-200"><Trash2 className="h-4 w-4" /> Delete device</div>
        <p className="mb-3 text-xs text-red-200/70">Removes the device and its data from the control plane. This cannot be undone.</p>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <Btn
              variant="danger" size="sm" disabled={busy === "delete"}
              onClick={() => run("delete", () => controlPlane.adminDeleteDevice(device.id), "Device deleted.", onDeleted)}
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Confirm delete
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
          </div>
        ) : (
          <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete…</Btn>
        )}
        {status("delete")}
      </section>

      <Modal open={confirmCommand} onClose={() => { if (busy !== "command") setConfirmCommand(false); }} title="Confirm send command">
        <div className="space-y-3 text-sm">
          <p className="ad-muted">This publishes the command below directly to the device over MQTT. It takes effect immediately — there is no undo.</p>
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/20 p-4">
            <KV k="Device" v={device.name || "—"} />
            <KV k="Device ID" v={<span className="font-mono">{device.id}</span>} />
            <div className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="ad-muted shrink-0">Command</span>
              <span className="min-w-0 break-all text-right font-mono text-[11px] text-white">{command}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn variant="subtle" className="flex-1" onClick={() => setConfirmCommand(false)} disabled={busy === "command"}>Cancel</Btn>
            <Btn
              variant="primary" className="flex-1" disabled={busy === "command"}
              onClick={() => {
                setConfirmCommand(false);
                if (parsedCommand.value) run("command", () => controlPlane.adminCommand(device.id, parsedCommand.value as Record<string, unknown>), "Command published.", onChanged);
              }}
            >
              {busy === "command" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm send
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={confirmOta} onClose={() => { if (busy !== "ota") setConfirmOta(false); }} title="Confirm firmware push">
        <div className="space-y-3 text-sm">
          <p className="ad-muted">This flashes the device with the binary below. A wrong or bad image can brick the device — unlike delete, this cannot be undone by re-provisioning.</p>
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/20 p-4">
            <KV k="Device" v={device.name || "—"} />
            <KV k="Device ID" v={<span className="font-mono">{device.id}</span>} />
            <KV k="Version" v={otaVersion.trim() || "—"} />
            <div className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="ad-muted shrink-0">Image URL</span>
              <span className="min-w-0 break-all text-right font-mono text-[11px] text-white">{otaUrl.trim()}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn variant="subtle" className="flex-1" onClick={() => setConfirmOta(false)} disabled={busy === "ota"}>Cancel</Btn>
            <Btn
              variant="primary" className="flex-1" disabled={busy === "ota"}
              onClick={() => {
                setConfirmOta(false);
                run("ota", () => controlPlane.adminOta(device.id, otaUrl.trim(), otaVersion.trim() || undefined), "OTA update dispatched.", onChanged);
              }}
            >
              {busy === "ota" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />} Confirm push
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
