import { pool } from "./db";
import { labelQrPayload } from "./serial";

/**
 * The device report.
 *
 * WHY ONE ASSEMBLER FOR TWO AUDIENCES
 *
 * An owner and an operator want almost the same document — what is this unit,
 * who has it, what has it been doing, what has been done to it. Writing that
 * twice guarantees the two drift, and the direction they drift in is the
 * dangerous one: a field added to the admin report gets copied to the user one
 * without the redaction, or a fix lands on the customer's copy and not on the
 * one support is reading during an incident.
 *
 * So the report is assembled once and redacted at the boundary. `audience` is a
 * required argument, not an option with a default, because the safe value is
 * not obvious enough to make it the fallback.
 */

export type ReportAudience = "owner" | "admin";

export interface ReportOptions {
  /** Rows of history to include per section. */
  limit?: number;
}

interface DeviceRow {
  id: string;
  serial: string | null;
  hwid: string;
  name: string;
  type: string;
  room: string;
  favorite: boolean;
  online: boolean;
  last_seen: Date | null;
  state: Record<string, unknown>;
  fw_version: string;
  created_at: Date;
  notes: string;
  batch: string;
  key_issued_at: Date;
  key_rotated_at: Date | null;
  key_rotations: number;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
}

const DEVICE_SELECT = `
  SELECT d.id, d.serial, d.hwid, d.name, d.type, d.room, d.favorite, d.online, d.last_seen,
         d.state, d.fw_version, d.created_at, d.notes, d.batch,
         d.key_issued_at, d.key_rotated_at, d.key_rotations,
         d.owner_id, u.email AS owner_email, u.name AS owner_name
    FROM devices d LEFT JOIN users u ON u.id = d.owner_id
   WHERE d.id = $1`;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export interface DeviceReport {
  generatedAt: string;
  audience: ReportAudience;
  identity: Record<string, unknown>;
  ownership: Record<string, unknown>;
  credentials: Record<string, unknown>;
  connectivity: Record<string, unknown>;
  state: Record<string, unknown>;
  qr: Record<string, string>;
  telemetry: Array<{ at: string; data: Record<string, unknown> }>;
  controlLog: Array<{ at: string; by: string | null; command: Record<string, unknown> }>;
  events: Array<{ at: string; kind: string; title: string; body: string }>;
  auditLog: Array<{ at: string; actor: string; action: string; detail: Record<string, unknown>; note: string }>;
  summary: Record<string, unknown>;
}

/**
 * Builds the report. Returns null when the device does not exist.
 *
 * The caller is responsible for authorisation — this does not check ownership,
 * because the two callers check different things (an owner check on the user
 * route, an admin role on the operator route) and burying either here would
 * make it easy to add a third caller that checks neither.
 */
