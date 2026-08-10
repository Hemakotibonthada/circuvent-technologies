import { config } from "../config";
import { pool } from "../db";
import { logger } from "../logger";
import { sendMail } from "../mail";
import { claimTick } from "../automations";
import { prettyPlate } from "./plate";
import { getSettings, occupancy } from "./site";

/**
 * The daily gate report.
 *
 * Sent from `info@circuvent.com` through the indigenous Postfix server in
 * Mail.circuvent — the same SMTP path OTP already uses, so there is one mail
 * transport to keep working rather than two.
 *
 * WHY IT GOES TO A CONFIGURED ADDRESS AND NOT THE ACCOUNT HOLDER
 *
 * The person who should read a gate report is usually not the person who owns
 * the account: a facilities inbox, a security desk, a building manager. Sending
 * to the login address with no way to change it would make the feature useless
 * to exactly the sites that most want it. `anpr_settings.report_email` holds
 * the recipient, and no address means no report.
 */

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

export interface ReportData {
  day: string;
  total: number;
  recognised: number;
  entries: number;
  exits: number;
  unique: number;
  denied: number;
  watched: number;
  unreadable: number;
  insideNow: number;
  capacity: number | null;
  busiestHour: number | null;
  overstays: { plate: string; hours: number }[];
  blocked: { plate: string; at: string }[];
  frequent: { plate: string; count: number }[];
  recogniser: string;
}

