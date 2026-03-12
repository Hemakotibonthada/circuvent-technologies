// ──────────────────────────────────────────────────────────────
// HR & Payroll — Payslip PDF Service
// Generates India-compliant payslip PDFs using the PDF engine,
// stores them in the database, and provides download endpoints.
// Enhanced with HT repo features: banking info, employer
// medical insurance, password-protected PDFs, conveyance/LTA
// earnings, billable hours, leave days, and amount-in-words.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";
import { EmailService } from "./email.service";

type PayslipInput = any;
async function getPayslipPDFGenerator() {
  try {
    const m = await import("@circuvent/pdf-engine");
    return m.generatePayslipPDF;
  } catch {
    throw new Error("PDF engine not available. Build @circuvent/pdf-engine first.");
  }
}
import { EnhancedPayrollService } from "./enhanced-payroll.service";

const prisma = new PrismaClient();

const COMPANY_INFO = {
  name: "Circuvent Technologies Pvt. Ltd.",
  address: "HSR Layout, Bengaluru, Karnataka 560102, India",
  cin: "U72200KA2024PTC123456",
  gstin: "29AABCC1234F1Z5",
  contact: "www.circuvent.tech | payroll@circuvent.tech | +91 765 999 3331",
};

/**
 * Build a payslip password from employee name and date of joining.
 * Format: first 4 chars of uppercased name + ddMM of DOJ.
 */
function buildPayslipPassword(fullName: string, dateOfJoining?: Date | string | null): string | null {
  if (!fullName) return null;
  const normalized = fullName.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!normalized.length) return null;

  let doj: Date | null = null;
  if (dateOfJoining instanceof Date) doj = dateOfJoining;
  else if (typeof dateOfJoining === "string") doj = new Date(dateOfJoining);
  if (!doj || isNaN(doj.getTime())) return null;

  const namePart = normalized.slice(0, 4).padEnd(4, "X");
  const day = String(doj.getDate()).padStart(2, "0");
  const month = String(doj.getMonth() + 1).padStart(2, "0");
  return `${namePart}${day}${month}`;
}

export class PayslipPDFService {
  /**
   * Generate and store a payslip PDF for a salary slip.
   */
  static async generateAndStore(salarySlipId: string, actorId: string): Promise<{
    documentId: string;
    checksum: string;
    sizeBytes: number;
  }> {
    // Fetch salary slip with employee details
    const slip = await prisma.salarySlip.findUnique({
      where: { id: salarySlipId },
      include: {
        employee: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        },
      },
    });

    if (!slip) throw new Error("Salary slip not found");

    // Check if PDF already exists
    const existingDoc = await prisma.payslipDocument.findUnique({
      where: { salarySlipId },
    });
    if (existingDoc) throw new Error("Payslip PDF already generated for this slip");

    // Get YTD data
    const ytd = await EnhancedPayrollService.getEmployeeYTD(slip.employeeId);

    // Build payslip input (enhanced with HT repo features)
    const fullName = `${slip.employee.user.firstName} ${slip.employee.user.lastName}`;
    const passwordHint = buildPayslipPassword(fullName, slip.employee.dateOfJoining);
    const basePay = Number(slip.basePay);
    const grossSalary = Number(slip.grossSalary);

    const payslipInput: PayslipInput = {
      employee: {
        code: slip.employee.employeeCode,
        name: fullName,
        designation: slip.employee.designation,
        department: slip.employee.department,
        pan: slip.employee.panNumber || "N/A",
        uan: slip.employee.uanNumber || "N/A",
        bankAccount: slip.employee.bankAccountNo || "N/A",
        bankIFSC: slip.employee.bankIFSC || "N/A",
        bankName: slip.employee.bankName || "N/A",
        accountHolderName: slip.employee.accountHolderName || fullName,
        location: slip.employee.location || "N/A",
        pfNumber: slip.employee.pfNumber || "N/A",
        dateOfJoining: slip.employee.dateOfJoining.toISOString().split("T")[0],
      },
      company: COMPANY_INFO,
      period: {
        month: slip.month,
        year: slip.year,
        monthName: new Date(2000, slip.month - 1).toLocaleString("en", { month: "long" }),
        totalDays: new Date(slip.year, slip.month, 0).getDate(),
        workedDays: new Date(slip.year, slip.month, 0).getDate(),
        lopDays: 0,
        billableHours: slip.billableHours ? Number(slip.billableHours) : undefined,
        leaveDays: slip.leaveDays ? Number(slip.leaveDays) : undefined,
      },
      earnings: {
        basePay,
        hra: Number(slip.hra),
        da: Number(slip.da),
        specialAllowance: Number(slip.specialAllowance),
        conveyanceAllowance: slip.conveyanceAllowance ? Number(slip.conveyanceAllowance) : undefined,
        lta: slip.lta ? Number(slip.lta) : undefined,
        bonus: Number(slip.bonus),
        otherAllowances: 0,
        grossSalary,
      },
      deductions: {
        epfEmployee: Number(slip.pfDeduction),
        esiEmployee: Number(slip.esiDeduction),
        professionalTax: Number(slip.professionalTax),
        tds: Number(slip.tds),
        otherDeductions: Number(slip.otherDeductions),
        totalDeductions: Number(slip.totalDeductions),
      },
      employerContributions: {
        epfEmployer: Math.round(basePay * 0.12),
        esiEmployer: grossSalary <= 21000 ? Math.ceil(grossSalary * 0.0325) : 0,
        gratuity: Math.round(basePay * 15 / 26 / 12),
        medicalInsurance: Math.round(grossSalary * 0.03),
      },
      netSalary: Number(slip.netSalary),
      yearToDate: {
        grossEarnings: ytd.grossEarnings,
        totalDeductions: ytd.totalDeductions,
        netPayments: ytd.netPayments,
        pfAccumulated: ytd.pfAccumulated,
        tdsDeducted: ytd.tdsDeducted,
      },
      passwordHint: passwordHint ? `First 4 letters of name + DOJ (DDMM)` : undefined,
    };

