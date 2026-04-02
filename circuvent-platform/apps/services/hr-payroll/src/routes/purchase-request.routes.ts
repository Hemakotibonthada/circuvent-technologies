// ──────────────────────────────────────────────────────────────────────────────
// Material / Purchase Request Routes
// Full lifecycle: Draft → Submit → Manager Approve → Finance Approve →
//                 Ordered → Delivered → Bill Submitted → Reimbursed
// Auto-approval for REIMBURSEMENT < 5000, auto FundTransaction on approval
// ──────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate next sequential PR number: PR-YYYY-NNN */
async function generateRequestNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;

  const last = await prisma.purchaseRequest.findFirst({
    where: { requestNumber: { startsWith: prefix } },
    orderBy: { requestNumber: "desc" },
    select: { requestNumber: true },
  });

  let seq = 1;
  if (last) {
    const parts = last.requestNumber.split("-");
    seq = parseInt(parts[2], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** Recalculate total amount from items */
async function recalcTotalAmount(purchaseRequestId: string): Promise<number> {
  const items = await prisma.purchaseItem.findMany({
    where: { purchaseRequestId },
    select: { totalPrice: true },
  });
  const total = items.reduce((sum, i) => sum + i.totalPrice, 0);
  await prisma.purchaseRequest.update({
    where: { id: purchaseRequestId },
    data: { totalAmount: total },
  });
  return total;
}

/** Resolve employee record from JWT user payload */
async function resolveEmployee(req: Request) {
  const userId = (req as any).user?.userId;
  if (!userId) return null;
  return prisma.employee.findUnique({
    where: { userId },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, department: true } } },
  });
}

// ─── GET /purchase-requests/dashboard ────────────────────────────────────────
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCount,
      byStatus,
      byDepartment,
      allRequests,
      thisMonthRequests,
      pendingCount,
    ] = await Promise.all([
      prisma.purchaseRequest.count(),
      prisma.purchaseRequest.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.purchaseRequest.groupBy({ by: ["department"], _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.purchaseRequest.findMany({ select: { totalAmount: true, status: true } }),
      prisma.purchaseRequest.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { totalAmount: true },
      }),
      prisma.purchaseRequest.count({
        where: { status: { in: ["SUBMITTED", "MANAGER_APPROVED"] } },
      }),
    ]);

    const totalSpend = allRequests
      .filter((r) => !["DRAFT", "REJECTED", "CANCELLED"].includes(r.status))
      .reduce((s, r) => s + r.totalAmount, 0);

    const thisMonthSpend = thisMonthRequests.reduce((s, r) => s + r.totalAmount, 0);

    const statusBreakdown: Record<string, number> = {};
    byStatus.forEach((g) => { statusBreakdown[g.status] = g._count.id; });

    const departmentBreakdown = byDepartment.map((g) => ({
      department: g.department,
      count: g._count.id,
      totalAmount: g._sum.totalAmount ?? 0,
    }));

    res.json({
      success: true,
      data: {
        totalCount,
        totalSpend,
        thisMonthSpend,
        pendingCount,
        statusBreakdown,
        departmentBreakdown,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to load dashboard" });
  }
});

