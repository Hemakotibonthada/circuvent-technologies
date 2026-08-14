import { NextResponse } from "next/server";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";
import { getCronRuns, revalidate } from "@/lib/store";
import { cronHealth, cronNeedsAttention } from "@/lib/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cron-health — are the scheduled jobs actually running?
 *
 * The four jobs in vercel.json are each authorised with CRON_SECRET and each
 * return 403 without it. That is correct, and it is also completely silent: the
 * scheduler calls, gets refused, and nothing records that the work did not
 * happen. On a deployment where CRON_SECRET was never set, all four have run
 * zero times and every other surface in the product looks fine.
 *
 * This is the surface that can say so. It reports "never run" separately from
 * "late" because the remedies differ, and it does not call a job healthy merely
 * because it was punctual — a sweep that runs nightly and skips every time is
 * exactly as useless as one that never runs.
 */
export async function GET(request: Request) {
  if (!requireArea(adminFromRequest(request), "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await revalidate(["cronRuns"]);
  const statuses = cronHealth(getCronRuns());

  return NextResponse.json({
    ok: true,
    needsAttention: cronNeedsAttention(statuses),
    jobs: statuses,
  });
}
