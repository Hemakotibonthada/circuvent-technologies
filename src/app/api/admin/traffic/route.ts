import { NextRequest, NextResponse } from "next/server";
import { visitorTracker } from "@/lib/visitor-tracker";
import { guard } from "@/lib/admin-auth";

/**
 * GET /api/admin/traffic?days=30&bots=0
 *
 * The durable traffic report: views and unique visitors over time, top pages,
 * referrers and audience breakdown, plus the live presence layer.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!guard(request, "analytics")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const includeBots = url.searchParams.get("bots") === "1";

  try {
    const summary = await visitorTracker.summary(days, includeBots);
    return NextResponse.json({ days, includeBots, ...summary });
  } catch {
    return NextResponse.json({ error: "Could not build the traffic report." }, { status: 500 });
  }
}