// ─── GET /purchase-requests/pending-approvals ────────────────────────────────
router.get("/pending-approvals", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userRole = employee.user.role;
    let statusFilter: string[] = [];

    if (["ADMIN", "SUPER_ADMIN", "CEO", "HR_MANAGER"].includes(userRole)) {
      statusFilter = ["SUBMITTED", "MANAGER_APPROVED"];
    } else if (userRole === "MANAGER") {
      statusFilter = ["SUBMITTED"];
    } else {
      statusFilter = ["SUBMITTED", "MANAGER_APPROVED"];
    }

    const requests = await prisma.purchaseRequest.findMany({
      where: { status: { in: statusFilter as any } },
      include: {
        items: true,
        approvals: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    // For managers, only show their department's requests
    let filtered = requests;
    if (userRole === "MANAGER") {
      filtered = requests.filter((r) => r.department === employee.department);
    }

    res.json({ success: true, data: filtered, count: filtered.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch pending approvals" });
  }
});

// ─── GET /purchase-requests/my ───────────────────────────────────────────────
router.get("/my", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where: any = { employeeId: employee.id };
    if (req.query.status) where.status = req.query.status;

    const [requests, total] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where,
        include: { items: true, approvals: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.purchaseRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch your requests" });
  }
});

// ─── GET /purchase-requests ──────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.department) where.department = req.query.department;
    if (req.query.purchaseType) where.purchaseType = req.query.purchaseType;
    if (req.query.employeeId) where.employeeId = req.query.employeeId;
    if (req.query.urgency) where.urgency = req.query.urgency;
    if (req.query.search) {
      where.OR = [
        { title: { contains: req.query.search as string, mode: "insensitive" } },
        { requestNumber: { contains: req.query.search as string, mode: "insensitive" } },
        { description: { contains: req.query.search as string, mode: "insensitive" } },
      ];
    }

    const [requests, total] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where,
        include: {
          items: true,
          approvals: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.purchaseRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch purchase requests" });
  }
});

// ─── GET /purchase-requests/:id ──────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        approvals: { orderBy: { createdAt: "desc" } },
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!request) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    // Resolve employee & approver names for display
    const employeeIds = new Set<string>();
    employeeIds.add(request.employeeId);
    request.approvals.forEach((a) => employeeIds.add(a.approverId));
    if (request.managerApprovedBy) employeeIds.add(request.managerApprovedBy);
    if (request.financeApprovedBy) employeeIds.add(request.financeApprovedBy);
    if (request.rejectedBy) employeeIds.add(request.rejectedBy);

    const employees = await prisma.employee.findMany({
      where: { id: { in: Array.from(employeeIds) } },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    const employeeMap: Record<string, any> = {};
    employees.forEach((e) => {
      employeeMap[e.id] = {
        id: e.id,
        employeeCode: e.employeeCode,
        name: `${e.user.firstName} ${e.user.lastName}`,
        email: e.user.email,
      };
    });

    res.json({
      success: true,
      data: {
        ...request,
        employee: employeeMap[request.employeeId] || null,
        approvalDetails: request.approvals.map((a) => ({
          ...a,
          approver: employeeMap[a.approverId] || null,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch purchase request" });
  }
});

// ─── POST /purchase-requests ─────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized — employee record not found" });
      return;
    }

    const {
      title,
      description,
      justification,
      purchaseType,
      urgency,
      vendorName,
      vendorContact,
      expectedDelivery,
      currency,
      items,
    } = req.body;

    if (!title || !justification) {
      res.status(400).json({ success: false, error: "title and justification are required" });
      return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: "At least one item is required" });
      return;
    }

    // Validate items and compute total
    let totalAmount = 0;
    const validatedItems: any[] = [];
    for (const item of items) {
      if (!item.name || !item.category || item.unitPrice == null || item.quantity == null) {
        res.status(400).json({ success: false, error: `Item "${item.name || "unknown"}" is missing required fields (name, category, unitPrice, quantity)` });
        return;
      }
      const qty = Math.max(1, parseInt(item.quantity));
      const price = parseFloat(item.unitPrice);
      const total = qty * price;
      totalAmount += total;
      validatedItems.push({
        name: item.name,
        description: item.description || null,
        category: item.category,
        quantity: qty,
        unitPrice: price,
        totalPrice: total,
        specifications: item.specifications || null,
        preferredVendor: item.preferredVendor || null,
        alternateVendor: item.alternateVendor || null,
      });
    }

    const requestNumber = await generateRequestNumber();

    const created = await prisma.purchaseRequest.create({
      data: {
        requestNumber,
        employeeId: employee.id,
        department: employee.department,
        purchaseType: purchaseType || "ADVANCE_PURCHASE",
        title,
        description: description || null,
        justification,
        totalAmount,
        currency: currency || "INR",
        urgency: urgency || "NORMAL",
        vendorName: vendorName || null,
        vendorContact: vendorContact || null,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
        status: "DRAFT",
        items: { create: validatedItems },
      },
      include: { items: true },
    });

    // ── Auto-approval: REIMBURSEMENT < 5000 auto-approves at manager level ──
    if (created.purchaseType === "REIMBURSEMENT" && created.totalAmount < 5000) {
      await prisma.$transaction(async (tx) => {
        await tx.purchaseApproval.create({
          data: {
            purchaseRequestId: created.id,
            approverId: employee.id,
            approverRole: "SYSTEM",
            action: "APPROVED",
            comments: "Auto-approved: REIMBURSEMENT under ₹5,000",
            amount: created.totalAmount,
          },
        });
        await tx.purchaseRequest.update({
          where: { id: created.id },
          data: {
            status: "MANAGER_APPROVED",
            managerApprovedBy: employee.id,
            managerApprovedAt: new Date(),
            managerNotes: "Auto-approved: REIMBURSEMENT under ₹5,000",
          },
        });
      });

      const updated = await prisma.purchaseRequest.findUnique({
        where: { id: created.id },
        include: { items: true, approvals: true },
      });

      res.status(201).json({
        success: true,
        data: updated,
        message: "Purchase request created and auto-approved at manager level (REIMBURSEMENT < ₹5,000)",
      });
      return;
    }

    res.status(201).json({ success: true, data: created, message: "Purchase request created" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to create purchase request" });
  }
});

// ─── PUT /purchase-requests/:id ──────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (existing.status !== "DRAFT") {
      res.status(400).json({ success: false, error: "Only DRAFT requests can be edited" });
      return;
    }

    const {
      title,
      description,
      justification,
      purchaseType,
      urgency,
      vendorName,
      vendorContact,
      expectedDelivery,
      currency,
    } = req.body;

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(justification && { justification }),
        ...(purchaseType && { purchaseType }),
        ...(urgency && { urgency }),
        ...(vendorName !== undefined && { vendorName }),
        ...(vendorContact !== undefined && { vendorContact }),
        ...(expectedDelivery !== undefined && { expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null }),
        ...(currency && { currency }),
      },
      include: { items: true },
    });

    res.json({ success: true, data: updated, message: "Purchase request updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to update purchase request" });
  }
});