export async function buildDeviceReport(
  deviceId: string,
  audience: ReportAudience,
  opts: ReportOptions = {}
): Promise<DeviceReport | null> {
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 100));

  const { rows } = await pool.query<DeviceRow>(DEVICE_SELECT, [deviceId]);
  const d = rows[0];
  if (!d) return null;

  // Fetched in parallel — a report is four independent history queries and
  // running them in series made the page visibly slow on a chatty device.
  const [telemetry, commands, events, audit, counts] = await Promise.all([
    pool.query<{ ts: Date; payload: Record<string, unknown> }>(
      `SELECT ts, payload FROM telemetry WHERE device_id = $1 ORDER BY ts DESC LIMIT $2`,
      [deviceId, limit]
    ),
    pool.query<{ ts: Date; payload: Record<string, unknown>; email: string | null }>(
      `SELECT c.ts, c.payload, u.email
         FROM commands c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.device_id = $1 ORDER BY c.ts DESC LIMIT $2`,
      [deviceId, limit]
    ),
    pool.query<{ ts: Date; kind: string; title: string; body: string }>(
      `SELECT ts, kind, title, body FROM events WHERE device_id = $1 ORDER BY ts DESC LIMIT $2`,
      [deviceId, limit]
    ),
    // The audit trail is operator activity. An owner has no business seeing
    // which member of staff touched their unit, so it is not even queried.
    audience === "admin"
      ? pool.query<{ ts: Date; actor_email: string; action: string; detail: Record<string, unknown>; note: string }>(
          `SELECT ts, actor_email, action, detail, note FROM device_audit
            WHERE device_id = $1 ORDER BY ts DESC LIMIT $2`,
          [deviceId, limit]
        )
      : Promise.resolve({ rows: [] as never[] }),
    pool.query<{ telemetry_total: string; command_total: string; first_seen: Date | null }>(
      `SELECT (SELECT COUNT(*)::text FROM telemetry WHERE device_id = $1) AS telemetry_total,
              (SELECT COUNT(*)::text FROM commands  WHERE device_id = $1) AS command_total,
              (SELECT MIN(ts)        FROM telemetry WHERE device_id = $1) AS first_seen`,
      [deviceId]
    ),
  ]);

  const c = counts.rows[0];
  const isAdmin = audience === "admin";

  return {
    generatedAt: new Date().toISOString(),
    audience,
    identity: {
      id: d.id,
      serial: d.serial,
      name: d.name,
      type: d.type,
      room: d.room || null,
      firmware: d.fw_version || null,
      registeredAt: iso(d.created_at),
      // The chip id and factory batch are manufacturing facts. They mean
      // nothing to an owner and identify a production run to anyone else.
      ...(isAdmin ? { hwid: d.hwid || null, batch: d.batch || null, notes: d.notes || null } : {}),
    },
    ownership: isAdmin
      ? {
          ownerId: d.owner_id ? Number(d.owner_id) : null,
          ownerEmail: d.owner_email,
          ownerName: d.owner_name,
          claimed: !!d.owner_id,
        }
      : { claimed: !!d.owner_id },
    /**
     * Never contains the key. It cannot: only a bcrypt hash is stored, so
     * there is nothing to return even to an admin. What is here is everything
     * that can honestly be said about the credential — when it was issued,
     * whether it has been replaced, and how to get a new one.
     */
    credentials: {
      issuedAt: iso(d.key_issued_at),
      lastRotatedAt: iso(d.key_rotated_at),
      rotations: d.key_rotations,
      recoverable: false,
      note: "The device key is stored only as a bcrypt hash and cannot be displayed or recovered. If it has been lost, reissue it — the device must then be re-flashed or re-claimed with the new key.",
    },
    connectivity: {
      online: d.online,
      lastSeen: iso(d.last_seen),
      firstTelemetryAt: iso(c?.first_seen ?? null),
      telemetryRecords: Number(c?.telemetry_total ?? 0),
      commandsIssued: Number(c?.command_total ?? 0),
    },
    state: d.state ?? {},
    qr: {
      // Non-secret by construction — see labelQrPayload.
      label: labelQrPayload(d.serial ?? d.id, d.type),
      serialText: d.serial ?? "",
      deviceId: d.id,
    },
    telemetry: telemetry.rows.map((r) => ({ at: r.ts.toISOString(), data: r.payload })),
    controlLog: commands.rows.map((r) => ({
      at: r.ts.toISOString(),
      // Who issued a command is shown to an operator by address; an owner sees
      // only that it was them, since every command on their device is theirs.
      by: isAdmin ? r.email : r.email ? "you" : null,
      command: r.payload,
    })),
    events: events.rows.map((r) => ({
      at: r.ts.toISOString(),
      kind: r.kind,
      title: r.title,
      body: r.body,
    })),
    auditLog: audit.rows.map((r) => ({
      at: r.ts.toISOString(),
      actor: r.actor_email || "system",
      action: r.action,
      detail: r.detail ?? {},
      note: r.note,
    })),
    summary: {
      historyLimit: limit,
      telemetryReturned: telemetry.rows.length,
      commandsReturned: commands.rows.length,
      eventsReturned: events.rows.length,
      auditReturned: audit.rows.length,
      // Says plainly that the lists are a window, not the whole history, so a
      // reader does not conclude a device only ever sent 100 samples.
      truncated:
        telemetry.rows.length >= limit ||
        commands.rows.length >= limit ||
        events.rows.length >= limit,
    },
  };
}

/** Flattens a report section into CSV, for the export button. */
export function reportToCsv(report: DeviceReport): string {
  const esc = (v: unknown): string => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  const section = (title: string, headers: string[], rows: unknown[][]) => {
    lines.push(`# ${title}`);
    lines.push(headers.join(","));
    for (const r of rows) lines.push(r.map(esc).join(","));
    lines.push("");
  };

  section(
    "Identity",
    ["field", "value"],
    Object.entries(report.identity).map(([k, v]) => [k, v])
  );
  section(
    "Connectivity",
    ["field", "value"],
    Object.entries(report.connectivity).map(([k, v]) => [k, v])
  );
  section(
    "Current state",
    ["field", "value"],
    Object.entries(report.state).map(([k, v]) => [k, v])
  );
  section(
    "Control log",
    ["at", "by", "command"],
    report.controlLog.map((r) => [r.at, r.by, r.command])
  );
  section(
    "Events",
    ["at", "kind", "title", "body"],
    report.events.map((r) => [r.at, r.kind, r.title, r.body])
  );
  section(
    "Telemetry",
    ["at", "data"],
    report.telemetry.map((r) => [r.at, r.data])
  );
  if (report.auditLog.length) {
    section(
      "Administrative audit",
      ["at", "actor", "action", "detail", "note"],
      report.auditLog.map((r) => [r.at, r.actor, r.action, r.detail, r.note])
    );
  }
  return lines.join("\n");
}
