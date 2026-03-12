// ──────────────────────────────────────────────────────────────
// HR & Payroll — Purchase Automation Service
// Handles purchase requests, multi-level approval routing,
// payment processing, fund debits/credits, budget checks,
// auto-reject expired requests, and spending reports.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type PurchaseStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "MANAGER_APPROVED"
  | "FINANCE_APPROVED"
  | "PROCUREMENT_PROCESSING"
  | "ORDERED"
  | "DELIVERED"
  | "BILL_SUBMITTED"
  | "REIMBURSED"
  | "REJECTED"
  | "CANCELLED";

export type ApproverRole = "MANAGER" | "FINANCE" | "ADMIN" | "CEO";

export interface ApprovalChainStep {
  role: ApproverRole;
  threshold: number;
  required: boolean;
}

export interface PurchaseRequestInput {
  title: string;
  description?: string;
  justification: string;
  urgency?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  category?: string;
  vendorName?: string;
  vendorContact?: string;
  expectedDelivery?: string;
  items: Array<{
    name: string;
    description?: string;
    category?: string;
    quantity: number;
    unitPrice: number;
    specifications?: string;
    preferredVendor?: string;
  }>;
}

export interface PurchaseStats {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalSpent: number;
  avgProcessingTime: number;
  byStatus: Array<{ status: string; count: number }>;
  byDepartment: Array<{ department: string; count: number; totalAmount: number }>;
  byCategory: Array<{ category: string; count: number; totalAmount: number }>;
  recentRequests: any[];
}

export interface SpendingReport {
  startDate: string;
  endDate: string;
  totalSpent: number;
  totalRequests: number;
  byDepartment: Array<{ department: string; totalAmount: number; count: number }>;
  byCategory: Array<{ category: string; totalAmount: number; count: number }>;
  topSpenders: Array<{ employeeId: string; name: string; totalAmount: number; count: number }>;
  monthlyBreakdown: Array<{ month: string; totalAmount: number; count: number }>;
}

// ══════════════════════════════════════════════════════════════
// Approval Chain Thresholds
// ══════════════════════════════════════════════════════════════

const APPROVAL_THRESHOLDS: ApprovalChainStep[] = [
  { role: "MANAGER", threshold: 5000, required: true },
  { role: "FINANCE", threshold: 25000, required: true },
  { role: "CEO", threshold: 100000, required: true },
];

/** Auto-approve threshold — requests under this amount skip approval */
const AUTO_APPROVE_THRESHOLD = 5000;

/** Max age for pending requests before auto-reject (days) */
const MAX_PENDING_DAYS = 30;

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