// ─── POST /purchase-requests/:id/submit ──────────────────────────────────────
router.post("/:id/submit", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (existing.status !== "DRAFT") {
      res.status(400).json({ success: false, error: "Only DRAFT requests can be submitted" });
      return;
    }

    if (existing.items.length === 0) {
      res.status(400).json({ success: false, error: "Cannot submit a request with no items" });
      return;
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: "SUBMITTED" },
      include: { items: true, approvals: true },
    });

    // In a real system, we'd fire a notification to the manager here
    // e.g., eventBus.emit("purchase-request.submitted", { requestId: updated.id, department: updated.department });

    res.json({ success: true, data: updated, message: "Purchase request submitted for approval" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to submit purchase request" });
  }
});

// ─── POST /purchase-requests/:id/items ───────────────────────────────────────
router.post("/:id/items", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (existing.status !== "DRAFT") {
      res.status(400).json({ success: false, error: "Items can only be added to DRAFT requests" });
      return;
    }

    const { name, description, category, quantity, unitPrice, specifications, preferredVendor, alternateVendor } = req.body;

    if (!name || !category || unitPrice == null) {
      res.status(400).json({ success: false, error: "name, category, and unitPrice are required" });
      return;
    }

    const qty = Math.max(1, parseInt(quantity || "1"));
    const price = parseFloat(unitPrice);
    const totalPrice = qty * price;

    const item = await prisma.purchaseItem.create({
      data: {
        purchaseRequestId: req.params.id,
        name,
        description: description || null,
        category,
        quantity: qty,
        unitPrice: price,
        totalPrice,
        specifications: specifications || null,
        preferredVendor: preferredVendor || null,
        alternateVendor: alternateVendor || null,
      },
    });

    const newTotal = await recalcTotalAmount(req.params.id);

    res.status(201).json({
      success: true,
      data: item,
      totalAmount: newTotal,
      message: "Item added to purchase request",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to add item" });
  }
});