    // Generate PDF
    const generatePDF = await getPayslipPDFGenerator();
    const { buffer, checksum } = await generatePDF(payslipInput);

    // Store in database
    const doc = await prisma.payslipDocument.create({
      data: {
        salarySlipId,
        employeeId: slip.employeeId,
        month: slip.month,
        year: slip.year,
        pdfData: buffer,
        checksum,
        generatedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: actorId,
      action: "CREATE",
      entity: "PayslipDocument",
      entityId: doc.id,
      newValue: { salarySlipId, checksum, sizeBytes: buffer.length },
    });

    return {
      documentId: doc.id,
      checksum,
      sizeBytes: buffer.length,
    };
  }

  /**
   * Bulk generate payslip PDFs for a given month/year.
   */
  static async bulkGenerate(month: number, year: number, actorId: string): Promise<{
    generated: number;
    skipped: number;
    errors: number;
  }> {
    const slips = await prisma.salarySlip.findMany({
      where: { month, year },
      select: { id: true },
    });

    const results = { generated: 0, skipped: 0, errors: 0 };

    for (const slip of slips) {
      try {
        const existing = await prisma.payslipDocument.findUnique({
          where: { salarySlipId: slip.id },
        });
        if (existing) { results.skipped++; continue; }

        await this.generateAndStore(slip.id, actorId);
        results.generated++;
      } catch {
        results.errors++;
      }
    }

    return results;
  }

  /**
   * Get payslip PDF buffer for download.
   */
  static async download(documentId: string): Promise<{
    buffer: Buffer;
    filename: string;
    checksum: string;
  }> {
    const doc = await prisma.payslipDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc || !doc.pdfData) throw new Error("Payslip document not found");

    const monthName = new Date(2000, doc.month - 1).toLocaleString("en", { month: "short" });
    const filename = `Payslip_${doc.employeeId}_${monthName}_${doc.year}.pdf`;

    return {
      buffer: Buffer.from(doc.pdfData),
      filename,
      checksum: doc.checksum || "",
    };
  }

  /**
   * Get payslip by salary slip ID for download.
   */
  static async getBySlipId(salarySlipId: string): Promise<any> {
    return prisma.payslipDocument.findUnique({
      where: { salarySlipId },
      select: { id: true, checksum: true, generatedAt: true, month: true, year: true },
    });
  }

  /**
   * Get salary slip with employee and user details (for email notifications).
   */
  static async getSlipWithEmployee(salarySlipId: string): Promise<any> {
    return prisma.salarySlip.findUnique({
      where: { id: salarySlipId },
      include: {
        employee: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
  }

  /**
   * Send payslip-ready emails to all employees for a given month/year.
   */
  static async sendBulkPayslipEmails(month: number, year: number): Promise<{ sent: number; failed: number }> {
    const slips = await prisma.salarySlip.findMany({
      where: { month, year },
      include: {
        employee: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    const monthName = new Date(2000, month - 1).toLocaleString("en", { month: "long" });
    let sent = 0, failed = 0;

    for (const slip of slips) {
      const email = slip.employee?.user?.email;
      if (!email) { failed++; continue; }

      try {
        await EmailService.sendTemplateEmail(email, "payslip_ready", {
          employeeName: `${slip.employee.user.firstName} ${slip.employee.user.lastName}`,
          month: monthName,
          year: String(year),
          netSalary: Number(slip.netSalary).toLocaleString("en-IN"),
        });
        sent++;
      } catch {
        failed++;
      }
    }

    console.log(`[PayslipPDF] Bulk email: ${sent} sent, ${failed} failed for ${monthName} ${year}`);
    return { sent, failed };
  }
}
