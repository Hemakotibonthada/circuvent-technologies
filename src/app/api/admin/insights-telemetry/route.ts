import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { clearTelemetry, insightsView, metricsView } from "@/lib/telemetry-store";
import { METRICS, SPLITS, type MetricId, type SplitBy } from "@/lib/app-insights";
import { deploymentsIn, recordCurrentBuild } from "@/lib/deployments";

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

  /*
   * ?metric= switches this route into explorer mode. One route rather than two
   * so both answers come from one guard and one clamp of `hours`.
   */
  /* Records the running build on any admin read, not only on the sweep: the
     annotation should exist even where no scheduler is configured. */
  recordCurrentBuild();

  const metric = url.searchParams.get("metric");
  if (metric) {
    if (!METRICS.some((m) => m.id === metric)) {
      return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
    }
    const splitParam = url.searchParams.get("splitBy") ?? "none";
    if (!SPLITS.some((s) => s.id === splitParam)) {
      return NextResponse.json({ error: "Unknown split" }, { status: 400 });
    }
    const bucketRaw = Number(url.searchParams.get("bucketMinutes"));
    return NextResponse.json({
      success: true,
      metric,
      splitBy: splitParam,
      hours,
      /* Release markers for the chart. "Did this start when we deployed?" is
         the first question anybody asks of a graph that turned a corner. */
      deployments: deploymentsIn(
        new Date(Date.now() - hours * 3_600_000).toISOString(),
        new Date().toISOString()
      ),
      ...metricsView({
        metric: metric as MetricId,
        splitBy: splitParam as SplitBy,
        hours,
        // A one-minute bucket over a week is 10,080 points nobody can read and
        // a response nobody wants; let the window pick unless asked sanely.
        bucketMinutes: Number.isFinite(bucketRaw) && bucketRaw >= 1 && bucketRaw <= 1440 ? Math.round(bucketRaw) : undefined,
        topN: Math.min(12, Math.max(1, Math.round(Number(url.searchParams.get("topN")) || 6))),
      }),
    });
  }

  return NextResponse.json({ success: true, ...insightsView(hours) });
}

/** DELETE — drop the buffer. Useful after a load test has swamped the window. */
export async function DELETE(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  clearTelemetry();
  return NextResponse.json({ success: true });
}