// ─── PUT /purchase-requests/:id/items/:itemId ────────────────────────────────
router.put("/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status !== "DRAFT") {
      res.status(400).json({ success: false, error: "Items can only be updated on DRAFT requests" });
      return;
    }

    const item = await prisma.purchaseItem.findFirst({
      where: { id: req.params.itemId, purchaseRequestId: req.params.id },
    });
    if (!item) {
      res.status(404).json({ success: false, error: "Item not found in this request" });
      return;
    }

    const { name, description, category, quantity, unitPrice, specifications, preferredVendor, alternateVendor } = req.body;

    const qty = quantity != null ? Math.max(1, parseInt(quantity)) : item.quantity;
    const price = unitPrice != null ? parseFloat(unitPrice) : item.unitPrice;
    const totalPrice = qty * price;

    const updated = await prisma.purchaseItem.update({
      where: { id: req.params.itemId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        quantity: qty,
        unitPrice: price,
        totalPrice,
        ...(specifications !== undefined && { specifications }),
        ...(preferredVendor !== undefined && { preferredVendor }),
        ...(alternateVendor !== undefined && { alternateVendor }),
      },
    });

    const newTotal = await recalcTotalAmount(req.params.id);

    res.json({ success: true, data: updated, totalAmount: newTotal, message: "Item updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to update item" });
  }
});

// ─── DELETE /purchase-requests/:id/items/:itemId ─────────────────────────────
router.delete("/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status !== "DRAFT") {
      res.status(400).json({ success: false, error: "Items can only be removed from DRAFT requests" });
      return;
    }

    const item = await prisma.purchaseItem.findFirst({
      where: { id: req.params.itemId, purchaseRequestId: req.params.id },
    });
    if (!item) {
      res.status(404).json({ success: false, error: "Item not found in this request" });
      return;
    }

    await prisma.purchaseItem.delete({ where: { id: req.params.itemId } });
    const newTotal = await recalcTotalAmount(req.params.id);

    res.json({ success: true, totalAmount: newTotal, message: "Item removed" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to remove item" });
  }
});

// ─── POST /purchase-requests/:id/manager-approve ─────────────────────────────
router.post("/:id/manager-approve", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userRole = employee.user.role;
    if (!["MANAGER", "HR_MANAGER", "ADMIN", "SUPER_ADMIN", "CEO"].includes(userRole)) {
      res.status(403).json({ success: false, error: "Insufficient permissions for manager approval" });
      return;
    }

    const existing = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (existing.status !== "SUBMITTED") {
      res.status(400).json({ success: false, error: `Cannot manager-approve a request in ${existing.status} status` });
      return;
    }

    const { comments, approvedAmount } = req.body;

    await prisma.$transaction(async (tx) => {
      await tx.purchaseApproval.create({
        data: {
          purchaseRequestId: existing.id,
          approverId: employee.id,
          approverRole: userRole,
          action: "APPROVED",
          comments: comments || null,
          amount: approvedAmount ?? existing.totalAmount,
        },
      });

      await tx.purchaseRequest.update({
        where: { id: existing.id },
        data: {
          status: "MANAGER_APPROVED",
          managerApprovedBy: employee.id,
          managerApprovedAt: new Date(),
          managerNotes: comments || null,
        },
      });
    });

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: existing.id },
      include: { items: true, approvals: { orderBy: { createdAt: "desc" } } },
    });

    // Notify finance if amount > 25000
    if (existing.totalAmount > 25000) {
      // eventBus.emit("purchase-request.needs-finance-approval", { requestId: existing.id, amount: existing.totalAmount });
      console.log(`[PR] Request ${existing.requestNumber} exceeds ₹25,000 — finance approval required`);
    }

    res.json({
      success: true,
      data: updated,
      message: existing.totalAmount > 25000
        ? "Manager approved — forwarded to finance for approval"
        : "Manager approved",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to approve" });
  }
});

