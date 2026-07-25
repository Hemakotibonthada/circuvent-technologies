import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { latencyReport, runProbes } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/latency?range=<hours> -> live probes + latency report
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const u = new URL(request.url);
  const hours = Math.min(720, Math.max(1, Number(u.searchParams.get("range")) || 24));
  const origin = u.origin;
  try {
    const [probes, report] = await Promise.all([
      runProbes(origin).catch(() => []),
      latencyReport(hours),
    ]);
    return NextResponse.json({ ok: true, probes, report, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Latency report failed" }, { status: 500 });
  }
}
