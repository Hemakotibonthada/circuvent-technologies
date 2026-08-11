import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { clearTelemetry, insightsView } from "@/lib/telemetry-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/insights-telemetry?hours=24 — everything the panel renders. */
export async function GET(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  /*
   * Clamped rather than trusted. The window drives a bucketed pass over the
   * whole buffer, so an unbounded value is a cheap way to make the admin API
   * do arbitrary work.
   */
  const hours = Math.min(168, Math.max(1, Math.round(Number(url.searchParams.get("hours")) || 24)));

  return NextResponse.json({ success: true, ...insightsView(hours) });
}

/** DELETE — drop the buffer. Useful after a load test has swamped the window. */
export async function DELETE(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  clearTelemetry();
  return NextResponse.json({ success: true });
}
