import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getDatabase = getAttendanceDatabase;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const domain = (searchParams.get("domain") || "circuvent.com").toLowerCase().trim();
  const slug = domain.split(".")[0];
  const clientVersion = parseInt(searchParams.get("version") || "0", 10);

  try {
    const sql = getDatabase();

    const employees = (await sql`
      SELECT 
        e.id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.status,
        d.name as department_name,
        o.id as org_id,
        o.name as org_name
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
      status: string;
      department_name: string | null;
      org_id: string;
      org_name: string;
    }>;

    // Build smartcard UID mappings
    const DEFAULT_BADGE_MAP: Record<string, string> = {
      "CV-001": "28391024",
      "CV-002": "71928341",
      "CV-003": "99102834",
      "CV-004": "88129031",
    };

    const records = employees.map((emp, i) => {
      const code = emp.employee_code;
      const cardUid = DEFAULT_BADGE_MAP[code] || String(100000 + i + 1);

      return {
        card_uid: cardUid,
        code,
        name: `${emp.first_name || ""} ${emp.last_name || ""}`.trim(),
        department: emp.department_name || "General",
        active: emp.status === "active",
        access_tier: 1,
      };
    });

    // Current version derived from active count and fixed hash
    const serverVersion = 100 + records.length;

    return NextResponse.json({
      ok: true,
      acl_version: serverVersion,
      update_required: serverVersion !== clientVersion,
      tenant: domain,
      total_records: records.length,
      generated_at: new Date().toISOString(),
      records,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load device ACL" },
      { status: 500 }
    );
  }
}
