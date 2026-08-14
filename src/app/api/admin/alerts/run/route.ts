import { NextResponse } from "next/server";
import { adminFromRequest, requireArea, DEFAULT_ADMIN_EMAIL } from "@/lib/admin-auth";
import { getAlertSettings, updateAlertSettings, revalidate, flushNow, recordCronRun } from "@/lib/store";
import { buildDigestHtml } from "@/lib/alerts";
import { sendMail } from "@/lib/order-core";
import { logger } from "@/lib/logger";

/** Must match the path in vercel.json — see src/lib/cron-health.ts. */
const CRON_PATH = "/api/admin/alerts/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authorized for either a signed-in admin or a Vercel Cron request carrying CRON_SECRET. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return requireArea(adminFromRequest(request), "settings");
}

// POST/GET /api/admin/alerts/run — evaluate alert rules and email a digest.
// GET is used by Vercel Cron (authorized via CRON_SECRET); POST by the admin UI.
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await revalidate(["orders", "returns", "tickets", "alertSettings"]);
  const settings = getAlertSettings();
  const digest = buildDigestHtml();
  if (!digest) {
    // Nothing to send is a healthy outcome for this job, not a skip: it ran,
    // it looked, and there was no news.
    recordCronRun(CRON_PATH, "ok", "No active alerts to send.");
    return NextResponse.json({ ok: true, sent: false, reason: "No active alerts to send." });
  }

  const to = settings.notifyEmail || DEFAULT_ADMIN_EMAIL;
  const ok = await sendMail(to, digest.subject, digest.html, undefined, { type: "alert", related: to });
  if (!ok) {
    logger.warn("alerts.digest.send_failed", { to });
    recordCronRun(CRON_PATH, "failed", "Email transport not configured or failed.");
    return NextResponse.json({ ok: false, sent: false, reason: "Email transport not configured or failed." }, { status: 502 });
  }
  updateAlertSettings({ lastDigestAt: new Date().toISOString() });
  recordCronRun(CRON_PATH, "ok");
  await flushNow();
  logger.info("alerts.digest.sent", { to, count: digest.count });
  return NextResponse.json({ ok: true, sent: true, to, count: digest.count });
}

export const GET = handle;
export const POST = handle;
