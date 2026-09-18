import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getDatabase = getAttendanceDatabase;

// In-memory fallback if database table is initializing
let inMemoryRequests: Array<{
  id: number;
  siteId: number;
  personId: number;
  personName: string;
  kind: string;
  reason: string;
  status: string;
  decision?: string;
  createdAt: string;
}> = [];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = Number(searchParams.get("siteId")) || 6;
    const status = searchParams.get("status");
    const kind = searchParams.get("kind");

    try {
      const sql = getDatabase();
      const rows = (await sql`
        SELECT 
          id, 
          site_id as "siteId", 
          person_id as "personId", 
          person_name as "personName", 
          kind, 
          reason, 
          status, 
          decision, 
          created_at as "createdAt"
        FROM hrms.attendance_access_requests
        WHERE (${siteId}::int IS NULL OR site_id = ${siteId})
        ORDER BY created_at DESC;
      `) as any[];

      let list = rows.map((r) => ({
        id: Number(r.id),
        siteId: Number(r.siteId),
        personId: Number(r.personId),
        personName: r.personName || `Employee #${r.personId}`,
        kind: r.kind || "card-replacement",
        reason: r.reason || "Card reported lost",
        status: r.status || "pending",
        decision: r.decision,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));

      if (status) list = list.filter((r) => r.status === status);
      else list = list.filter((r) => r.status === "pending");
      if (kind) list = list.filter((r) => r.kind === kind);

      return NextResponse.json({
        ok: true,
        requests: list,
        pending: list.filter((r) => r.status === "pending").length,
      });
    } catch {
      // Fallback to in-memory store
      let list = inMemoryRequests.filter((r) => r.status === (status || "pending"));
      if (kind) list = list.filter((r) => r.kind === kind);
      return NextResponse.json({
        ok: true,
        requests: list,
        pending: list.length,
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load access requests", requests: [], pending: 0 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const siteId = Number(body.siteId) || 6;
    const personId = Number(body.personId);
    let personName = (body.personName || "").trim();
    const kind = (body.kind || "card-replacement").trim();
    const reason = (body.reason || "Card reported lost").trim();

    if (!personId) {
      return NextResponse.json({ error: "personId is required" }, { status: 400 });
    }

    try {
      const sql = getDatabase();

      // Look up personName if not provided
      if (!personName) {
        const emp = await sql`
          SELECT first_name, last_name, display_name 
          FROM hrms.employees 
          WHERE id::text = ${String(personId)} OR employee_code = ${`CV-00${personId}`} 
          LIMIT 1;
        `;
        if (emp.length > 0) {
          personName = emp[0].display_name || `${emp[0].first_name} ${emp[0].last_name}`.trim();
        }
      }

      if (!personName) personName = `Employee #${personId}`;

      const inserted = (await sql`
        INSERT INTO hrms.attendance_access_requests (site_id, person_id, person_name, kind, reason, status, created_at, updated_at)
        VALUES (${siteId}, ${personId}, ${personName}, ${kind}, ${reason}, 'pending', NOW(), NOW())
        RETURNING id, site_id as "siteId", person_id as "personId", person_name as "personName", kind, reason, status, created_at as "createdAt";
      `) as any[];

      const reqRecord = {
        id: Number(inserted[0].id),
        siteId: Number(inserted[0].siteId),
        personId: Number(inserted[0].personId),
        personName: inserted[0].personName,
        kind: inserted[0].kind,
        reason: inserted[0].reason,
        status: inserted[0].status,
        createdAt: inserted[0].createdAt ? new Date(inserted[0].createdAt).toISOString() : new Date().toISOString(),
      };

      inMemoryRequests.unshift(reqRecord);

      return NextResponse.json({
        ok: true,
        request: reqRecord,
      });
    } catch {
      const fallbackReq = {
        id: Date.now(),
        siteId,
        personId,
        personName: personName || `Employee #${personId}`,
        kind,
        reason,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      inMemoryRequests.unshift(fallbackReq);
      return NextResponse.json({
        ok: true,
        request: fallbackReq,
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create access request" },
      { status: 500 }
    );
  }
}
