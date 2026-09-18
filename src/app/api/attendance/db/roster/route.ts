import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AttendanceRosterPerson {
  id: number;
  code: string;
  name: string;
  role: string;
  email: string;
  groupName: string;
  status: "active" | "inactive";
  active: boolean;
  avatar?: string;
  cardNumber?: number;
  cards: number;
  phone?: string;
  employmentType?: string;
}

const getDatabase = getAttendanceDatabase;

export async function GET(request: NextRequest) {
  const domain = (request.nextUrl.searchParams.get("domain") || "circuvent.com").toLowerCase().trim();
  const slug = domain.split(".")[0];

  try {
    const sql = getDatabase();

    // Query official personnel records from hrms.employees joined with hrms.departments & identity.organizations
    const hrmsEmployees = (await sql`
      SELECT 
        e.id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.work_email,
        e.personal_email,
        e.phone,
        e.avatar_url,
        e.designation,
        e.employment_type,
        e.status,
        e.join_date,
        d.name AS department_name,
        d.code AS department_code,
        o.id AS org_id,
        o.name AS org_name
      FROM hrms.employees e
      LEFT JOIN hrms.departments d ON e.department_id = d.id
      LEFT JOIN identity.organizations o ON e.org_id = o.id
      WHERE e.deleted_at IS NULL
        AND (
          e.work_email ILIKE ${"%@" + domain}
          OR o.slug ILIKE ${slug}
        )
      ORDER BY e.employee_code ASC
    `) as Array<{
      id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
      work_email: string;
      personal_email?: string | null;
      phone?: string | null;
      avatar_url?: string | null;
      designation: string;
      employment_type?: string;
      status: string;
      join_date?: string | null;
      department_name?: string | null;
      department_code?: string | null;
      org_id?: string | null;
      org_name?: string | null;
    }>;

    const people: AttendanceRosterPerson[] = hrmsEmployees.map((emp, index) => {
      const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.work_email.split("@")[0];
      const numericCode = parseInt(emp.employee_code?.replace(/\D/g, "") || String(index + 1), 10);
      const isActive = emp.status !== "inactive" && emp.status !== "terminated";

      return {
        id: 100 + index + 1,
        code: emp.employee_code || `CV-${String(index + 1).padStart(3, "0")}`,
        name: fullName,
        role: emp.designation || "Team Member",
        email: emp.work_email,
        groupName: emp.department_name || "General",
        status: isActive ? "active" : "inactive",
        active: isActive,
        avatar: emp.avatar_url || undefined,
        cardNumber: 100000 + (isNaN(numericCode) ? index + 1 : numericCode),
        cards: 1,
        phone: emp.phone || undefined,
        employmentType: emp.employment_type || undefined,
      };
    });

    return NextResponse.json({
      ok: true,
      source: "neon_database",
      schema: "hrms",
      table: "employees",
      domain,
      count: people.length,
      people,
    });
  } catch (err) {
    console.error("Failed to query roster from database:", err);
    return NextResponse.json(
      {
        ok: false,
        source: "database_error",
        domain,
        count: 0,
        people: [],
        error: err instanceof Error ? err.message : "Database query failed",
      },
      { status: 500 }
    );
  }
}
