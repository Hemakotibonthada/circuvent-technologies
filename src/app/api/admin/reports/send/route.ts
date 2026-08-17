import { NextResponse } from "next/server";
import { adminFromRequest, requireArea, DEFAULT_ADMIN_EMAIL } from "@/lib/admin-auth";
import { getAlertSettings, updateAlertSettings, revalidate, flushNow, recordCronRun } from "@/lib/store";
import { buildReportHtml } from "@/lib/alerts";
import { keepKnownGroups, listDirectoryGroups, reportRecipients } from "@/lib/identity-groups";
import { sendMail } from "@/lib/order-core";
import { logger } from "@/lib/logger";

/** Must match the path in vercel.json — see src/lib/cron-health.ts. */
const CRON_PATH = "/api/admin/reports/send";

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
  let groupsParam: string[] | undefined;
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.days) daysParam = Number(body.days);
    // Only an interactive send may choose recipients. Cron uses what was
    // saved, so a scheduled report cannot be redirected by a crafted request.
    if (isAdmin && Array.isArray(body.groups)) groupsParam = body.groups.map(String);
  } else {
    const q = new URL(request.url).searchParams.get("days");
    if (q) daysParam = Number(q);
  }

  await revalidate(["orders", "alertSettings"]);
  const settings = getAlertSettings();

  // Cron only sends when the daily report is enabled; an admin can force it.
  if (!isAdmin && !settings.dailyReport) {
    // Disabled on purpose is a healthy outcome: the schedule is working and
    // being told not to send is the configured behaviour, not a fault.
    recordCronRun(CRON_PATH, "ok", "Daily report is disabled in settings.");
    return NextResponse.json({ ok: true, sent: false, reason: "Daily report disabled." });
  }

  const days = Math.max(7, Math.min(365, daysParam || settings.reportRangeDays || 30));
  const report = buildReportHtml(days);

  /*
   * Group addresses are checked against the directory rather than trusted.
   * Whatever arrives here — a stale tab, or a direct post — can only result in
   * mail to a group that really exists, so this endpoint cannot be turned into
   * a way to send the company's revenue figures to an arbitrary address.
   */
  const requested = groupsParam ?? settings.reportGroups ?? [];
  let groups: string[] = [];
  let rejected: string[] = [];
  if (requested.length) {
    const known = await listDirectoryGroups();
    const checked = keepKnownGroups(requested, known);
    groups = checked.accepted;
    rejected = checked.rejected;
    if (rejected.length) logger.warn("reports.unknown_groups", { rejected });
  }

  const individual = settings.notifyEmail || DEFAULT_ADMIN_EMAIL;
  const recipients = reportRecipients(individual, groups);

  /*
   * Sent one message per recipient rather than one with several addresses, so
   * a group that bounces cannot take the others down with it and each delivery
   * is recorded against the address it went to.
   */
  const results = await Promise.all(
    recipients.map(async (to) => ({
      to,
      ok: await sendMail(to, report.subject, report.html, undefined, { type: "report", related: to }),
    }))
  );
  const delivered = results.filter((r) => r.ok).map((r) => r.to);
  const failed = results.filter((r) => !r.ok).map((r) => r.to);

  if (!delivered.length) {
    logger.warn("reports.send_failed", { to: recipients });
    recordCronRun(CRON_PATH, "failed", "Email transport not configured or failed.");
    return NextResponse.json({ ok: false, sent: false, reason: "Email transport not configured or failed." }, { status: 502 });
  }

  updateAlertSettings({ lastReportAt: new Date().toISOString() });
  // A partial delivery is still a run that happened; the addresses that failed
  // are named rather than folded into a single "ok".
  recordCronRun(CRON_PATH, failed.length ? "failed" : "ok", failed.length ? `No mail to: ${failed.join(", ")}` : undefined);
  await flushNow();
  logger.info("reports.sent", { to: delivered, failed, days });
  return NextResponse.json({
    ok: true,
    sent: true,
    to: delivered,
    failed,
    rejected,
    groups,
    days,
  });
}

export const GET = handle;
export const POST = handle;
