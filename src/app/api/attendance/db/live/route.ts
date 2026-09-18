import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getDatabase = getAttendanceDatabase;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const domain = (searchParams.get("domain") || "circuvent.com").toLowerCase().trim();
  const slug = domain.split(".")[0];
  const todayDate = new Date().toISOString().slice(0, 10);

  try {
    const sql = getDatabase();

    // 1. Fetch total employees for domain
    const employees = (await sql`
      SELECT 
        e.id, e.employee_code, e.first_name, e.last_name, e.work_email,
        d.name as department_name, o.timezone
      FROM hrms.employees e
      LEFT JOIN hrms.departments d ON e.department_id = d.id
      JOIN identity.organizations o ON e.org_id = o.id
      WHERE e.deleted_at IS NULL
        AND (e.work_email ILIKE ${"%@" + domain} OR o.slug ILIKE ${slug})
      ORDER BY e.employee_code ASC;
    `) as Array<{
      id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
      work_email: string;
      department_name: string | null;
      timezone: string | null;
    }>;

    const totalEmployees = employees.length;
    const tz = employees[0]?.timezone || "Asia/Kolkata";

    // 2. Fetch today's attendance records
    const todayRecords = (await sql`
      SELECT 
        a.id, a.employee_id, a.work_date, a.clock_in_at, a.clock_out_at,
        a.status, a.late_by_minutes, a.early_leave_by_minutes, a.notes, a.clock_in_method,
        e.employee_code, e.first_name, e.last_name, d.name as department_name
      FROM hrms.attendance_records a
      JOIN hrms.employees e ON a.employee_id = e.id
      LEFT JOIN hrms.departments d ON e.department_id = d.id
      JOIN identity.organizations o ON e.org_id = o.id
      WHERE e.deleted_at IS NULL
        AND (e.work_email ILIKE ${"%@" + domain} OR o.slug ILIKE ${slug})
        AND (a.work_date = ${todayDate}::date OR a.clock_in_at >= NOW() - INTERVAL '24 HOURS')
      ORDER BY COALESCE(a.clock_out_at, a.clock_in_at) DESC;
    `) as Array<{
      id: string;
      employee_id: string;
      work_date: string;
      clock_in_at: string | null;
      clock_out_at: string | null;
      status: string | null;
      late_by_minutes: number | null;
      early_leave_by_minutes: number | null;
      notes: string | null;
      clock_in_method: string | null;
      employee_code: string;
      first_name: string;
      last_name: string;
      department_name: string | null;
    }>;

    // Determine who is currently on site (clocked in and not yet clocked out)
    const onSiteList: Array<{
      personId: number;
      name: string;
      code: string;
      groupName: string;
      since: string;
    }> = [];

    let presentCount = 0;
    let lateCount = 0;
    let earlyCount = 0;

    for (const rec of todayRecords) {
      if (rec.clock_in_at) {
        presentCount++;
        if (rec.late_by_minutes && rec.late_by_minutes > 0) lateCount++;
        if (rec.early_leave_by_minutes && rec.early_leave_by_minutes > 0) earlyCount++;

        if (!rec.clock_out_at) {
          const numCode = parseInt(rec.employee_code?.replace(/\D/g, "") || "1", 10);
          onSiteList.push({
            personId: 100 + (isNaN(numCode) ? 1 : numCode),
            name: `${rec.first_name || ""} ${rec.last_name || ""}`.trim(),
            code: rec.employee_code,
            groupName: rec.department_name || "General",
            since: new Date(rec.clock_in_at).toISOString(),
          });
        }
      }
    }

    // Recent activity punches
    const recentScans: Array<{
      at: string;
      direction: "in" | "out";
      granted: boolean;
      reason: string;
      cardNumber: number;
      personName: string;
      personCode: string;
      terminalName: string;
    }> = [];

    for (const rec of todayRecords.slice(0, 15)) {
      const numCode = parseInt(rec.employee_code?.replace(/\D/g, "") || "1", 10);
      const cardNum = 100000 + (isNaN(numCode) ? 1 : numCode);
      const fullName = `${rec.first_name || ""} ${rec.last_name || ""}`.trim();

      if (rec.clock_out_at) {
        recentScans.push({
          at: new Date(rec.clock_out_at).toISOString(),
          direction: "out",
          granted: true,
          reason: "authorized",
          cardNumber: cardNum,
          personName: fullName,
          personCode: rec.employee_code,
          terminalName: "Main Entrance Gate",
        });
      }
      if (rec.clock_in_at) {
        recentScans.push({
          at: new Date(rec.clock_in_at).toISOString(),
          direction: "in",
          granted: true,
          reason: "authorized",
          cardNumber: cardNum,
          personName: fullName,
          personCode: rec.employee_code,
          terminalName: "Main Entrance Gate",
        });
      }
    }

    recentScans.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const missingCount = Math.max(0, totalEmployees - presentCount);

    return NextResponse.json({
      ok: true,
      source: "neon_database",
      day: todayDate,
      timezone: tz,
      totals: {
        people: totalEmployees,
        present: presentCount,
        late: lateCount,
        early: earlyCount,
        missing: missingCount,
        overtime: 0,
        onSite: onSiteList.length,
      },
      onSite: onSiteList,
      recent: recentScans,
      terminals: [
        {
          deviceId: "rfid-attend-7bcc",
          name: "Main Entrance Gate (ESP32-RFID)",
          online: true,
          lastPunchAt: recentScans[0]?.at || new Date().toISOString(),
          aclCount: totalEmployees,
          queued: 0,
        },
        {
          deviceId: "rfid-attend-8a1d",
          name: "Floor 2 Engineering Lab",
          online: true,
          lastPunchAt: recentScans[1]?.at || new Date().toISOString(),
          aclCount: totalEmployees,
          queued: 0,
        },
      ],
    });
  } catch (err) {
    console.error("Failed to query live attendance from database:", err);
    return NextResponse.json(
      {
        ok: false,
        source: "database_error",
        day: todayDate,
        totals: { people: 0, present: 0, late: 0, early: 0, missing: 0, overtime: 0, onSite: 0 },
        onSite: [],
        recent: [],
        terminals: [],
        error: err instanceof Error ? err.message : "Failed to load live board",
      },
      { status: 500 }
    );
  }
}
