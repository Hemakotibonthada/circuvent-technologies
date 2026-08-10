/**
 * The daily flight report.
 *
 * Sent from `info@circuvent.com` through the indigenous Postfix server in
 * Mail.circuvent — the same SMTP path OTP and the gate report already use, so
 * there is one mail transport to keep working rather than three.
 *
 * WHY A FLIGHT REPORT IS NOT JUST A COUNT OF FLIGHTS
 *
 * The person who reads this is accountable for the aircraft, and the questions
 * they are accountable for are not "how many flights". They are: did anything
 * go wrong, is any pack due for retirement, and can I produce a log if I am
 * asked for one. So the report leads with exceptions — failsafes, fence
 * breaches, flights that ended in silence — and only then gives the totals.
 *
 * A report that opened with "7 flights, 2.3 hours" and buried a failsafe three
 * sections down would be read for a week and skimmed forever after.
 */

import { config } from "../config";
import { pool } from "../db";
import { logger } from "../logger";
import { sendMail } from "../mail";
import { claimTick } from "../automations";
import { getSettings, listBatteries } from "./settings";

/** Local midnight-to-midnight in IST, as absolute instants. */
function istDayBounds(now: Date): { from: Date; to: Date; label: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Yesterday in IST — the report covers a finished day, not a partial one.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const day = date.format(yesterday);
  /*
   * IST is UTC+5:30 with no daylight saving, ever. Hard-coding the offset is
   * therefore correct rather than a shortcut, and it avoids depending on the
   * host's tz database being current — a container with a stale zoneinfo would
   * otherwise silently shift the reporting window.
   */
  const from = new Date(`${day}T00:00:00+05:30`);
  const to = new Date(`${day}T23:59:59.999+05:30`);
  return { from, to, label: day };
}

export interface FlightReportData {
  day: string;
  flights: number;
  airborneSec: number;
  distanceM: number;
  maxAltM: number;
  aircraft: { deviceId: string; name: string | null; flights: number; airborneSec: number }[];
  incidents: { at: string; deviceId: string; kind: string; detail: string }[];
  stale: number;
  /** Packs at or past their retirement cycle count. */
  retire: { label: string; cycles: number; retireAt: number }[];
  ageing: { label: string; cycles: number; retireAt: number }[];
  operatorId: string | null;
}

function hhmm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export async function buildReport(ownerId: number, now = new Date()): Promise<FlightReportData> {
  const { from, to, label } = istDayBounds(now);
  const settings = await getSettings(ownerId);

  const [totals, perAircraft, incidents, batteries] = await Promise.all([
    pool.query<{ n: string; airborne: string; dist: string; alt: string; stale: string }>(
      `SELECT COUNT(*)::text AS n,
              COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(landed_at, ended_at) - took_off_at))), 0)::text AS airborne,
              COALESCE(SUM(distance_m), 0)::text AS dist,
              COALESCE(MAX(max_alt_m), 0)::text  AS alt,
              COUNT(*) FILTER (WHERE outcome = 'stale')::text AS stale
         FROM flights
        WHERE owner_id = $1 AND started_at >= $2 AND started_at <= $3`,
      [ownerId, from, to]
    ),
    pool.query<{ device_id: string; name: string | null; n: string; airborne: string }>(
      `SELECT f.device_id, d.name, COUNT(*)::text AS n,
              COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(f.landed_at, f.ended_at) - f.took_off_at))), 0)::text AS airborne
         FROM flights f LEFT JOIN devices d ON d.id = f.device_id
        WHERE f.owner_id = $1 AND f.started_at >= $2 AND f.started_at <= $3
        GROUP BY f.device_id, d.name ORDER BY COUNT(*) DESC`,
      [ownerId, from, to]
    ),
    pool.query<{ at: string; device_id: string; kind: string; detail: Record<string, unknown> }>(
      `SELECT at, device_id, kind, detail FROM flight_events
        WHERE owner_id = $1 AND at >= $2 AND at <= $3 AND severity IN ('warn','alert')
        ORDER BY at LIMIT 40`,
      [ownerId, from, to]
    ),
    listBatteries(ownerId),
  ]);

  const t = totals.rows[0];
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return {
    day: label,
    flights: Number(t?.n ?? 0),
    airborneSec: Math.round(Number(t?.airborne ?? 0)),
    distanceM: Math.round(Number(t?.dist ?? 0)),
    maxAltM: Math.round(Number(t?.alt ?? 0)),
    stale: Number(t?.stale ?? 0),
    aircraft: perAircraft.rows.map((r) => ({
      deviceId: r.device_id,
      name: r.name,
      flights: Number(r.n),
      airborneSec: Math.round(Number(r.airborne)),
    })),
    incidents: incidents.rows.map((r) => ({
      at: fmt.format(new Date(r.at)),
      deviceId: r.device_id,
      kind: r.kind,
      detail: describeIncident(r.kind, r.detail),
    })),
    retire: batteries.filter((b) => !b.retired && b.health === "retire")
      .map((b) => ({ label: b.label, cycles: b.cycles, retireAt: b.retireAt })),
    ageing: batteries.filter((b) => !b.retired && b.health === "ageing")
      .map((b) => ({ label: b.label, cycles: b.cycles, retireAt: b.retireAt })),
    operatorId: settings.operatorId,
  };
}

