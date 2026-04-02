// ──────────────────────────────────────────────────────────────
// HR & Payroll — Service Layer (business logic + India tax engine)
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@circuvent/database";
import { generateCode, EMPLOYEE_CODE_PREFIX, EXPENSE_PREFIX, getFinancialYear, INDIA_TAX } from "@circuvent/shared";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Salary Calculation Engine — India Tax Compliance
// ══════════════════════════════════════════════════════════════

export interface SalaryBreakdown {
  basePay: number; hra: number; da: number; specialAllowance: number; bonus: number;
  grossSalary: number; pfDeduction: number; esiDeduction: number;
  professionalTax: number; tds: number; otherDeductions: number;
  totalDeductions: number; netSalary: number;
}

export function calculateMonthlySalary(annualCTC: number, bonus = 0): SalaryBreakdown {
  const monthlyBase = annualCTC / 12;

  // Standard salary structure (% of monthly CTC)
  const basePay = Math.round(monthlyBase * 0.50);
  const hra = Math.round(monthlyBase * 0.20);
  const da = Math.round(monthlyBase * 0.10);
  const specialAllowance = Math.round(monthlyBase * 0.20);
  const grossSalary = basePay + hra + da + specialAllowance + bonus;

  // PF: 12% of base pay, capped at ₹15,000 wage ceiling
  const pfWage = Math.min(basePay, INDIA_TAX.PF_WAGE_CEILING);
  const pfDeduction = Math.round(pfWage * INDIA_TAX.PF_EMPLOYEE_RATE);

  // ESI: 0.75% of gross, only if gross <= ₹21,000
  const esiDeduction = grossSalary <= INDIA_TAX.ESI_WAGE_CEILING
    ? Math.round(grossSalary * INDIA_TAX.ESI_EMPLOYEE_RATE)
    : 0;

  // Professional Tax (monthly, max ₹200/month or ₹2,500/year)
  const professionalTax = grossSalary > 15000 ? 200 : grossSalary > 10000 ? 150 : 0;

  // TDS — monthly estimate using New Tax Regime
  const tds = calculateMonthlyTDS(annualCTC);

  const totalDeductions = pfDeduction + esiDeduction + professionalTax + tds;
  const netSalary = grossSalary - totalDeductions;

  return {
    basePay, hra, da, specialAllowance, bonus, grossSalary,
    pfDeduction, esiDeduction, professionalTax, tds, otherDeductions: 0,
    totalDeductions, netSalary: Math.round(netSalary),
  };
}

export function calculateMonthlyTDS(annualIncome: number, regime: "OLD" | "NEW" = "NEW"): number {
  const slabs = regime === "NEW" ? INDIA_TAX.NEW_REGIME_SLABS : INDIA_TAX.OLD_REGIME_SLABS;
  let tax = 0;

  for (const slab of slabs) {
    if (annualIncome <= slab.min) break;
    const taxableInSlab = Math.min(annualIncome, slab.max === Infinity ? annualIncome : slab.max) - slab.min;
    if (taxableInSlab > 0) tax += taxableInSlab * slab.rate;
  }

  // Standard deduction of ₹75,000 under new regime
  if (regime === "NEW") {
    const adjustedIncome = Math.max(0, annualIncome - 75000);
    tax = 0;
    for (const slab of slabs) {
      if (adjustedIncome <= slab.min) break;
      const taxableInSlab = Math.min(adjustedIncome, slab.max === Infinity ? adjustedIncome : slab.max) - slab.min;
      if (taxableInSlab > 0) tax += taxableInSlab * slab.rate;
    }
  }

  // 4% Health & Education Cess
  tax = Math.round(tax * 1.04);

  // Section 87A rebate if income <= ₹7,00,000 (new regime)
  if (regime === "NEW" && annualIncome <= 700000) tax = 0;

  return Math.round(tax / 12);
}

// ══════════════════════════════════════════════════════════════
// Employee Service
// ══════════════════════════════════════════════════════════════

