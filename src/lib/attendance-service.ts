/**
 * Enterprise Attendance Service
 *
 * Coordinates multi-company directory resolution, live terminal synchronization,
 * HRMS roster integration, and database-driven endpoints for attendance.circuvent.com.
 */
import {
  controlPlane,
  type AttendanceSite,
  type AttendanceCompany,
  type AttendancePerson,
  type AttendanceGroup,
  type AttendanceCredential,
  type AttendanceTerminal,
  type AttendanceLive,
  type RegisterRow,
  type AttendancePunch,
} from "./control-plane";

export interface EnterpriseCompany {
  company_name: string;
  domain: string;
  org_id: string;
  site_count: number;
  people_count: number;
  terminal_count: number;
  sites: Array<{
    id: number;
    name: string;
    kind: string;
    timezone: string;
    companyName: string;
    domain: string;
    people: number;
    terminals: number;
  }>;
}

export async function fetchEnterpriseCompanies(): Promise<EnterpriseCompany[]> {
  try {
    const res = await fetch("/api/attendance/companies", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.companies) && data.companies.length > 0) {
        return data.companies;
      }
    }
  } catch {}

  // Fallback to controlPlane if active
  const cpRes = await controlPlane.attendanceCompanies().catch(() => ({ ok: false as const, data: { companies: [] } }));
  if (cpRes.ok && cpRes.data.companies?.length) {
    return cpRes.data.companies.map((c) => ({
      ...c,
      sites: c.sites || [],
    }));
  }

  return [];
}

export async function registerEnterpriseClient(body: {
  companyName: string;
  domain: string;
  siteName: string;
  kind?: string;
  timezone?: string;
  adminName?: string;
  adminEmail?: string;
  plan?: string;
}) {
  const res = await fetch("/api/attendance/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchRosterFromDatabase(
  arg1: string | { domain: string; siteId: number },
  arg2?: number
): Promise<{ ok: boolean; count: number; source: string; people: any[]; error?: string }> {
  const domain = typeof arg1 === "string" ? arg1 : arg1.domain;
  const siteId = typeof arg1 === "string" ? (arg2 ?? 1) : arg1.siteId;
  try {
    const res = await fetch(`/api/attendance/db/roster?domain=${encodeURIComponent(domain)}&siteId=${siteId}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.people) ? data.people : [];
      return { ok: true, count: list.length, source: data.source || "Database / MySpace", people: list };
    }
  } catch (err: any) {
    return { ok: false, count: 0, source: "offline", people: [], error: err?.message };
  }
  return { ok: false, count: 0, source: "offline", people: [], error: "Roster fetch failed" };
}

export async function fetchAttendanceRegister(params: {
  domain: string;
  date: string;
  departmentId?: string;
}): Promise<{
  ok: boolean;
  date: string;
  totals: { present: number; late: number; absent: number; total: number };
  rows: RegisterRow[];
  departments: Array<{ id: number; deptId: string; name: string; code: string }>;
  error?: string;
}> {
  try {
    const q = new URLSearchParams({
      domain: params.domain,
      date: params.date,
    });
    if (params.departmentId) q.set("departmentId", params.departmentId);

    const res = await fetch(`/api/attendance/db/register?${q.toString()}`, { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err: any) {
    return {
      ok: false,
      date: params.date,
      totals: { present: 0, late: 0, absent: 0, total: 0 },
      rows: [],
      departments: [],
      error: err?.message,
    };
  }
  return {
    ok: false,
    date: params.date,
    totals: { present: 0, late: 0, absent: 0, total: 0 },
    rows: [],
    departments: [],
    error: "Failed to fetch attendance register",
  };
}

export async function fetchAttendanceLive(domain: string): Promise<{
  ok: boolean;
  day: string;
  timezone: string;
  totals: { people: number; present: number; late: number; early: number; missing: number; overtime: number; onSite: number };
  onSite: Array<{ personId: number; name: string; code: string; groupName: string; since: string }>;
  recent: Array<any>;
  terminals: Array<any>;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/attendance/db/live?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err: any) {
    return {
      ok: false,
      day: new Date().toISOString().slice(0, 10),
      timezone: "Asia/Kolkata",
      totals: { people: 0, present: 0, late: 0, early: 0, missing: 0, overtime: 0, onSite: 0 },
      onSite: [],
      recent: [],
      terminals: [],
      error: err?.message,
    };
  }
  return {
    ok: false,
    day: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Kolkata",
    totals: { people: 0, present: 0, late: 0, early: 0, missing: 0, overtime: 0, onSite: 0 },
    onSite: [],
    recent: [],
    terminals: [],
    error: "Failed to fetch live board",
  };
}

export async function submitPunchWithSync(payload: {
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
}) {
  const res = await fetch("/api/attendance/db/sync-punch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function syncAttendanceToPaystub(params: {
  siteId: number;
  from: string;
  to: string;
  orgId?: string;
}): Promise<{ ok: boolean; batchId?: string; recordsPushed?: number; message?: string; error?: string }> {
  try {
    const res = await fetch("/api/attendance/paystub/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to push timesheets to Paystub" };
  }
}
