import { NextResponse } from "next/server";
import { analytics, listAudit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  const token = request.headers.get("x-admin-token");
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  return token === Buffer.from(`${pw}:${new Date().toDateString()}`).toString("base64");
}

/** GET /api/admin/analytics — commerce KPIs + recent audit log. */
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, stats: analytics(), audit: listAudit(30) });
}