export class EmployeeService {
  static async list(params: {
    page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc";
    search?: string; department?: string; employmentType?: string;
  }) {
    const where: Prisma.EmployeeWhereInput = {};
    if (params.search) {
      where.OR = [
        { employeeCode: { contains: params.search, mode: "insensitive" } },
        { designation: { contains: params.search, mode: "insensitive" } },
        { user: { firstName: { contains: params.search, mode: "insensitive" } } },
        { user: { lastName: { contains: params.search, mode: "insensitive" } } },
        { user: { email: { contains: params.search, mode: "insensitive" } } },
      ];
    }
    if (params.department) where.department = params.department;
    if (params.employmentType) where.employmentType = params.employmentType as any;

    const [data, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
        },
      }),
      prisma.employee.count({ where }),
    ]);
    return { data, total };
  }

  static async getById(id: string) {
    return prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, phone: true, avatarUrl: true } },
        salarySlips: { orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 },
        expenseClaims: { orderBy: { createdAt: "desc" }, take: 10, include: { _count: { select: { items: true } } } },
        taxDeclarations: { orderBy: { financialYear: "desc" }, take: 3 },
        leaveRecords: { orderBy: { startDate: "desc" }, take: 20 },
      },
    });
  }

  static async create(data: any, actorId: string) {
    const count = await prisma.employee.count();
    const employeeCode = generateCode(EMPLOYEE_CODE_PREFIX, count + 1);

    const employee = await prisma.employee.create({
      data: {
        ...data,
        employeeCode,
        dateOfJoining: new Date(data.dateOfJoining),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    await createAuditLog({ userId: actorId, action: "CREATE", entity: "Employee", entityId: employee.id, newValue: { employeeCode, designation: data.designation } });
    return employee;
  }

  static async update(id: string, data: any, actorId: string) {
    const employee = await prisma.employee.update({
      where: { id },
      data: { ...data, dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : undefined },
    });
    await createAuditLog({ userId: actorId, action: "UPDATE", entity: "Employee", entityId: id });
    return employee;
  }

  static async getDashboard() {
    const [totalEmployees, byDepartment, byType, recentJoiners, pendingExpenses, thisMonthPayroll] = await Promise.all([
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.employee.groupBy({ by: ["department"], _count: { id: true }, where: { dateOfLeaving: null } }),
      prisma.employee.groupBy({ by: ["employmentType"], _count: { id: true }, where: { dateOfLeaving: null } }),
      prisma.employee.findMany({
        where: { dateOfLeaving: null },
        orderBy: { dateOfJoining: "desc" },
        take: 5,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.expenseClaim.count({ where: { status: "SUBMITTED" } }),
      prisma.salarySlip.aggregate({
        where: { month: new Date().getMonth() + 1, year: new Date().getFullYear(), isPaid: false },
        _sum: { netSalary: true },
        _count: { id: true },
      }),
    ]);

    return { totalEmployees, byDepartment, byType, recentJoiners, pendingExpenses, thisMonthPayroll };
  }
}

// ══════════════════════════════════════════════════════════════
// Payroll Service
// ══════════════════════════════════════════════════════════════

export class PayrollService {
  static async generateSlip(employeeId: string, month: number, year: number, bonus: number, actorId: string) {
    const existing = await prisma.salarySlip.findUnique({
      where: { employeeId_month_year: { employeeId, month, year } },
    });
    if (existing) throw new Error("Salary slip already exists for this period");

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error("Employee not found");

    const salary = calculateMonthlySalary(Number(employee.baseSalary), bonus);

    const slip = await prisma.salarySlip.create({
      data: {
        employeeId, month, year,
        basePay: salary.basePay, hra: salary.hra, da: salary.da,
        specialAllowance: salary.specialAllowance, bonus: salary.bonus,
        grossSalary: salary.grossSalary, pfDeduction: salary.pfDeduction,
        esiDeduction: salary.esiDeduction, professionalTax: salary.professionalTax,
        tds: salary.tds, totalDeductions: salary.totalDeductions,
        netSalary: salary.netSalary, currency: employee.currency,
      },
    });

    await createAuditLog({ userId: actorId, action: "CREATE", entity: "SalarySlip", entityId: slip.id });
    return slip;
  }

  static async bulkGenerate(month: number, year: number, actorId: string) {
    const employees = await prisma.employee.findMany({ where: { dateOfLeaving: null } });
    const results = { generated: 0, skipped: 0, errors: 0 };

    for (const emp of employees) {
      try {
        const existing = await prisma.salarySlip.findUnique({
          where: { employeeId_month_year: { employeeId: emp.id, month, year } },
        });
        if (existing) { results.skipped++; continue; }

        const salary = calculateMonthlySalary(Number(emp.baseSalary));
        await prisma.salarySlip.create({
          data: {
            employeeId: emp.id, month, year,
            basePay: salary.basePay, hra: salary.hra, da: salary.da,
            specialAllowance: salary.specialAllowance, bonus: salary.bonus,
            grossSalary: salary.grossSalary, pfDeduction: salary.pfDeduction,
            esiDeduction: salary.esiDeduction, professionalTax: salary.professionalTax,
            tds: salary.tds, totalDeductions: salary.totalDeductions,
            netSalary: salary.netSalary, currency: emp.currency,
          },
        });
        results.generated++;
      } catch { results.errors++; }
    }

    await createAuditLog({ userId: actorId, action: "CREATE", entity: "SalarySlip", metadata: { month, year, ...results } });
    return results;
  }

  static async getSlips(employeeId: string) {
    return prisma.salarySlip.findMany({
      where: { employeeId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  }

  static async markPaid(slipId: string, actorId: string) {
    const slip = await prisma.salarySlip.update({
      where: { id: slipId },
      data: { isPaid: true, paidAt: new Date() },
    });
    await createAuditLog({ userId: actorId, action: "UPDATE", entity: "SalarySlip", entityId: slipId });
    return slip;
  }

  static previewSalary(annualCTC: number, bonus = 0) {
    return calculateMonthlySalary(annualCTC, bonus);
  }
}

// ══════════════════════════════════════════════════════════════
// Expense Service
// ══════════════════════════════════════════════════════════════

export class ExpenseService {
  static async list(params: { employeeId?: string; status?: string; isRnDExpense?: boolean }) {
    const where: Prisma.ExpenseClaimWhereInput = {};
    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.status) where.status = params.status as any;
    if (params.isRnDExpense !== undefined) where.isRnDExpense = params.isRnDExpense;

    return prisma.expenseClaim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        items: true,
        _count: { select: { items: true } },
      },
    });
  }

  static async create(data: any, actorId: string) {
    const totalAmount = data.items.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
    const count = await prisma.expenseClaim.count();
    const fy = getFinancialYear();
    const claimCode = `${EXPENSE_PREFIX}-${fy.split("-")[0]}-${String(count + 1).padStart(3, "0")}`;

    const claim = await prisma.expenseClaim.create({
      data: {
        employeeId: data.employeeId,
        claimCode,
        title: data.title,
        description: data.description,
        totalAmount,
        isRnDExpense: data.isRnDExpense || false,
        rnDCategory: data.rnDCategory,
        items: {
          create: data.items.map((item: any) => ({
            description: item.description,
            amount: item.amount,
            currency: item.currency || "INR",
            receiptUrl: item.receiptUrl,
            bomItemId: item.bomItemId || null,
            isRnDRelated: item.isRnDRelated || false,
          })),
        },
      },
      include: { items: true },
    });

    // Auto-create R&D tax record
    if (data.isRnDExpense) {
      await prisma.rnDTaxRecord.create({
        data: {
          financialYear: fy,
          category: data.rnDCategory || "COMPONENT_PROCUREMENT",
          description: data.title,
          amount: totalAmount,
          sourceEntity: "expense",
          sourceEntityId: claim.id,
        },
      });
    }

    await createAuditLog({ userId: actorId, action: "CREATE", entity: "ExpenseClaim", entityId: claim.id });
    return claim;
  }

  static async approve(id: string, actorId: string) {
    const claim = await prisma.expenseClaim.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await createAuditLog({ userId: actorId, action: "APPROVE", entity: "ExpenseClaim", entityId: id });
    return claim;
  }

  static async reject(id: string, actorId: string) {
    const claim = await prisma.expenseClaim.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    await createAuditLog({ userId: actorId, action: "REJECT", entity: "ExpenseClaim", entityId: id });
    return claim;
  }

  static async reimburse(id: string, actorId: string) {
    const claim = await prisma.expenseClaim.update({
      where: { id },
      data: { status: "REIMBURSED", reimbursedAt: new Date() },
    });
    await createAuditLog({ userId: actorId, action: "UPDATE", entity: "ExpenseClaim", entityId: id });
    return claim;
  }

  static async getRnDSummary(financialYear?: string) {
    const fy = financialYear || getFinancialYear();
    const records = await prisma.rnDTaxRecord.findMany({
      where: { financialYear: fy },
      orderBy: { createdAt: "desc" },
    });

    const totalByCategory = records.reduce((acc: Record<string, number>, r) => {
      acc[r.category] = (acc[r.category] || 0) + Number(r.amount);
      return acc;
    }, {});

    const grandTotal = records.reduce((sum, r) => sum + Number(r.amount), 0);
    return { financialYear: fy, records, totalByCategory, grandTotal, recordCount: records.length };
  }
}

// ══════════════════════════════════════════════════════════════
// Leave Service
// ══════════════════════════════════════════════════════════════

export class LeaveService {
  static async create(data: any, actorId: string) {
    const record = await prisma.leaveRecord.create({
      data: {
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        totalDays: data.totalDays,
        reason: data.reason,
      },
    });
    await createAuditLog({ userId: actorId, action: "CREATE", entity: "LeaveRecord", entityId: record.id });
    return record;
  }

  static async approve(id: string, approverId: string) {
    const record = await prisma.leaveRecord.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: approverId },
    });
    await createAuditLog({ userId: approverId, action: "APPROVE", entity: "LeaveRecord", entityId: id });
    return record;
  }

  static async reject(id: string, approverId: string) {
    const record = await prisma.leaveRecord.update({
      where: { id },
      data: { status: "REJECTED", approvedBy: approverId },
    });
    await createAuditLog({ userId: approverId, action: "REJECT", entity: "LeaveRecord", entityId: id });
    return record;
  }
}
