import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { computeForecast } from "@/lib/admin-forecasting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "forecasting")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const days = Math.max(7, Math.min(180, Number(searchParams.get("days")) || 30));
  const targetCoverDays = Math.max(7, Math.min(180, Number(searchParams.get("cover")) || 45));
  return NextResponse.json({ success: true, forecast: computeForecast(days, targetCoverDays) });
}
