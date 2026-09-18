import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getDatabase = getAttendanceDatabase;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const domain = (searchParams.get("domain") || "circuvent.com").toLowerCase().trim();
  const slug = domain.split(".")[0];
  const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const departmentFilter = searchParams.get("departmentId") || "";

  try {
    const sql = getDatabase();

    // 1. Fetch departments for this organization
    const deptRows = (await sql`
      SELECT d.id, d.name, d.code
      FROM hrms.departments d
      JOIN identity.organizations o ON d.org_id = o.id
      WHERE (o.slug ILIKE ${slug} OR EXISTS (
        SELECT 1 FROM hrms.employees e WHERE e.org_id = o.id AND e.work_email ILIKE ${"%@" + domain}
      ))
      ORDER BY d.name ASC;
    `) as Array<{ id: string; name: string; code: string }>;

    // 2. Fetch all employees for this organization joined with their attendance record for the selected date
    const rows = (await sql`
      SELECT 
        e.id as employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.designation,
        e.work_email,
        e.avatar_url,
        d.id as department_id,
        d.name as department_name,
        a.id as attendance_id,
        a.work_date,
        a.clock_in_at,
        a.clock_out_at,
        a.status as attendance_status,
        a.worked_minutes,
        a.late_by_minutes,
        a.early_leave_by_minutes,
        a.clock_in_method,
        a.notes
      FROM hrms.employees e
      LEFT JOIN hrms.departments d ON e.department_id = d.id
      JOIN identity.organizations o ON e.org_id = o.id
      LEFT JOIN hrms.attendance_records a 
        ON a.employee_id = e.id 
       AND a.work_date = ${dateStr}::date
      WHERE e.deleted_at IS NULL
        AND (
          e.work_email ILIKE ${"%@" + domain}
          OR o.slug ILIKE ${slug}
        )
      ORDER BY e.employee_code ASC;
    `) as Array<{
      employee_id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
      designation: string;
      work_email: string;
      avatar_url: string | null;
      department_id: string | null;
      department_name: string | null;
      attendance_id: string | null;
      work_date: string | null;
      clock_in_at: string | null;
      clock_out_at: string | null;
      attendance_status: string | null;
      worked_minutes: number | null;
      late_by_minutes: number | null;
      early_leave_by_minutes: number | null;
      clock_in_method: string | null;
      notes: string | null;
    }>;

    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    const registerRows = rows.map((r, index) => {
      const fullName = `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.work_email.split("@")[0];
      const numericCode = parseInt(r.employee_code?.replace(/\D/g, "") || String(index + 1), 10);
      const personId = 100 + (isNaN(numericCode) ? index + 1 : numericCode);

      let status = "unknown";
      if (r.attendance_status) {
        if (r.attendance_status === "present") status = "present";
        else if (r.attendance_status === "late") status = "late";
        else if (r.attendance_status === "half_day") status = "half";
        else if (r.attendance_status === "absent") status = "absent";
        else if (r.attendance_status === "on_leave") status = "leave";
        else status = r.attendance_status;
      } else if (r.clock_in_at) {
        status = (r.late_by_minutes && r.late_by_minutes > 0) ? "late" : "present";
      }

      if (status === "present" || status === "half") presentCount++;
      if (status === "late") {
        presentCount++;
        lateCount++;
      }
      if (status === "absent") absentCount++;

      let punchCount = 0;
      if (r.clock_in_at) punchCount++;
      if (r.clock_out_at) punchCount++;

      return {
        personId,
        employeeDbId: r.employee_id,
        name: fullName,
        code: r.employee_code || `CV-${String(index + 1).padStart(3, "0")}`,
        role: r.designation || "Team Member",
        groupName: r.department_name || "General",
        departmentId: r.department_id,
        status,
        firstIn: r.clock_in_at ? new Date(r.clock_in_at).toISOString() : null,
        lastOut: r.clock_out_at ? new Date(r.clock_out_at).toISOString() : null,
        workedMinutes: r.worked_minutes || (r.clock_in_at && r.clock_out_at ? Math.round((new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / 60000) : 0),
        lateMinutes: r.late_by_minutes || 0,
        earlyMinutes: r.early_leave_by_minutes || 0,
        punches: punchCount,
        assumedOut: false,
        note: r.notes || (r.clock_in_at ? "Logged Shift" : "No punch"),
        manual: r.clock_in_method === "manual",
      };
    });

    const filteredRows = departmentFilter
      ? registerRows.filter((row) => row.departmentId === departmentFilter || String(row.groupName).toLowerCase() === departmentFilter.toLowerCase())
      : registerRows;

    return NextResponse.json({
      ok: true,
      source: "neon_database",
      date: dateStr,
      domain,
      totals: {
        present: presentCount,
        late: lateCount,
        absent: absentCount,
        total: registerRows.length,
      },
      rows: filteredRows,
      departments: deptRows.map((d, i) => ({
        id: i + 1,
        deptId: d.id,
        name: d.name,
        code: d.code,
      })),
    });
  } catch (err) {
    console.error("Failed to query attendance register from database:", err);
    return NextResponse.json(
      {
        ok: false,
        source: "database_error",
        date: dateStr,
        totals: { present: 0, late: 0, absent: 0, total: 0 },
        rows: [],
        departments: [],
        error: err instanceof Error ? err.message : "Failed to load attendance register",
      },
      { status: 500 }
    );
  }
}
