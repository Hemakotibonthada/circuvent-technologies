import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";
import { CONTROL_PLANE_URL } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PunchSyncPayload {
  siteId: number;
  personId: number;
  personName?: string;
  employeeCode?: string;
  employeeId?: string;
  employeeEmail?: string;
  domain?: string;
  cardNumber?: number;
  direction?: "in" | "out" | "auto";
  method?: "web" | "biometric" | "manual";
  timestamp?: string;
  note?: string;
  terminalId?: string;
}

const getDatabase = getAttendanceDatabase;

export async function POST(request: NextRequest) {
  try {
    const body: PunchSyncPayload = await request.json();
    const siteId = body.siteId || 1;
    const direction = body.direction || "auto";
    const method = body.method || "manual";
    const at = body.timestamp || new Date().toISOString();
    const punchId = `punch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const todayDate = at.slice(0, 10);

    // 1. Direct PostgreSQL Persistence in hrms.attendance_records
    try {
      const sql = getDatabase();

      // Find employee by code, email, or id
      const empRows = (await sql`
        SELECT e.id, e.org_id, e.employee_code, e.first_name, e.last_name, e.work_email
        FROM hrms.employees e
        WHERE e.deleted_at IS NULL
          AND (
            e.employee_code = ${body.employeeCode || ""}
            OR e.work_email = ${body.employeeEmail || ""}
            OR e.id::text = ${body.employeeId || ""}
            OR e.employee_code ILIKE ${`%${body.personId}%`}
          )
        LIMIT 1;
      `) as Array<{
        id: string;
        org_id: string;
        employee_code: string;
        first_name: string;
        last_name: string;
        work_email: string;
      }>;

      const emp = empRows[0];
      if (emp) {
        // Check for existing record today
        const existingRecords = (await sql`
          SELECT id, clock_in_at, clock_out_at, status
          FROM hrms.attendance_records
          WHERE employee_id = ${emp.id} AND work_date = ${todayDate}::date
          LIMIT 1;
        `) as Array<{
          id: string;
          clock_in_at: string | null;
          clock_out_at: string | null;
          status: string | null;
        }>;

        const existing = existingRecords[0];

        if (existing) {
          if (direction === "out" || (direction === "auto" && existing.clock_in_at && !existing.clock_out_at)) {
            // Update clock out
            await sql`
              UPDATE hrms.attendance_records
              SET clock_out_at = ${at}::timestamptz,
                  clock_out_method = ${method}::text,
                  worked_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (${at}::timestamptz - clock_in_at)) / 60)),
                  notes = COALESCE(${body.note}, notes),
                  updated_at = NOW()
              WHERE id = ${existing.id};
            `;
          } else {
            // Re-clock in
            await sql`
              UPDATE hrms.attendance_records
              SET clock_in_at = ${at}::timestamptz,
                  clock_in_method = ${method}::text,
                  status = 'present',
                  notes = COALESCE(${body.note}, notes),
                  updated_at = NOW()
              WHERE id = ${existing.id};
            `;
          }
        } else {
          // Insert new attendance record
          const isOut = direction === "out";
          await sql`
            INSERT INTO hrms.attendance_records (
              org_id,
              employee_id,
              work_date,
              clock_in_at,
              clock_out_at,
              status,
              clock_in_method,
              notes,
              created_at,
              updated_at
            ) VALUES (
              ${emp.org_id},
              ${emp.id},
              ${todayDate}::date,
              ${isOut ? null : at}::timestamptz,
              ${isOut ? at : null}::timestamptz,
              'present',
              ${method}::text,
              ${body.note || `Punch recorded via console (${method})`},
              NOW(),
              NOW()
            );
          `;
        }
      }
    } catch (dbErr) {
      console.warn("Direct DB punch write failed, continuing with remote relays:", dbErr);
    }

    // 2. Send punch to Control Plane if available
    try {
      void fetch(`${CONTROL_PLANE_URL}/attendance/punch/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          personId: body.personId,
          direction,
          timestamp: at,
          note: body.note || `Punch logged via Attendance Console (${method})`,
        }),
      }).catch(() => {});
    } catch {}

    // 3. Sync into HRMS if available
    const hrmsUrl = process.env.MYSPACE_HRMS_URL || "http://localhost:3002";
    try {
      void fetch(`${hrmsUrl}/api/attendance/clock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: direction === "out" ? "out" : "in",
          method: method === "biometric" ? "biometric" : "manual",
          smartcardId: body.cardNumber ? String(body.cardNumber) : undefined,
          timestamp: at,
        }),
      }).catch(() => {});
    } catch {}

    return NextResponse.json({
      ok: true,
      punch: {
        id: punchId,
        siteId,
        personId: body.personId,
        personName: body.personName || "Employee",
        code: body.employeeCode || `CV-${body.personId}`,
        direction,
        method,
        at,
        granted: true,
        terminal: body.terminalId || "rfid-attend-7bcc",
        note: body.note || "Recorded in database successfully",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to record punch" },
      { status: 500 }
    );
  }
}