/** Plain English for an event kind, so the email needs no glossary. */
export function describeIncident(kind: string, detail: Record<string, unknown>): string {
  switch (kind) {
    case "failsafe":
      return `Autopilot failsafe${detail.mode ? ` — switched to ${String(detail.mode)}` : ""}`;
    case "fence-breach":
      return `Left the flight area${detail.dist ? ` (${Math.round(Number(detail.dist))} m from home)` : ""}`;
    case "low-battery":
      return `Battery reached ${detail.battPct ?? "?"}% while airborne`;
    case "telemetry-gap":
      return `Lost telemetry for ${detail.missedBatches ?? "?"} batches`;
    case "flight-stale":
      return "Flight ended without a landing being reported";
    default:
      return kind;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The email body.
 *
 * Table layout and inline styles throughout, because that is what survives
 * Outlook. No external images: a remote-image blocker would otherwise leave
 * the message looking broken by default.
 */
export function reportHtml(d: FlightReportData, fleetName: string): string {
  const row = (label: string, value: string, tone = "#0f172a") =>
    `<tr><td style="padding:6px 0;color:#475569;font-size:14px">${esc(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;font-weight:700;font-size:14px;color:${tone}">${esc(value)}</td></tr>`;

  const section = (title: string, inner: string) =>
    `<h3 style="margin:26px 0 10px;font-size:15px;color:#0f172a">${esc(title)}</h3>${inner}`;

  const list = (items: string[]) =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${items.join("")}</table>`;

  const quiet = d.flights === 0
    ? `<p style="margin:12px 0 0;font-size:14px;color:#475569">No flights were recorded.</p>`
    : "";

  /*
   * Exceptions first, and visually distinct. Anything that went wrong has to
   * be readable in the preview pane without opening the message, because the
   * days this report matters are the days nobody opens it.
   */
  const banner = d.incidents.length || d.stale
    ? `<div style="margin:18px 0 0;padding:14px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
         <div style="font-weight:700;color:#991b1b;font-size:14px">
           ${d.incidents.length} event${d.incidents.length === 1 ? "" : "s"} need review${
             d.stale ? ` &middot; ${d.stale} flight${d.stale === 1 ? "" : "s"} ended without a landing` : ""
           }
         </div>
       </div>`
    : d.flights
      ? `<div style="margin:18px 0 0;padding:14px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
           <div style="font-weight:700;color:#166534;font-size:14px">All flights completed normally</div>
         </div>`
      : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td>
    <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#0ea5e9;font-weight:700">Circuvent</div>
    <h1 style="margin:6px 0 2px;font-size:21px;color:#0f172a">Daily flight report</h1>
    <p style="margin:0;color:#64748b;font-size:14px">${esc(fleetName)} &middot; ${esc(d.day)}${
      d.operatorId ? ` &middot; Operator ${esc(d.operatorId)}` : ""
    }</p>

    ${banner}

    ${section("Activity", list([
      row("Flights", String(d.flights)),
      row("Airborne", hhmm(d.airborneSec)),
      row("Distance flown", d.distanceM >= 1000 ? `${(d.distanceM / 1000).toFixed(2)} km` : `${d.distanceM} m`),
      row("Highest altitude", `${d.maxAltM} m`),
    ]))}
    ${quiet}

    ${d.aircraft.length > 1 ? section("By aircraft", list(d.aircraft.map((a) =>
      row(a.name || a.deviceId, `${a.flights} flight${a.flights === 1 ? "" : "s"} · ${hhmm(a.airborneSec)}`)))) : ""}

    ${d.incidents.length ? section("Events", list(d.incidents.map((i) =>
      row(`${i.at} · ${i.deviceId}`, i.detail, "#b91c1c")))) : ""}

    ${d.retire.length ? section("Batteries due for retirement", list(d.retire.map((b) =>
      row(b.label, `${b.cycles} of ${b.retireAt} cycles`, "#b91c1c")))) : ""}

    ${d.ageing.length ? section("Batteries ageing", list(d.ageing.map((b) =>
      row(b.label, `${b.cycles} of ${b.retireAt} cycles`, "#b45309")))) : ""}

    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
      Sent by your Circuvent control plane. Change the recipient, the delivery time, or turn this off
      under Drone &rsaquo; Safety in the console.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Sends the report for one account. Returns false when there is nothing to do.
 *
 * Exported so the console's "send a test report" button runs exactly the code
 * the scheduler runs — a preview built by a second path would prove nothing
 * about the mail that actually arrives at 07:00.
 */
export async function sendReport(
  ownerId: number,
  fleetName: string,
  now = new Date()
): Promise<boolean> {
  const settings = await getSettings(ownerId);
  if (!settings.reportEmail) return false;
  const data = await buildReport(ownerId, now);
  return sendMail(
    settings.reportEmail,
    `Flight report — ${data.day}`,
    reportHtml(data, fleetName),
    config.REPORT_FROM
  );
}

interface DueRow {
  owner_id: string;
  report_email: string;
  name: string | null;
  email: string;
}

/**
 * Sends every report that is due this hour.
 *
 * Idempotency rides `scheduler_ticks`, the same table the automation scheduler
 * uses, keyed by owner and IST date. That makes it exactly-once across
 * replicas *and* across restarts — a process that crashes after sending would
 * otherwise send again on boot, and a duplicate report every morning is how a
 * report becomes something people filter away unread.
 *
 * The key is namespaced `drone-report:` rather than sharing the gate report's
 * `report:` prefix: an account that runs both a gate and a drone fleet must
 * get both emails, and a shared key would silently deliver whichever swept
 * first and drop the other.
 */
export async function sweepDailyDroneReports(now = new Date()): Promise<number> {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now)
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);

  let sent = 0;
  try {
    const { rows } = await pool.query<DueRow>(
      `SELECT s.owner_id, s.report_email, u.name, u.email
         FROM drone_settings s JOIN users u ON u.id = s.owner_id
        WHERE s.report_email IS NOT NULL AND s.report_email <> '' AND s.report_hour = $1`,
      [hour]
    );
    for (const r of rows) {
      if (!(await claimTick(`drone-report:${r.owner_id}:${today}`))) continue;
      try {
        const ok = await sendReport(Number(r.owner_id), r.name || r.email, now);
        if (ok) sent++;
      } catch (err) {
        logger.error({ err, ownerId: r.owner_id }, "daily flight report send failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "daily flight report sweep failed");
  }
  return sent;
}
