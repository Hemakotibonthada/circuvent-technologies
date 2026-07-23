import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  dashboard, valuation, lowStock, deadStock, abcAnalysis,
  movementSummary, reorderSuggestions, expiringBatches,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?report=dashboard|valuation|lowstock|deadstock|abc|movement|reorder|expiring
export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const report = searchParams.get("report") || "dashboard";
  const days = Number(searchParams.get("days")) || undefined;
  switch (report) {
    case "valuation": return NextResponse.json({ valuation: valuation() });
    case "lowstock": return NextResponse.json({ rows: lowStock() });
    case "deadstock": return NextResponse.json({ rows: deadStock(days) });
    case "abc": return NextResponse.json({ rows: abcAnalysis() });
    case "movement": return NextResponse.json({ summary: movementSummary(days || 30) });
    case "reorder": return NextResponse.json({ rows: reorderSuggestions() });
    case "expiring": return NextResponse.json({ batches: expiringBatches(days) });
    default: return NextResponse.json({ dashboard: dashboard() });
  }
}
