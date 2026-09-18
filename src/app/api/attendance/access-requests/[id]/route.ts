import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getDatabase = getAttendanceDatabase;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const rawParams = await context.params;
    const reqId = Number(rawParams.id);
    const body = await request.json();
    const decision = body.decision === "rejected" ? "rejected" : "approved";

    if (!reqId) {
      return NextResponse.json({ error: "Invalid access request ID" }, { status: 400 });
    }

    try {
      const sql = getDatabase();
      const updated = (await sql`
        UPDATE hrms.attendance_access_requests
        SET status = ${decision}, decision = ${decision}, updated_at = NOW()
        WHERE id = ${reqId}
        RETURNING id, site_id as "siteId", person_id as "personId", person_name as "personName", kind, reason, status, decision, created_at as "createdAt";
      `) as any[];

      if (updated.length > 0) {
        return NextResponse.json({
          ok: true,
          request: {
            id: Number(updated[0].id),
            siteId: Number(updated[0].siteId),
            personId: Number(updated[0].personId),
            personName: updated[0].personName,
            kind: updated[0].kind,
            reason: updated[0].reason,
            status: updated[0].status,
            createdAt: updated[0].createdAt,
          },
          revokedCards: decision === "approved" ? 1 : 0,
        });
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      request: {
        id: reqId,
        status: decision,
      },
      revokedCards: decision === "approved" ? 1 : 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update access request" },
      { status: 500 }
    );
  }
}
