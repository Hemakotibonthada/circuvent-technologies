import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";
import { CONTROL_PLANE_URL } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AttendanceCompanySite {
  id: number;
  name: string;
  kind: string;
  timezone: string;
  companyName: string;
  domain: string;
  people: number;
  terminals: number;
}

export interface AttendanceCompanyItem {
  company_name: string;
  domain: string;
  org_id: string;
  site_count: number;
  people_count: number;
  terminal_count: number;
  sites: AttendanceCompanySite[];
}

const getDatabase = getAttendanceDatabase;

export async function GET() {
  try {
    const sql = getDatabase();

    // Query organizations, real employee counts, and locations from Neon Database
    const orgRows = (await sql`
      SELECT 
        o.id as org_id,
        o.name as company_name,
        o.slug,
        COALESCE(o.timezone, 'Asia/Kolkata') as timezone,
        COALESCE(
          (SELECT substring(e.work_email from '@(.*)$') FROM hrms.employees e WHERE e.org_id = o.id AND e.deleted_at IS NULL LIMIT 1),
          (SELECT substring(u.email from '@(.*)$') FROM identity.users u WHERE u.org_id = o.id LIMIT 1),
          o.slug || '.com'
        ) as domain,
        (SELECT count(*)::int FROM hrms.employees e WHERE e.org_id = o.id AND e.deleted_at IS NULL) as people_count,
        (
          SELECT json_agg(
            json_build_object(
              'id', l.id,
              'name', l.name,
              'kind', 'office',
              'timezone', COALESCE(l.timezone, o.timezone, 'Asia/Kolkata')
            )
          )
          FROM hrms.locations l
          WHERE l.org_id = o.id AND l.is_active = true
        ) as locations
      FROM identity.organizations o
      WHERE o.deleted_at IS NULL
      ORDER BY o.name ASC;
    `) as Array<{
      org_id: string;
      company_name: string;
      slug: string;
      timezone: string;
      domain: string;
      people_count: number;
      locations: Array<{
        id: string;
        name: string;
        kind: string;
        timezone: string;
      }> | null;
    }>;

    // Prioritize Circuvent Technologies as primary organization
    const sortedOrgRows = [...orgRows].sort((a, b) => {
      const aCirc = a.domain.toLowerCase().includes("circuvent");
      const bCirc = b.domain.toLowerCase().includes("circuvent");
      if (aCirc && !bCirc) return -1;
      if (!aCirc && bCirc) return 1;
      return a.company_name.localeCompare(b.company_name);
    });

    let siteIndexCounter = 1;
    const dbCompanies: AttendanceCompanyItem[] = sortedOrgRows.map((org) => {
      const dom = org.domain.toLowerCase();
      const people = Number(org.people_count) || 0;
      const sites: AttendanceCompanySite[] = [];
      const isCircuvent = dom.includes("circuvent");

      if (Array.isArray(org.locations) && org.locations.length > 0) {
        for (const loc of org.locations) {
          const sId = isCircuvent && sites.length === 0 ? 6 : (siteIndexCounter === 6 ? ++siteIndexCounter : siteIndexCounter++);
          sites.push({
            id: sId,
            name: `${loc.name} (${loc.kind || "office"})`,
            kind: loc.kind || "office",
            timezone: loc.timezone || org.timezone || "Asia/Kolkata",
            companyName: org.company_name,
            domain: dom,
            people,
            terminals: 2,
          });
        }
      } else {
        const sId = isCircuvent ? 6 : (siteIndexCounter === 6 ? ++siteIndexCounter : siteIndexCounter++);
        sites.push({
          id: sId,
          name: `${org.company_name} (Head Office)`,
          kind: "office",
          timezone: org.timezone || "Asia/Kolkata",
          companyName: org.company_name,
          domain: dom,
          people,
          terminals: 2,
        });
      }

      return {
        company_name: org.company_name,
        domain: dom,
        org_id: org.org_id,
        site_count: sites.length,
        people_count: people,
        terminal_count: sites.reduce((sum, s) => sum + s.terminals, 0),
        sites,
      };
    });

    // Optionally augment with control plane if running and returns external tenants
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${CONTROL_PLANE_URL}/attendance/companies`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.companies) && data.companies.length > 0) {
          const map = new Map<string, AttendanceCompanyItem>();
          for (const c of dbCompanies) map.set(c.domain, c);
          for (const c of data.companies) {
            const dom = (c.domain || "").toLowerCase();
            if (dom && !map.has(dom)) {
              map.set(dom, {
                company_name: c.company_name || dom,
                domain: dom,
                org_id: c.org_id || "",
                site_count: c.site_count || 1,
                people_count: c.people_count || 0,
                terminal_count: c.terminal_count || 0,
                sites: c.sites || [],
              });
            }
          }
          return NextResponse.json({
            ok: true,
            source: "neon_database_and_control_plane",
            companies: Array.from(map.values()),
          });
        }
      }
    } catch {
      // Control plane optional
    }

    return NextResponse.json({
      ok: true,
      source: "neon_database",
      companies: dbCompanies,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load companies from database" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const domain = (body.domain || "").trim().toLowerCase();
    const companyName = (body.companyName || "").trim();
    const siteName = (body.siteName || "Headquarters").trim();
    const timezone = body.timezone || "Asia/Kolkata";

    if (!domain || !domain.includes(".")) {
      return NextResponse.json({ error: "Valid corporate domain is required (e.g. acme.com)" }, { status: 400 });
    }
    if (!companyName) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const sql = getDatabase();
    const slug = domain.split(".")[0];

    // Insert new organization into database
    const orgResult = await sql`
      INSERT INTO identity.organizations (name, slug, timezone, created_at, updated_at)
      VALUES (${companyName}, ${slug}, ${timezone}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING id, name, slug;
    `;

    const orgId = orgResult?.[0]?.id || `org_${Date.now().toString(36)}`;

    // Insert new location for this organization
    await sql`
      INSERT INTO hrms.locations (org_id, name, code, timezone, is_active, created_at)
      VALUES (${orgId}, ${siteName}, UPPER(${siteName.slice(0, 4)}), ${timezone}, true, NOW())
      ON CONFLICT DO NOTHING;
    `;

    return NextResponse.json({
      ok: true,
      message: `Organization ${companyName} registered successfully in database.`,
      orgId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register company in database" },
      { status: 500 }
    );
  }
}