// ─── POST /purchase-requests/:id/finance-approve ─────────────────────────────
router.post("/:id/finance-approve", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userRole = employee.user.role;
    if (!["ADMIN", "SUPER_ADMIN", "CEO", "HR_MANAGER"].includes(userRole)) {
      res.status(403).json({ success: false, error: "Insufficient permissions for finance approval" });
      return;
    }

    const existing = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (existing.status !== "MANAGER_APPROVED") {
      res.status(400).json({ success: false, error: `Cannot finance-approve a request in ${existing.status} status` });
      return;
    }

    const { comments, approvedAmount, fundId } = req.body;
    const approvedAmt = approvedAmount ?? existing.totalAmount;

    await prisma.$transaction(async (tx) => {
      // 1. Create approval record
      await tx.purchaseApproval.create({
        data: {
          purchaseRequestId: existing.id,
          approverId: employee.id,
          approverRole: "FINANCE",
          action: "APPROVED",
          comments: comments || null,
          amount: approvedAmt,
        },
      });

      // 2. Update request status
      await tx.purchaseRequest.update({
        where: { id: existing.id },
        data: {
          status: "FINANCE_APPROVED",
          financeApprovedBy: employee.id,
          financeApprovedAt: new Date(),
          financeNotes: comments || null,
        },
      });

      // 3. KEY AUTOMATION: Auto-create FundTransaction (DEBIT) from the relevant fund
      if (fundId) {
        const fund = await tx.fund.findUnique({ where: { id: fundId } });
        if (fund) {
          const balanceBefore = fund.remainingAmount;
          const balanceAfter = balanceBefore - approvedAmt;

          await tx.fundTransaction.create({
            data: {
              fundId: fund.id,
              transactionType: "DEBIT",
              amount: approvedAmt,
              description: `Purchase Request ${existing.requestNumber}: ${existing.title}`,
              referenceType: "PurchaseRequest",
              referenceId: existing.id,
              purchaseRequestId: existing.id,
              status: "COMPLETED",
              processedBy: employee.id,
              processedAt: new Date(),
              balanceBefore,
              balanceAfter,
              notes: `Finance approved by ${employee.user.firstName} ${employee.user.lastName}`,
            },
          });

          await tx.fund.update({
            where: { id: fund.id },
            data: {
              spentAmount: { increment: approvedAmt },
              remainingAmount: { decrement: approvedAmt },
            },
          });
        }
      }
    });

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: existing.id },
      include: {
        items: true,
        approvals: { orderBy: { createdAt: "desc" } },
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });

    res.json({ success: true, data: updated, message: "Finance approved — funds allocated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to finance-approve" });
  }
});

// ─── POST /purchase-requests/:id/reject ──────────────────────────────────────
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (!["SUBMITTED", "MANAGER_APPROVED"].includes(existing.status)) {
      res.status(400).json({ success: false, error: `Cannot reject a request in ${existing.status} status` });
      return;
    }

    const { reason, comments } = req.body;
    if (!reason) {
      res.status(400).json({ success: false, error: "Rejection reason is required" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchaseApproval.create({
        data: {
          purchaseRequestId: existing.id,
          approverId: employee.id,
          approverRole: employee.user.role,
          action: "REJECTED",
          comments: `${reason}${comments ? ` — ${comments}` : ""}`,
        },
      });

      await tx.purchaseRequest.update({
        where: { id: existing.id },
        data: {
          status: "REJECTED",
          rejectedBy: employee.id,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });
    });

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: existing.id },
      include: { items: true, approvals: { orderBy: { createdAt: "desc" } } },
    });

    res.json({ success: true, data: updated, message: "Purchase request rejected" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to reject" });
  }
});

