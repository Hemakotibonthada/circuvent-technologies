import { NextResponse } from "next/server";
import { adminFromRequest, requireArea, DEFAULT_ADMIN_EMAIL } from "@/lib/admin-auth";
import { getAlertSettings, updateAlertSettings, revalidate, flushNow } from "@/lib/store";
import { buildReportHtml } from "@/lib/alerts";
import { sendMail } from "@/lib/order-core";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return requireArea(adminFromRequest(request), "analytics");
}

/**
 * /api/admin/reports/send — email a performance report.
 * GET is used by Vercel Cron (respects the dailyReport toggle); POST by the
 * admin UI, which can force-send and override the range.
 */
async function handle(request: Request) {
  // The report contains revenue figures, so a staff account may only force-send
  // it if their role covers analytics. Cron keeps its own secret-based path.
  const isAdmin = requireArea(adminFromRequest(request), "analytics");
  if (!authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let daysParam: number | undefined;
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.days) daysParam = Number(body.days);
  } else {
    const q = new URL(request.url).searchParams.get("days");
    if (q) daysParam = Number(q);
  }

  await revalidate(["orders", "alertSettings"]);
  const settings = getAlertSettings();

  // Cron only sends when the daily report is enabled; an admin can force it.
  if (!isAdmin && !settings.dailyReport) {
    return NextResponse.json({ ok: true, sent: false, reason: "Daily report disabled." });
  }

  const days = Math.max(7, Math.min(365, daysParam || settings.reportRangeDays || 30));
  const report = buildReportHtml(days);
  const to = settings.notifyEmail || DEFAULT_ADMIN_EMAIL;

  const ok = await sendMail(to, report.subject, report.html, undefined, { type: "report", related: to });
  if (!ok) {
    logger.warn("reports.send_failed", { to });
    return NextResponse.json({ ok: false, sent: false, reason: "Email transport not configured or failed." }, { status: 502 });
  }
  updateAlertSettings({ lastReportAt: new Date().toISOString() });
  await flushNow();
  logger.info("reports.sent", { to, days });
  return NextResponse.json({ ok: true, sent: true, to, days });
}

export const GET = handle;
export const POST = handle;
