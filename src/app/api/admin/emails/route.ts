import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listEmailHistory, countEmailHistory } from "@/lib/email-log";
import { checkMailHealth } from "@/lib/mail-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/emails?type=&status=&q=&limit=&offset= -> email evidence log
export async function GET(request: Request) {
  if (!guard(request, "settings")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const u = new URL(request.url);

  /*
   * ?health=1 — can this deployment deliver mail at all?
   *
   * Separate from the log because the log answers "what did we send" and this
   * answers "would anything we send arrive". A history of failures is the
   * symptom; this names the cause. It opens a connection and completes the
   * SASL handshake, so it is deliberately not part of the default response.
   */
  if (u.searchParams.get("health")) {
    return NextResponse.json({ ok: true, health: await checkMailHealth() });
  }

  const type = u.searchParams.get("type") || "all";
  const status = u.searchParams.get("status") || "all";
  const q = u.searchParams.get("q") || "";
  const limit = Math.min(500, Math.max(1, Number(u.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  try {
    const [rows, counts] = await Promise.all([
      listEmailHistory({ type, status, q, limit, offset }),
      countEmailHistory({ type, status, q }),
    ]);
    return NextResponse.json({ ok: true, rows, counts, limit, offset });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load email history", rows: [], counts: { total: 0, sent: 0, failed: 0 } }, { status: 500 });
  }
}