// ─── POST /purchase-requests/:id/mark-ordered ────────────────────────────────
router.post("/:id/mark-ordered", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (!["FINANCE_APPROVED", "PROCUREMENT_PROCESSING"].includes(existing.status)) {
      res.status(400).json({ success: false, error: `Cannot mark as ordered from ${existing.status} status` });
      return;
    }

    const { vendorName, vendorContact, expectedDelivery, notes } = req.body;

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: {
        status: "ORDERED",
        ...(vendorName && { vendorName }),
        ...(vendorContact && { vendorContact }),
        ...(expectedDelivery && { expectedDelivery: new Date(expectedDelivery) }),
      },
      include: { items: true },
    });

    res.json({ success: true, data: updated, message: "Purchase request marked as ordered" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to mark as ordered" });
  }
});

// ─── POST /purchase-requests/:id/mark-delivered ──────────────────────────────
router.post("/:id/mark-delivered", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (existing.status !== "ORDERED") {
      res.status(400).json({ success: false, error: `Cannot mark as delivered from ${existing.status} status` });
      return;
    }

    const { deliveryNotes } = req.body;

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        deliveryNotes: deliveryNotes || null,
      },
      include: { items: true },
    });

    res.json({ success: true, data: updated, message: "Purchase request marked as delivered" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to mark as delivered" });
  }
});

// ─── POST /purchase-requests/:id/submit-bill ─────────────────────────────────
router.post("/:id/submit-bill", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (!["DELIVERED", "FINANCE_APPROVED", "ORDERED"].includes(existing.status)) {
      res.status(400).json({ success: false, error: `Cannot submit bill from ${existing.status} status` });
      return;
    }

    const { billUrl, billNumber, actualAmount, billDate } = req.body;
    if (!billNumber) {
      res.status(400).json({ success: false, error: "billNumber is required" });
      return;
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: {
        status: "BILL_SUBMITTED",
        billUrl: billUrl || null,
        billNumber,
        billDate: billDate ? new Date(billDate) : new Date(),
        actualAmount: actualAmount != null ? parseFloat(actualAmount) : existing.totalAmount,
      },
      include: { items: true },
    });

    res.json({ success: true, data: updated, message: "Bill submitted successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to submit bill" });
  }
});