async function generateRequestNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchaseRequest.count({
    where: { requestNumber: { startsWith: `PR-${year}` } },
  });
  return `PR-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function resolveEmployee(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, department: true } },
    },
  });
  if (!employee) throw new Error(`Employee not found: ${employeeId}`);
  return employee;
}

// ══════════════════════════════════════════════════════════════
// Purchase Automation Service
// ══════════════════════════════════════════════════════════════

export class PurchaseAutomationService {
  /**
   * Create a new purchase request with items and auto-set approval chain
   */
  static async createPurchaseRequest(
    requesterId: string,
    data: PurchaseRequestInput
  ): Promise<any> {
    const employee = await resolveEmployee(requesterId);
    const requestNumber = await generateRequestNumber();

    const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (totalAmount <= 0) throw new Error("Total amount must be positive");

    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        requestNumber,
        employeeId: requesterId,
        department: employee.department,
        title: data.title,
        description: data.description || null,
        justification: data.justification,
        totalAmount,
        urgency: data.urgency || "NORMAL",
        vendorName: data.vendorName || null,
        vendorContact: data.vendorContact || null,
        expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
        status: totalAmount < AUTO_APPROVE_THRESHOLD ? "MANAGER_APPROVED" : "SUBMITTED",
        items: {
          create: data.items.map((item) => ({
            name: item.name,
            description: item.description || null,
            category: item.category || "OTHER",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            specifications: item.specifications || null,
            preferredVendor: item.preferredVendor || null,
          })),
        },
      },
      include: { items: true },
    });

    // Auto-approve for small amounts
    if (totalAmount < AUTO_APPROVE_THRESHOLD) {
      await prisma.purchaseApproval.create({
        data: {
          purchaseRequestId: purchaseRequest.id,
          approverId: "SYSTEM",
          approverRole: "MANAGER",
          action: "APPROVED",
          comments: `Auto-approved: amount ₹${totalAmount.toLocaleString("en-IN")} is below the ₹${AUTO_APPROVE_THRESHOLD.toLocaleString("en-IN")} threshold.`,
          amount: totalAmount,
        },
      });
    }

    await createAuditLog({
      action: "CREATE",
      entity: "PurchaseRequest",
      entityId: purchaseRequest.id,
      userId: employee.userId,
      metadata: { requestNumber, totalAmount, itemCount: data.items.length },
    });

    return purchaseRequest;
  }

  /**
   * Determine which roles need to approve based on amount thresholds
   */
  static getApprovalChain(amount: number): ApprovalChainStep[] {
    if (amount < AUTO_APPROVE_THRESHOLD) return [];
    return APPROVAL_THRESHOLDS.filter((step) => amount >= step.threshold);
  }

  /**
   * Auto-route a purchase request to the next approver in the chain
   */
  static async autoRouteForApproval(purchaseRequestId: string): Promise<{ nextApprover: ApproverRole | null; status: string }> {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseRequestId },
      include: { approvals: true },
    });
    if (!request) throw new Error("Purchase request not found");

    const chain = this.getApprovalChain(request.totalAmount);
    const approvedRoles = new Set(
      request.approvals.filter((a) => a.action === "APPROVED").map((a) => a.approverRole)
    );

    const nextStep = chain.find((step) => !approvedRoles.has(step.role));
    if (!nextStep) {
      // All approvals done
      return { nextApprover: null, status: request.status };
    }

    return { nextApprover: nextStep.role, status: `PENDING_${nextStep.role}_APPROVAL` };
  }

  /**
   * Approve a purchase request — auto-advance to next level
   */
  static async approvePurchaseRequest(
    purchaseRequestId: string,
    approverId: string,
    notes?: string
  ): Promise<any> {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseRequestId },
      include: { approvals: true },
    });
    if (!request) throw new Error("Purchase request not found");
    if (request.status === "REJECTED" || request.status === "CANCELLED") {
      throw new Error(`Cannot approve — request is ${request.status}`);
    }

    // Determine approver's role
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
      select: { role: true, firstName: true, lastName: true },
    });
    if (!approver) throw new Error("Approver not found");

    const approverRole = this.mapUserRoleToApproverRole(approver.role);

    // Record the approval
    await prisma.purchaseApproval.create({
      data: {
        purchaseRequestId,
        approverId,
        approverRole,
        action: "APPROVED",
        comments: notes || null,
        amount: request.totalAmount,
      },
    });

    // Determine next status
    let newStatus: PurchaseStatus;
    const chain = this.getApprovalChain(request.totalAmount);
    const updatedApprovals = [...request.approvals.filter((a) => a.action === "APPROVED").map((a) => a.approverRole), approverRole];

    const allApproved = chain.every((step) => updatedApprovals.includes(step.role));

    if (approverRole === "MANAGER" && !allApproved) {
      newStatus = "MANAGER_APPROVED";
    } else if (approverRole === "FINANCE" && !allApproved) {
      newStatus = "FINANCE_APPROVED";
    } else if (allApproved) {
      newStatus = "PROCUREMENT_PROCESSING";
    } else {
      newStatus = "MANAGER_APPROVED";
    }

    const updateData: any = { status: newStatus };
    if (approverRole === "MANAGER") {
      updateData.managerApprovedBy = approverId;
      updateData.managerApprovedAt = new Date();
      updateData.managerNotes = notes || null;
    } else if (approverRole === "FINANCE") {
      updateData.financeApprovedBy = approverId;
      updateData.financeApprovedAt = new Date();
      updateData.financeNotes = notes || null;
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: updateData,
      include: { items: true, approvals: true },
    });

    await createAuditLog({
      action: "APPROVE",
      entity: "PurchaseRequest",
      entityId: purchaseRequestId,
      userId: approverId,
      metadata: { role: approverRole, newStatus, amount: request.totalAmount },
    });

    return updated;
  }

  /**
   * Reject a purchase request
   */
  static async rejectPurchaseRequest(
    purchaseRequestId: string,
    approverId: string,
    reason: string
  ): Promise<any> {
    const request = await prisma.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
    if (!request) throw new Error("Purchase request not found");
    if (request.status === "REJECTED" || request.status === "CANCELLED") {
      throw new Error(`Request already ${request.status}`);
    }

    const approver = await prisma.user.findUnique({
      where: { id: approverId },
      select: { role: true },
    });
    const approverRole = this.mapUserRoleToApproverRole(approver?.role || "MANAGER");

    await prisma.purchaseApproval.create({
      data: {
        purchaseRequestId,
        approverId,
        approverRole,
        action: "REJECTED",
        comments: reason,
      },
    });

    const updated = await prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: {
        status: "REJECTED",
        rejectedBy: approverId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
      include: { items: true, approvals: true },
    });

    await createAuditLog({
      action: "REJECT",
      entity: "PurchaseRequest",
      entityId: purchaseRequestId,
      userId: approverId,
      metadata: { reason },
    });

    return updated;
  }

  /**
   * Process payment — auto-debit from company bank account
   */
  static async processPayment(purchaseRequestId: string): Promise<any> {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseRequestId },
      include: { items: true },
    });
    if (!request) throw new Error("Purchase request not found");

    // Find default company bank account
    const bankAccount = await prisma.companyBankAccount.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!bankAccount) throw new Error("No default company bank account configured");

    const paymentAmount = request.actualAmount || request.totalAmount;

    // Find the associated fund (departmental or operational)
    const fund = await prisma.fund.findFirst({
      where: {
        OR: [
          { department: request.department, isActive: true },
          { category: "OPERATIONAL", isActive: true },
        ],
      },
      orderBy: { remainingAmount: "desc" },
    });

    if (!fund) throw new Error("No active fund available for this department");
    if (fund.remainingAmount < paymentAmount) {
      throw new Error(`Insufficient fund balance. Available: ₹${fund.remainingAmount.toLocaleString("en-IN")}, Required: ₹${paymentAmount.toLocaleString("en-IN")}`);
    }

    // Create fund transaction (debit)
    const balanceBefore = fund.remainingAmount;
    const balanceAfter = balanceBefore - paymentAmount;

    await prisma.fundTransaction.create({
      data: {
        fundId: fund.id,
        transactionType: "DEBIT",
        amount: paymentAmount,
        description: `Purchase payment: ${request.title} (${request.requestNumber})`,
        referenceType: "PurchaseRequest",
        referenceId: purchaseRequestId,
        purchaseRequestId,
        bankAccount: bankAccount.accountNumber,
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore,
        balanceAfter,
      },
    });

    // Update fund balance
    await prisma.fund.update({
      where: { id: fund.id },
      data: {
        spentAmount: { increment: paymentAmount },
        remainingAmount: { decrement: paymentAmount },
      },
    });

    // Update purchase request status
    const updated = await prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: { status: "REIMBURSED", reimbursedAt: new Date() },
      include: { items: true, approvals: true },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "PurchaseRequest",
      entityId: purchaseRequestId,
      userId: "system",
      metadata: { amount: paymentAmount, fundId: fund.id, bankAccount: bankAccount.accountNumber },
    });

    return updated;
  }

  /**
   * Check budget availability for a department
   */
  static async checkBudgetAvailability(
    departmentId: string,
    amount: number
  ): Promise<{ available: boolean; fundId?: string; balance: number; shortfall: number }> {
    const fund = await prisma.fund.findFirst({
      where: {
        OR: [
          { department: departmentId, isActive: true },
          { category: "OPERATIONAL", isActive: true },
        ],
      },
      orderBy: { remainingAmount: "desc" },
    });

    if (!fund) return { available: false, balance: 0, shortfall: amount };

    const available = fund.remainingAmount >= amount;
    return {
      available,
      fundId: fund.id,
      balance: fund.remainingAmount,
      shortfall: available ? 0 : amount - fund.remainingAmount,
    };
  }

  /**
   * Debit funds for a specific fund
   */
  static async debitFund(
    fundId: string,
    amount: number,
    reference: string
  ): Promise<any> {
    const fund = await prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund) throw new Error("Fund not found");
    if (!fund.isActive) throw new Error("Fund is not active");
    if (fund.remainingAmount < amount) throw new Error("Insufficient fund balance");

    const balanceBefore = fund.remainingAmount;
    const balanceAfter = balanceBefore - amount;

    const transaction = await prisma.fundTransaction.create({
      data: {
        fundId,
        transactionType: "DEBIT",
        amount,
        description: reference,
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore,
        balanceAfter,
      },
    });

    await prisma.fund.update({
      where: { id: fundId },
      data: {
        spentAmount: { increment: amount },
        remainingAmount: { decrement: amount },
      },
    });

    return transaction;
  }

  /**
   * Credit employee account — create fund credit transaction
   */
  static async creditEmployeeAccount(
    employeeId: string,
    amount: number,
    reference: string
  ): Promise<any> {
    const employee = await resolveEmployee(employeeId);

    // Find operational fund for crediting
    const fund = await prisma.fund.findFirst({
      where: { category: "OPERATIONAL", isActive: true },
      orderBy: { remainingAmount: "desc" },
    });
    if (!fund) throw new Error("No operational fund available");

    const transaction = await prisma.fundTransaction.create({
      data: {
        fundId: fund.id,
        transactionType: "DEBIT",
        amount,
        description: `Employee credit: ${employee.user.firstName} ${employee.user.lastName} — ${reference}`,
        referenceType: "EmployeeCredit",
        referenceId: employeeId,
        beneficiaryName: `${employee.user.firstName} ${employee.user.lastName}`,
        beneficiaryAccount: employee.bankAccountNo || undefined,
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore: fund.remainingAmount,
        balanceAfter: fund.remainingAmount - amount,
      },
    });

    await prisma.fund.update({
      where: { id: fund.id },
      data: {
        spentAmount: { increment: amount },
        remainingAmount: { decrement: amount },
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "FundTransaction",
      entityId: transaction.id,
      userId: "system",
      metadata: { employeeId, amount, reference },
    });

    return transaction;
  }

  /**
   * Reconcile payment — mark payment complete, update fund balance
   */
  static async reconcilePayment(purchaseRequestId: string): Promise<any> {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseRequestId },
      include: { transactions: true },
    });
    if (!request) throw new Error("Purchase request not found");

    // Mark all pending transactions as completed
    for (const txn of request.transactions) {
      if (txn.status === "PENDING") {
        await prisma.fundTransaction.update({
          where: { id: txn.id },
          data: { status: "COMPLETED", processedAt: new Date() },
        });
      }
    }

    // Update request status
    const updated = await prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: {
        status: "REIMBURSED",
        reimbursedAt: new Date(),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "PurchaseRequest",
      entityId: purchaseRequestId,
      userId: "system",
      metadata: { totalAmount: request.totalAmount },
    });

    return updated;
  }

  /**
   * Cancel a purchase request
   */
  static async cancelPurchaseRequest(
    purchaseRequestId: string,
    reason: string
  ): Promise<any> {
    const request = await prisma.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
    if (!request) throw new Error("Purchase request not found");

    const cancellableStatuses: PurchaseStatus[] = ["DRAFT", "SUBMITTED", "MANAGER_APPROVED"];
    if (!cancellableStatuses.includes(request.status as PurchaseStatus)) {
      throw new Error(`Cannot cancel — status is ${request.status}`);
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: {
        status: "CANCELLED",
        rejectionReason: reason,
        rejectedAt: new Date(),
      },
    });

    await createAuditLog({
      action: "DELETE",
      entity: "PurchaseRequest",
      entityId: purchaseRequestId,
      userId: "system",
      metadata: { reason },
    });

    return updated;
  }

  /**
   * Get dashboard stats for purchase requests
   */
  static async getPurchaseRequestStats(): Promise<PurchaseStats> {
    const [totalRequests, pendingCount, approvedCount, rejectedCount, byStatus, recentRequests] = await Promise.all([
      prisma.purchaseRequest.count(),
      prisma.purchaseRequest.count({ where: { status: { in: ["SUBMITTED", "MANAGER_APPROVED"] } } }),
      prisma.purchaseRequest.count({ where: { status: { in: ["FINANCE_APPROVED", "PROCUREMENT_PROCESSING", "ORDERED", "DELIVERED", "REIMBURSED"] } } }),
      prisma.purchaseRequest.count({ where: { status: "REJECTED" } }),
      prisma.purchaseRequest.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.purchaseRequest.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, requestNumber: true, title: true, totalAmount: true, status: true, department: true, createdAt: true },
      }),
    ]);

    const totalSpentResult = await prisma.purchaseRequest.aggregate({
      where: { status: { in: ["REIMBURSED", "DELIVERED"] } },
      _sum: { totalAmount: true },
    });

    const byDepartmentRaw = await prisma.purchaseRequest.groupBy({
      by: ["department"],
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    return {
      totalRequests,
      pendingCount,
      approvedCount,
      rejectedCount,
      totalSpent: totalSpentResult._sum.totalAmount || 0,
      avgProcessingTime: 0,
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count.id })),
      byDepartment: byDepartmentRaw.map((g) => ({
        department: g.department,
        count: g._count.id,
        totalAmount: g._sum.totalAmount || 0,
      })),
      byCategory: [],
      recentRequests,
    };
  }

  /**
   * Get pending approvals for a specific approver
   */
  static async getPendingApprovals(approverId: string): Promise<any[]> {
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
      select: { role: true },
    });
    if (!approver) throw new Error("Approver not found");

    const role = this.mapUserRoleToApproverRole(approver.role);
    const statusMap: Record<ApproverRole, PurchaseStatus[]> = {
      MANAGER: ["SUBMITTED"],
      FINANCE: ["MANAGER_APPROVED"],
      CEO: ["FINANCE_APPROVED"],
      ADMIN: ["SUBMITTED", "MANAGER_APPROVED"],
    };

    const pendingStatuses = statusMap[role] || ["SUBMITTED"];

    return prisma.purchaseRequest.findMany({
      where: { status: { in: pendingStatuses } },
      include: {
        items: true,
        approvals: true,
      },
      orderBy: [{ urgency: "desc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Get purchase requests submitted by a requester
   */
  static async getMyPurchaseRequests(requesterId: string): Promise<any[]> {
    return prisma.purchaseRequest.findMany({
      where: { employeeId: requesterId },
      include: {
        items: true,
        approvals: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Add receipt to a purchase request
   */
  static async addReceiptToPurchase(
    purchaseRequestId: string,
    receiptUrl: string,
    actualAmount: number
  ): Promise<any> {
    const request = await prisma.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
    if (!request) throw new Error("Purchase request not found");

    const updated = await prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: {
        billUrl: receiptUrl,
        actualAmount,
        status: "BILL_SUBMITTED",
        billDate: new Date(),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "PurchaseRequest",
      entityId: purchaseRequestId,
      userId: "system",
      metadata: { receiptUrl, actualAmount },
    });

    return updated;
  }

  /**
   * Auto-reject requests that have been pending for more than MAX_PENDING_DAYS
   */
  static async autoRejectExpiredRequests(): Promise<{ rejectedCount: number; rejectedIds: string[] }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_PENDING_DAYS);

    const expiredRequests = await prisma.purchaseRequest.findMany({
      where: {
        status: { in: ["SUBMITTED", "MANAGER_APPROVED"] },
        createdAt: { lt: cutoffDate },
      },
      select: { id: true, requestNumber: true },
    });

    const rejectedIds: string[] = [];
    for (const req of expiredRequests) {
      await prisma.purchaseRequest.update({
        where: { id: req.id },
        data: {
          status: "REJECTED",
          rejectedBy: "SYSTEM",
          rejectedAt: new Date(),
          rejectionReason: `Auto-rejected: request exceeded ${MAX_PENDING_DAYS}-day pending limit.`,
        },
      });

      await prisma.purchaseApproval.create({
        data: {
          purchaseRequestId: req.id,
          approverId: "SYSTEM",
          approverRole: "ADMIN",
          action: "REJECTED",
          comments: `Auto-rejected after ${MAX_PENDING_DAYS} days without full approval.`,
        },
      });

      rejectedIds.push(req.id);
    }

    if (rejectedIds.length > 0) {
      await createAuditLog({
        action: "REJECT",
        entity: "PurchaseRequest",
        entityId: "batch",
        userId: "system",
        metadata: { count: rejectedIds.length, requestIds: rejectedIds },
      });
    }

    return { rejectedCount: rejectedIds.length, rejectedIds };
  }

  /**
   * Generate a spending report for a date range
   */
  static async generatePurchaseReport(
    startDate: string,
    endDate: string
  ): Promise<SpendingReport> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const requests = await prisma.purchaseRequest.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: { in: ["REIMBURSED", "DELIVERED", "BILL_SUBMITTED"] },
      },
      select: {
        id: true,
        employeeId: true,
        department: true,
        totalAmount: true,
        actualAmount: true,
        createdAt: true,
        items: { select: { category: true, totalPrice: true } },
      },
    });

    const totalSpent = requests.reduce((sum, r) => sum + (r.actualAmount || r.totalAmount), 0);

    // By department
    const deptMap = new Map<string, { totalAmount: number; count: number }>();
    for (const r of requests) {
      const current = deptMap.get(r.department) || { totalAmount: 0, count: 0 };
      current.totalAmount += r.actualAmount || r.totalAmount;
      current.count++;
      deptMap.set(r.department, current);
    }

    // By category from items
    const catMap = new Map<string, { totalAmount: number; count: number }>();
    for (const r of requests) {
      for (const item of r.items) {
        const current = catMap.get(item.category) || { totalAmount: 0, count: 0 };
        current.totalAmount += item.totalPrice;
        current.count++;
        catMap.set(item.category, current);
      }
    }

    // Top spenders
    const spenderMap = new Map<string, { totalAmount: number; count: number }>();
    for (const r of requests) {
      const current = spenderMap.get(r.employeeId) || { totalAmount: 0, count: 0 };
      current.totalAmount += r.actualAmount || r.totalAmount;
      current.count++;
      spenderMap.set(r.employeeId, current);
    }

    // Monthly breakdown
    const monthMap = new Map<string, { totalAmount: number; count: number }>();
    for (const r of requests) {
      const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const current = monthMap.get(key) || { totalAmount: 0, count: 0 };
      current.totalAmount += r.actualAmount || r.totalAmount;
      current.count++;
      monthMap.set(key, current);
    }

    return {
      startDate,
      endDate,
      totalSpent,
      totalRequests: requests.length,
      byDepartment: Array.from(deptMap.entries()).map(([department, data]) => ({ department, ...data })),
      byCategory: Array.from(catMap.entries()).map(([category, data]) => ({ category, ...data })),
      topSpenders: Array.from(spenderMap.entries())
        .map(([employeeId, data]) => ({ employeeId, name: employeeId, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10),
      monthlyBreakdown: Array.from(monthMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // ════════════════════════════════════════════════════════════
  // Private Helpers
  // ════════════════════════════════════════════════════════════

  private static mapUserRoleToApproverRole(role: string): ApproverRole {
    switch (role) {
      case "CEO":
        return "CEO";
      case "HR_MANAGER":
      case "ADMIN":
      case "SUPER_ADMIN":
        return "ADMIN";
      case "MANAGER":
      case "PRODUCT_MANAGER":
        return "MANAGER";
      default:
        return "MANAGER";
    }
  }
}
