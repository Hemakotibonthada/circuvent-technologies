import { NextResponse } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { listAudit, revalidate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/audit — recent admin/audit trail entries (any active admin).
export async function GET(request: Request) {
  if (!adminFromRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidate(["audit"]);
  return NextResponse.json({ ok: true, entries: listAudit(150) });
}