// ─── POST /purchase-requests/:id/reimburse ───────────────────────────────────
router.post("/:id/reimburse", async (req: Request, res: Response) => {
  try {
    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const existing = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (!["BILL_SUBMITTED", "FINANCE_APPROVED", "MANAGER_APPROVED"].includes(existing.status)) {
      res.status(400).json({ success: false, error: `Cannot reimburse from ${existing.status} status` });
      return;
    }

    const { fundId, transferRef, notes } = req.body;

    // Get the requesting employee's bank details
    const requestingEmployee = await prisma.employee.findUnique({
      where: { id: existing.employeeId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!requestingEmployee) {
      res.status(404).json({ success: false, error: "Requesting employee not found" });
      return;
    }

    // Find the company's default bank account
    const defaultBankAccount = await prisma.companyBankAccount.findFirst({
      where: { isDefault: true, isActive: true },
    });

    const reimbursementAmount = existing.actualAmount ?? existing.totalAmount;

    await prisma.$transaction(async (tx) => {
      // 1. Create FundTransaction with beneficiary details
      if (fundId) {
        const fund = await tx.fund.findUnique({ where: { id: fundId } });
        if (fund) {
          const balanceBefore = fund.remainingAmount;
          const balanceAfter = balanceBefore - reimbursementAmount;

          await tx.fundTransaction.create({
            data: {
              fundId: fund.id,
              transactionType: "DEBIT",
              amount: reimbursementAmount,
              description: `Reimbursement for ${existing.requestNumber}: ${existing.title}`,
              referenceType: "PurchaseRequest",
              referenceId: existing.id,
              purchaseRequestId: existing.id,
              bankAccount: defaultBankAccount?.accountNumber || null,
              beneficiaryAccount: requestingEmployee.bankAccountNo || null,
              beneficiaryName: `${requestingEmployee.user.firstName} ${requestingEmployee.user.lastName}`,
              transferRef: transferRef || null,
              status: "COMPLETED",
              processedBy: employee.id,
              processedAt: new Date(),
              balanceBefore,
              balanceAfter,
              notes: notes || `Reimbursement processed for employee ${requestingEmployee.employeeCode}`,
            },
          });

          // 2. Update the fund's spentAmount and remainingAmount
          await tx.fund.update({
            where: { id: fund.id },
            data: {
              spentAmount: { increment: reimbursementAmount },
              remainingAmount: { decrement: reimbursementAmount },
            },
          });
        }
      }

      // 3. Set status to REIMBURSED
      await tx.purchaseRequest.update({
        where: { id: existing.id },
        data: {
          status: "REIMBURSED",
          reimbursedAt: new Date(),
          reimbursementRef: transferRef || `REIMB-${Date.now()}`,
        },
      });
    });

    // 4. Notify the employee
    console.log(
      `[PR] Reimbursement processed for ${existing.requestNumber} — ₹${reimbursementAmount} to ${requestingEmployee.user.firstName} ${requestingEmployee.user.lastName} (${requestingEmployee.bankAccountNo || "no bank on file"})`
    );
    // eventBus.emit("purchase-request.reimbursed", { requestId: existing.id, employeeId: existing.employeeId, amount: reimbursementAmount });

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: existing.id },
      include: {
        items: true,
        approvals: { orderBy: { createdAt: "desc" } },
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });

    res.json({
      success: true,
      data: updated,
      message: `Reimbursement of ₹${reimbursementAmount.toLocaleString()} processed to ${requestingEmployee.user.firstName} ${requestingEmployee.user.lastName}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to process reimbursement" });
  }
});

// ─── POST /purchase-requests/:id/cancel ──────────────────────────────────────
router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: { transactions: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase request not found" });
      return;
    }

    if (["REIMBURSED", "CANCELLED"].includes(existing.status)) {
      res.status(400).json({ success: false, error: `Cannot cancel a ${existing.status} request` });
      return;
    }

    const { reason } = req.body;

    await prisma.$transaction(async (tx) => {
      // If funds were already debited, reverse them
      const debitTransactions = existing.transactions.filter(
        (t) => t.transactionType === "DEBIT" && t.status === "COMPLETED"
      );

      for (const txn of debitTransactions) {
        const fund = await tx.fund.findUnique({ where: { id: txn.fundId } });
        if (fund) {
          const balanceBefore = fund.remainingAmount;
          const balanceAfter = balanceBefore + txn.amount;

          await tx.fundTransaction.create({
            data: {
              fundId: fund.id,
              transactionType: "REFUND",
              amount: txn.amount,
              description: `Refund — Cancelled PR ${existing.requestNumber}`,
              referenceType: "PurchaseRequest",
              referenceId: existing.id,
              purchaseRequestId: existing.id,
              status: "COMPLETED",
              processedAt: new Date(),
              balanceBefore,
              balanceAfter,
              notes: reason || "Purchase request cancelled",
            },
          });

          await tx.fund.update({
            where: { id: fund.id },
            data: {
              spentAmount: { decrement: txn.amount },
              remainingAmount: { increment: txn.amount },
            },
          });
        }
      }

      await tx.purchaseRequest.update({
        where: { id: existing.id },
        data: {
          status: "CANCELLED",
          rejectionReason: reason || "Cancelled by user",
        },
      });
    });

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: existing.id },
      include: {
        items: true,
        approvals: { orderBy: { createdAt: "desc" } },
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });

    res.json({ success: true, data: updated, message: "Purchase request cancelled" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to cancel" });
  }
});

export { router as purchaseRequestRouter };
