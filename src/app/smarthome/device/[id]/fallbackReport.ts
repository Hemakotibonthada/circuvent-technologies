import { controlPlane, type Device, type DeviceReport } from "@/lib/control-plane";

/**
 * Assembles a device report from endpoints the deployed control plane already has.
 *
 * The real assembler lives server-side in `platform/api/src/device-report.ts`
 * and is the one that should run. This exists because the control plane in
 * production predates it: `/devices/:id/report` returns 404, and the console's
 * only response was to show the raw "Not found" to someone looking straight at
 * the device it claimed not to find.
 *
 * Everything here comes from routes that are live today — the device record,
 * its telemetry, and the event feed. Nothing is invented, and the fields the
 * old schema genuinely cannot supply are left null with `partial` set, so the
 * UI can say what is missing rather than presenting gaps as facts. An empty
 * audit log must not be mistaken for "nothing was ever done to this device".
 *
 * This is a compatibility shim with a defined end: once the control plane is
 * updated, `deviceReport` succeeds, this is never reached, and it can be
 * deleted along with the `partial` handling in DeviceReportCard.
 */

export interface FallbackReport extends DeviceReport {
  /** Names the fields this build could not source, for honest disclosure. */
  partial: string[];
}

type TelemetryRow = { ts?: string; at?: string; payload?: Record<string, unknown>; data?: Record<string, unknown> };
type EventRow = { ts?: string; created_at?: string; kind?: string; title?: string; body?: string; device_id?: string };

export async function buildFallbackReport(
  deviceId: string,
  limit = 200
): Promise<FallbackReport | null> {
  const [devRes, telRes, evRes] = await Promise.all([
    controlPlane.device(deviceId),
    controlPlane.telemetry(deviceId, limit),
    controlPlane.events(),
  ]);

  if (!devRes.ok) return null;
  const d = ((devRes.data as { device?: Device }).device ?? devRes.data) as Device;
  if (!d?.id) return null;

  const telRaw = telRes.ok
    ? (((telRes.data as { telemetry?: TelemetryRow[] }).telemetry ?? []) as TelemetryRow[])
    : [];
  const telemetry = telRaw.map((t) => ({
    at: t.ts ?? t.at ?? "",
    data: (t.payload ?? t.data ?? {}) as Record<string, unknown>,
  }));

  const evRaw = evRes.ok
    ? (((evRes.data as { events?: EventRow[] }).events ?? []) as EventRow[])
    : [];
  const events = evRaw
    .filter((e) => e.device_id === deviceId)
    .map((e) => ({
      at: e.ts ?? e.created_at ?? "",
      kind: e.kind ?? "info",
      title: e.title ?? "",
      body: e.body ?? "",
    }));

  const state = (d.state ?? {}) as Record<string, unknown>;
  // The firmware publishes its version inside state on every message. The
  // dedicated column is only written by the newer control plane, so on this
  // build it is empty for every device and state is the truthful source.
  const firmware = (typeof state.fw === "string" ? state.fw : null) ?? d.fw_version ?? null;

  const partial = [
    "serial",
    "hwid",
    "batch",
    "key issue and rotation history",
    "administrative audit log",
    "command history",
  ];

  return {
    generatedAt: new Date().toISOString(),
    audience: "owner",
    identity: {
      id: d.id,
      // Serials are assigned by the newer control plane, and the Device type
      // does not carry one because this build never returns it. Reporting a
      // fabricated serial would be worse than reporting none: it would be
      // written down and later contradict the label on the unit.
      serial: null,
      name: d.name || d.id,
      type: d.type,
      room: d.room ?? null,
      firmware,
      registeredAt: null,
      hwid: null,
      batch: null,
      notes: null,
    },
    ownership: { claimed: true },
    credentials: {
      issuedAt: null,
      lastRotatedAt: null,
      rotations: 0,
      recoverable: false,
      note:
        "Device keys are stored as bcrypt hashes and cannot be displayed by anyone, including " +
        "staff. Issue and rotation history is not available from this control plane build.",
    },
    connectivity: {
      online: !!d.online,
      lastSeen: d.last_seen ?? null,
      firstTelemetryAt: telemetry.length ? telemetry[telemetry.length - 1].at : null,
      telemetryRecords: telemetry.length,
      commandsIssued: 0,
    },
    state,
    qr: { label: d.id, serialText: d.id, deviceId: d.id },
    telemetry,
    controlLog: [],
    events,
    auditLog: [],
    summary: {
      historyLimit: limit,
      telemetryReturned: telemetry.length,
      commandsReturned: 0,
      eventsReturned: events.length,
      auditReturned: 0,
      truncated: telemetry.length >= limit,
    },
    partial,
  };
}