/** Everything the email needs, in one pass per table. */
export async function buildReport(ownerId: number, now = new Date()): Promise<ReportData> {
  const { from, to, label } = istDayBounds(now);

  const [totals, hours, frequent, blocked, occ, settings] = await Promise.all([
    pool.query<{
      total: string; recognised: string; entries: string; exits: string;
      unique: string; denied: string; watched: string;
    }>(
      `SELECT COUNT(*)::text                                          AS total,
              COUNT(*) FILTER (WHERE status = 'recognised')::text     AS recognised,
              COUNT(*) FILTER (WHERE direction = 'in')::text          AS entries,
              COUNT(*) FILTER (WHERE direction = 'out')::text         AS exits,
              COUNT(DISTINCT plate) FILTER (WHERE plate <> '')::text  AS unique,
              COUNT(*) FILTER (WHERE decision = 'deny')::text         AS denied,
              COUNT(*) FILTER (WHERE decision = 'watch')::text        AS watched
         FROM plate_reads
        WHERE owner_id = $1 AND ts >= $2 AND ts <= $3`,
      [ownerId, from, to]
    ),
    pool.query<{ hour: number; n: string }>(
      `SELECT EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*)::text AS n
         FROM plate_reads WHERE owner_id = $1 AND ts >= $2 AND ts <= $3
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1`,
      [ownerId, from, to]
    ),
    pool.query<{ plate: string; n: string }>(
      `SELECT plate, COUNT(*)::text AS n FROM plate_reads
        WHERE owner_id = $1 AND plate <> '' AND ts >= $2 AND ts <= $3
        GROUP BY plate ORDER BY COUNT(*) DESC, plate LIMIT 5`,
      [ownerId, from, to]
    ),
    pool.query<{ plate: string; ts: Date }>(
      `SELECT plate, ts FROM plate_reads
        WHERE owner_id = $1 AND decision = 'deny' AND ts >= $2 AND ts <= $3
        ORDER BY ts DESC LIMIT 20`,
      [ownerId, from, to]
    ),
    occupancy(ownerId),
    getSettings(ownerId),
  ]);

  const t = totals.rows[0];
  const total = Number(t?.total ?? 0);
  const recognised = Number(t?.recognised ?? 0);

  // Overstays are current state, not yesterday's — "still here this morning" is
  // the actionable fact, and a vehicle that overstayed and then left overnight
  // is not something anyone needs to chase.
  let overstays: { plate: string; hours: number }[] = [];
  if (settings.overstayHours != null) {
    const { rows } = await pool.query<{ plate: string; hours: string }>(
      `SELECT plate, EXTRACT(EPOCH FROM (now() - entry_at)) / 3600 AS hours
         FROM plate_visits
        WHERE owner_id = $1 AND status = 'open' AND entry_at IS NOT NULL
          AND entry_at < now() - ($2 || ' hours')::interval
        ORDER BY entry_at LIMIT 20`,
      [ownerId, settings.overstayHours]
    );
    overstays = rows.map((r) => ({ plate: r.plate, hours: Math.floor(Number(r.hours)) }));
  }

  return {
    day: label,
    total,
    recognised,
    entries: Number(t?.entries ?? 0),
    exits: Number(t?.exits ?? 0),
    unique: Number(t?.unique ?? 0),
    denied: Number(t?.denied ?? 0),
    watched: Number(t?.watched ?? 0),
    unreadable: total - recognised,
    insideNow: occ.inside,
    capacity: occ.capacity,
    busiestHour: hours.rows[0] ? hours.rows[0].hour : null,
    overstays,
    blocked: blocked.rows.map((r) => ({
      plate: r.plate,
      at: new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(r.ts),
    })),
    frequent: frequent.rows.map((r) => ({ plate: r.plate, count: Number(r.n) })),
    recogniser: config.ANPR_PROVIDER,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The email body.
 *
 * Table layout and inline styles throughout, because that is what survives
 * Outlook, and a report nobody can read in their actual mail client is not a
 * report. No external images: a remote-image blocker would otherwise leave the
 * message looking broken by default.
 */
export function reportHtml(d: ReportData, siteName: string): string {
  const pretty = (p: string) => esc(prettyPlate(p));
  const row = (label: string, value: string, tone = "#0f172a") =>
    `<tr><td style="padding:6px 0;color:#475569;font-size:14px">${esc(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;font-weight:700;font-size:14px;color:${tone}">${esc(value)}</td></tr>`;

  const section = (title: string, inner: string) =>
    `<h3 style="margin:26px 0 10px;font-size:15px;color:#0f172a">${esc(title)}</h3>${inner}`;

  const list = (items: string[]) =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${items.join("")}</table>`;

  const readRate = d.total ? Math.round((d.recognised / d.total) * 100) : null;

  /*
   * A low read rate has two entirely different causes and the reader has to
   * know which. Saying "0%" without saying why sends a facilities manager up a
   * ladder to inspect a camera that is working exactly as configured.
   */
  const readNote =
    d.recogniser === "none"
      ? `<p style="margin:8px 0 0;font-size:13px;color:#b45309">No plate recogniser is configured, so vehicles were counted and photographed but no plates were read. This is a setting, not a camera fault.</p>`
      : readRate != null && readRate < 60 && d.total > 10
        ? `<p style="margin:8px 0 0;font-size:13px;color:#b45309">Fewer than 6 in 10 plates were read. Usually the camera is too far from where vehicles stop, aimed too high, or the watched lane covers more than the road.</p>`
        : "";

  const quiet = d.total === 0
    ? `<p style="margin:12px 0 0;font-size:14px;color:#475569">No vehicles were recorded. If that is unexpected, check the camera is online and armed.</p>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td>
    <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#0ea5e9;font-weight:700">Circuvent</div>
    <h1 style="margin:6px 0 2px;font-size:21px;color:#0f172a">Daily gate report</h1>
    <p style="margin:0;color:#64748b;font-size:14px">${esc(siteName)} &middot; ${esc(d.day)}</p>

    ${section("Traffic", list([
      row("Vehicles seen", String(d.total)),
      row("Arrived", String(d.entries)),
      row("Left", String(d.exits)),
      row("Distinct vehicles", String(d.unique)),
      row("Plates read", readRate == null ? "—" : `${d.recognised} of ${d.total} (${readRate}%)`),
      d.busiestHour != null ? row("Busiest hour", `${String(d.busiestHour).padStart(2, "0")}:00`) : "",
    ].filter(Boolean)))}
    ${readNote}${quiet}

    ${section("Right now", list([
      row("On the property", d.capacity == null ? String(d.insideNow) : `${d.insideNow} of ${d.capacity}`),
      d.overstays.length ? row("Overdue vehicles", String(d.overstays.length), "#b45309") : "",
    ].filter(Boolean)))}

    ${d.overstays.length ? list(d.overstays.map((o) =>
      row(pretty(o.plate), `${o.hours}h on site`, "#b45309"))) : ""}

    ${d.denied ? section("Blocked vehicles", list(d.blocked.map((b) =>
      row(pretty(b.plate), `turned away at ${b.at}`, "#b91c1c")))) : ""}

    ${d.frequent.length ? section("Most frequent", list(d.frequent.map((f) =>
      row(pretty(f.plate), `${f.count} pass${f.count === 1 ? "" : "es"}`)))) : ""}

    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
      Sent by your Circuvent control plane. Change the recipient, the delivery time, or turn this off
      under Security &rsaquo; Vehicles &rsaquo; Site in the console.
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
export async function sendReport(ownerId: number, siteName: string, now = new Date()): Promise<boolean> {
  const settings = await getSettings(ownerId);
  if (!settings.reportEmail) return false;
  const data = await buildReport(ownerId, now);
  return sendMail(
    settings.reportEmail,
    `Gate report — ${data.day}`,
    reportHtml(data, siteName),
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
 * Sends every account's report that is due this hour.
 *
 * Claimed through the same `scheduler_ticks` table the automation scheduler
 * uses, keyed by owner and IST date. That makes it exactly-once across
 * replicas *and* across restarts — a process that crashes after sending would
 * otherwise send again on boot, and a duplicate report every morning is how a
 * report becomes something people filter away unread.
 */
export async function sweepDailyReports(now = new Date()): Promise<number> {
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
         FROM anpr_settings s
         JOIN users u ON u.id = s.owner_id
        WHERE s.report_email IS NOT NULL AND s.report_email <> '' AND s.report_hour = $1`,
      [hour]
    );

    for (const r of rows) {
      // One claim per owner per IST day.
      if (!(await claimTick(`report:${r.owner_id}:${today}`))) continue;
      try {
        const ok = await sendReport(Number(r.owner_id), r.name || r.email, now);
        if (ok) sent++;
      } catch (err) {
        logger.error({ err, ownerId: r.owner_id }, "daily report send failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "daily report sweep failed");
  }
  return sent;
}
