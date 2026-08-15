import { NextResponse } from "next/server";
import { analyseHome } from "@/lib/ai/analysis";
import { sweep, summarise, type Alert } from "@/lib/anomaly-monitor";
import { accountKey, readAlerts, writeAlerts } from "@/lib/alerts-store";
import { sendMail } from "@/lib/order-core";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/store";
import { fromV1DeviceList, fromV1EventList } from "@/lib/v1-shapes";
import type { Device, AppEvent } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL_PLANE_URL = (
  process.env.CONTROL_PLANE_URL ||
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
  "https://api.circuvent.com"
).replace(/\/$/, "");

/**
 * GET /api/smarthome/alerts/cron — sweep with nobody watching.
 *
 * The panel sweeps while somebody has the console open, which is exactly when
 * they least need telling. The case that matters is the hub that dies on a
 * Friday evening: without this, the first anybody hears of it is when they
 * next open a page.
 *
 * SCHEDULING. vercel.json runs this once a day, because Vercel's Hobby plan
 * permits nothing more frequent — a half-hourly schedule is not merely ignored
 * there, it fails the deployment outright, which is how four commits' worth of
 * fixes sat undeployed until somebody read the error. Daily is honest but it
 * is not monitoring: a device that dies an hour after the sweep goes
 * unreported for twenty-three of them.
 *
 * The better schedule does not need Vercel. This endpoint is a plain
 * authenticated GET, and the control-plane VM is already running continuously,
 * so a crontab entry there gives a real interval at no cost — every fifteen
 * minutes, calling this URL with the CRON_SECRET as a bearer token.
 *
 * Vercel Pro would also lift the limit. Either way the code is unchanged; only
 * how often something calls it differs.
 *
 * The honest difficulty is credentials. Every other path uses the signed-in
 * user's own console token, deliberately — the server never substitutes a
 * service account for a user. A cron has no user, so it needs a credential of
 * its own: CIRCUVENT_SWEEP_TOKEN, a control-plane developer key.
 *
 * When that is not configured this route says so, loudly, and returns 200. Not
 * because the situation is fine, but because a cron that reports failure every
 * night trains everyone to ignore it, and the thing being reported is a
 * deployment gap rather than an error. `configured: false` in the response and
 * a warning in the log are what should be alerted on.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends the secret as a bearer token. Without a configured
  // secret this endpoint would be an open trigger, so it stays shut.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const token = (process.env.CIRCUVENT_SWEEP_TOKEN || "").trim();
  if (!token) {
    logger.warn("smarthome.alerts_cron_unconfigured", {
      detail: "CIRCUVENT_SWEEP_TOKEN is not set, so unattended anomaly sweeps are not running.",
    });
    // Recorded as `skipped`, not `ok`. The schedule is working and the job is
    // not, and a green tick over an unset token is how this stays unset.
    recordCronRun(
      "/api/smarthome/alerts/cron",
      "skipped",
      "CIRCUVENT_SWEEP_TOKEN is not set, so no sweep was performed."
    );
    return NextResponse.json({
      ok: true,
      configured: false,
      swept: false,
      reason:
        "CIRCUVENT_SWEEP_TOKEN is not set. Create a control-plane developer key (Console → Settings → API keys) with the scopes devices:read, events:read and automations:read, and set it as CIRCUVENT_SWEEP_TOKEN to enable unattended sweeps.",
    });
  }

  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };

  /*
   * `/v1`, not the console routes.
   *
   * CIRCUVENT_SWEEP_TOKEN is a developer API key, and `/devices`, `/events` and
   * `/automations` are all requireAuth — a user JWT only. A key cannot call any
   * of them, so this sweep could never have run as documented: configure the
   * token exactly as instructed and every request comes back 401. The `/v1`
   * family is the half of the API that accepts keys, and it needs the scopes
   * devices:read, events:read and automations:read.
   *
   * The shapes differ between the two families, which is the quiet half of this
   * fix — see src/lib/v1-shapes.ts.
   */
  const devices = fromV1DeviceList(await get<unknown>("/v1/devices"));
  if (!devices) {
    // Do not sweep. An empty finding set here would resolve every open alert
    // and report a recovery that did not happen.
    logger.warn("smarthome.alerts_cron_unreachable", {});
    return NextResponse.json({ ok: false, configured: true, swept: false, reason: "Control plane unreachable." }, { status: 502 });
  }

  const [eventsPayload, automations] = await Promise.all([
    get<unknown>("/v1/events?limit=100"),
    get<{ automations: unknown[] }>("/v1/automations"),
  ]);
  const events = fromV1EventList(eventsPayload) ?? [];

  const analysis = analyseHome({
    devices,
    events,
    automations: (automations?.automations ?? []) as Parameters<typeof analyseHome>[0]["automations"],
  });

  const key = accountKey(token);
  const previous: Alert[] = readAlerts(key);
  const result = sweep(previous, analysis.findings, { sweepProducedFindings: true });
  writeAlerts(key, result.alerts);

  /*
   * Only email what the monitor says is worth interrupting somebody for. That
   * is the whole point of tracking state: `toNotify` already excludes alerts
   * that are merely still true, ones that have been acknowledged, and
   * anything informational, so a nightly cron cannot turn into a nightly
   * repeat of the same message.
   */
  let emailed = 0;
  const to = (process.env.ALERTS_NOTIFY_EMAIL || "").trim();
  if (to && result.toNotify.length) {
    const rows = result.toNotify
      .map(
        (a) =>
          `<tr><td style="padding:6px 10px"><strong>${a.severity.toUpperCase()}</strong></td><td style="padding:6px 10px">${a.title}</td><td style="padding:6px 10px">${a.detail}</td></tr>`
      )
      .join("");
    const html = `<p>${result.toNotify.length} device alert(s) need attention.</p><table style="border-collapse:collapse">${rows}</table>`;
    const sent = await sendMail(to, `Circuvent: ${result.toNotify.length} device alert(s)`, html, undefined, {
      type: "alert",
      related: to,
    });
    if (sent) emailed = result.toNotify.length;
    else logger.warn("smarthome.alerts_cron_email_failed", { to });
  }

  logger.info("smarthome.alerts_cron_swept", {
    opened: result.opened.length,
    resolved: result.resolved.length,
    escalated: result.escalated.length,
    notify: result.toNotify.length,
    emailed,
  });

  recordCronRun("/api/smarthome/alerts/cron", "ok");
  return NextResponse.json({
    ok: true,
    configured: true,
    swept: true,
    summary: summarise(result.alerts),
    opened: result.opened.length,
    resolved: result.resolved.length,
    escalated: result.escalated.length,
    emailed,
  });
}

export const GET = handle;
export const POST = handle;
