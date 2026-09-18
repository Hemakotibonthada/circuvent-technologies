import { NextRequest, NextResponse } from "next/server";
import { getAttendanceDatabase } from "@/lib/attendance-db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const PAYSTUB_SYNC_TOKEN =
  process.env.CROSS_APP_SYNC_TOKEN ||
  "3eb3428d26c42bdc56c2cceb74d18716b9f1beeffb06f81c2dad2cf7caf8842d";

const PAYSTUB_URL =
  process.env.PAYSTUB_BASE_URL ||
  process.env.NEXT_PUBLIC_PAYSTUB_URL ||
  "https://paystub.circuvent.com";

const getDatabase = getAttendanceDatabase;

// Default monthly base CTC tier in minor units (paisa) if not overridden in DB
const DEFAULT_SALARY_TIERS: Record<string, number> = {
  "CV-001": 12500000, // ₹1,25,000 / month
  "CV-002": 9500000,  // ₹95,000 / month
  "CV-003": 8500000,  // ₹85,000 / month
  "CV-004": 8000000,  // ₹80,000 / month
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { siteId, from, to, orgId } = body;
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    const periodDate = new Date(toDate);
    const periodMonth = periodDate.getMonth() + 1;
    const periodYear = periodDate.getFullYear();
    const workingDaysStandard = 22; // Standard monthly working days

    const sql = getDatabase();

    // 1. Fetch active employees
    const employees = (await sql`
      SELECT 
        e.id,
        e.org_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.designation,
        e.status
      FROM hrms.employees e
      WHERE e.deleted_at IS NULL
      ORDER BY e.employee_code ASC;
    `) as Array<{
      id: string;
      org_id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
      designation: string;
      status: string;
    }>;

    if (employees.length === 0) {
      return NextResponse.json({ ok: false, error: "No active employees found" }, { status: 404 });
    }

    const targetOrgId = orgId || employees[0].org_id || "dcfe2f03-f0cf-468c-b304-14760b031bdf";

    // 2. Fetch all attendance records in period
    const attendanceRecords = (await sql`
      SELECT 
        a.employee_id,
        a.work_date,
        a.status,
        a.worked_minutes,
        TO_CHAR(a.clock_in_at, 'HH24:MI:SS') as clock_in,
        TO_CHAR(a.clock_out_at, 'HH24:MI:SS') as clock_out,
        a.notes
      FROM hrms.attendance_records a
      WHERE a.work_date BETWEEN ${fromDate}::date AND ${toDate}::date;
    `) as Array<{
      employee_id: string;
      work_date: string;
      status: string;
      worked_minutes: number | null;
      clock_in: string | null;
      clock_out: string | null;
      notes: string | null;
    }>;

    // 3. Find or create a payroll run for this month/year in hrms.payroll_runs
    const existingRuns = (await sql`
      SELECT id, status, total_gross_minor, total_deductions_minor, total_net_minor
      FROM hrms.payroll_runs
      WHERE org_id = ${targetOrgId} 
        AND period_month = ${periodMonth} 
        AND period_year = ${periodYear}
        AND run_type = 'regular'
      LIMIT 1;
    `) as Array<{
      id: string;
      status: string;
      total_gross_minor: string;
      total_deductions_minor: string;
      total_net_minor: string;
    }>;

    let runId = existingRuns[0]?.id;
    if (!runId) {
      runId = randomUUID();
      await sql`
        INSERT INTO hrms.payroll_runs (
          id,
          org_id,
          period_month,
          period_year,
          run_type,
          status,
          employee_count,
          total_gross_minor,
          total_deductions_minor,
          total_net_minor,
          processed_at,
          created_at
        ) VALUES (
          ${runId},
          ${targetOrgId},
          ${periodMonth},
          ${periodYear},
          'regular',
          'processed',
          ${employees.length},
          0,
          0,
          0,
          NOW(),
          NOW()
        );
      `;
    }

    // 4. Compute attendance-driven payroll for each employee
    let runTotalGross = 0;
    let runTotalDeductions = 0;
    let runTotalNet = 0;

    const payrollSummaries = [];

    for (const emp of employees) {
      const empPunches = attendanceRecords.filter((a) => a.employee_id === emp.id);

      // Present days calculation
      let presentDays = 0;
      let overtimeMinutesTotal = 0;

      for (const p of empPunches) {
        if (p.status === "present") {
          presentDays += 1;
        } else if (p.status === "half_day") {
          presentDays += 0.5;
        }

        if (p.worked_minutes && p.worked_minutes > 480) {
          overtimeMinutesTotal += p.worked_minutes - 480;
        }
      }

      // If no records at all, default to full attendance safely
      if (empPunches.length === 0) {
        presentDays = workingDaysStandard;
      }

      const lopDays = Math.max(0, workingDaysStandard - presentDays);
      const grossMinor = DEFAULT_SALARY_TIERS[emp.employee_code] || 8000000;
      const dailyRate = Math.round(grossMinor / workingDaysStandard);

      // Deductions
      const lopDeductionMinor = Math.round(dailyRate * lopDays);
      const basicMinor = Math.round(grossMinor * 0.5);
      const hraMinor = Math.round(grossMinor * 0.25);
      const conveyanceMinor = 160000; // ₹1,600
      const medicalMinor = 125000;    // ₹1,250
      const ltaMinor = 100000;        // ₹1,000
      const specialAllowanceMinor = grossMinor - (basicMinor + hraMinor + conveyanceMinor + medicalMinor + ltaMinor);

      // Overtime
      const overtimeHours = Math.round((overtimeMinutesTotal / 60) * 10) / 10;
      const hourlyRate = Math.round(dailyRate / 8);
      const overtimeMinor = Math.round(hourlyRate * overtimeHours * 1.5);

      // Statutory deductions
      const pfEmployeeMinor = Math.min(180000, Math.round(basicMinor * 0.12));
      const esiEmployeeMinor = grossMinor <= 2100000 ? Math.round(grossMinor * 0.0075) : 0;
      const professionalTaxMinor = 20000; // ₹200
      const incomeTaxMinor = 0;
      const otherDeductionsMinor = 0;

      const totalDeductionsMinor =
        lopDeductionMinor +
        pfEmployeeMinor +
        esiEmployeeMinor +
        professionalTaxMinor +
        incomeTaxMinor +
        otherDeductionsMinor;

      const totalEarningsMinor = grossMinor + overtimeMinor;
      const netPayMinor = totalEarningsMinor > totalDeductionsMinor ? totalEarningsMinor - totalDeductionsMinor : 0;

      const pfEmployerMinor = pfEmployeeMinor;
      const esiEmployerMinor = grossMinor <= 2100000 ? Math.round(grossMinor * 0.0325) : 0;

      runTotalGross += grossMinor;
      runTotalDeductions += totalDeductionsMinor;
      runTotalNet += netPayMinor;

      const recordId = randomUUID();
      const anomalies = lopDays > 0 ? [{ type: "LOSS_OF_PAY", days: lopDays }] : [];

      // Upsert into hrms.payroll_records
      await sql`
        INSERT INTO hrms.payroll_records (
          id,
          org_id,
          run_id,
          employee_id,
          working_days,
          present_days,
          lop_days,
          basic_minor,
          hra_minor,
          conveyance_minor,
          medical_minor,
          lta_minor,
          special_allowance_minor,
          other_earnings_minor,
          overtime_minor,
          bonus_minor,
          arrears_minor,
          gross_minor,
          pf_employee_minor,
          esi_employee_minor,
          professional_tax_minor,
          income_tax_minor,
          loan_recovery_minor,
          lop_deduction_minor,
          other_deductions_minor,
          total_deductions_minor,
          net_pay_minor,
          pf_employer_minor,
          esi_employer_minor,
          status,
          anomalies,
          created_at
        ) VALUES (
          ${recordId},
          ${targetOrgId},
          ${runId},
          ${emp.id},
          ${workingDaysStandard},
          ${presentDays},
          ${lopDays},
          ${basicMinor},
          ${hraMinor},
          ${conveyanceMinor},
          ${medicalMinor},
          ${ltaMinor},
          ${specialAllowanceMinor},
          0,
          ${overtimeMinor},
          0,
          0,
          ${grossMinor},
          ${pfEmployeeMinor},
          ${esiEmployeeMinor},
          ${professionalTaxMinor},
          ${incomeTaxMinor},
          0,
          ${lopDeductionMinor},
          0,
          ${totalDeductionsMinor},
          ${netPayMinor},
          ${pfEmployerMinor},
          ${esiEmployerMinor},
          'processed',
          ${JSON.stringify(anomalies)}::jsonb,
          NOW()
        )
        ON CONFLICT (run_id, employee_id) DO UPDATE SET
          working_days = EXCLUDED.working_days,
          present_days = EXCLUDED.present_days,
          lop_days = EXCLUDED.lop_days,
          basic_minor = EXCLUDED.basic_minor,
          hra_minor = EXCLUDED.hra_minor,
          conveyance_minor = EXCLUDED.conveyance_minor,
          medical_minor = EXCLUDED.medical_minor,
          lta_minor = EXCLUDED.lta_minor,
          special_allowance_minor = EXCLUDED.special_allowance_minor,
          overtime_minor = EXCLUDED.overtime_minor,
          gross_minor = EXCLUDED.gross_minor,
          pf_employee_minor = EXCLUDED.pf_employee_minor,
          professional_tax_minor = EXCLUDED.professional_tax_minor,
          lop_deduction_minor = EXCLUDED.lop_deduction_minor,
          total_deductions_minor = EXCLUDED.total_deductions_minor,
          net_pay_minor = EXCLUDED.net_pay_minor,
          status = 'processed',
          anomalies = EXCLUDED.anomalies;
      `;

      payrollSummaries.push({
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        name: `${emp.first_name} ${emp.last_name}`.trim(),
        workingDays: workingDaysStandard,
        presentDays,
        lopDays,
        gross: grossMinor / 100,
        lopDeduction: lopDeductionMinor / 100,
        overtimePay: overtimeMinor / 100,
        totalDeductions: totalDeductionsMinor / 100,
        netPay: netPayMinor / 100,
      });
    }

    // 5. Update parent payroll run aggregates
    await sql`
      UPDATE hrms.payroll_runs
      SET 
        total_gross_minor = ${runTotalGross},
        total_deductions_minor = ${runTotalDeductions},
        total_net_minor = ${runTotalNet},
        employee_count = ${employees.length},
        status = 'processed',
        processed_at = NOW()
      WHERE id = ${runId};
    `;

    // 6. External Paystub webhook / sync if live service available
    let externalSyncStatus = "standalone_database_mode";
    try {
      const paystubRes = await fetch(`${PAYSTUB_URL}/api/sync/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Token": PAYSTUB_SYNC_TOKEN,
        },
        body: JSON.stringify({
          runId,
          orgId: targetOrgId,
          periodMonth,
          periodYear,
          summaries: payrollSummaries,
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (paystubRes.ok) {
        externalSyncStatus = "paystub_live_synced";
      }
    } catch {
      // Local fallback
    }

    return NextResponse.json({
      ok: true,
      source: "neon_hrms_pipeline",
      payrollRunId: runId,
      period: {
        month: periodMonth,
        year: periodYear,
        from: fromDate,
        to: toDate,
      },
      externalSyncStatus,
      summary: {
        employeeCount: employees.length,
        totalGross: runTotalGross / 100,
        totalDeductions: runTotalDeductions / 100,
        totalNetPay: runTotalNet / 100,
      },
      employees: payrollSummaries,
    });
  } catch (error: any) {
    console.error("Paystub attendance sync failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Paystub sync failed" },
      { status: 500 }
    );
  }
}
