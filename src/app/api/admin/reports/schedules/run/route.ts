import { NextResponse } from "next/server";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";
import { runDueSchedules } from "@/lib/reports-schedule";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/reports/schedules/run — send every schedule whose cadence has
// elapsed. Intended for a Vercel Cron hit (Authorization: Bearer CRON_SECRET);
// an analytics admin may also trigger it manually to flush due schedules.
//
// Add to vercel.json crons to run daily, e.g.:
//   { "path": "/api/admin/reports/schedules/run", "schedule": "0 3 * * *" }
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return requireArea(adminFromRequest(request), "analytics");
}

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const summary = await runDueSchedules();
  logger.info("reports.schedules_run", { ran: summary.ran, sent: summary.sent, failed: summary.failed });
  return NextResponse.json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
