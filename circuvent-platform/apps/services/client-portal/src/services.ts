// ──────────────────────────────────────────────────────────────
// Client Portal — Service Layer (business logic)
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@circuvent/database";
import { generateCode, INVOICE_PREFIX, getFinancialYear } from "@circuvent/shared";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Client Service
// ══════════════════════════════════════════════════════════════

export class ClientService {
  static async list() {
    return prisma.clientProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { leads: true, invoices: true, projects: true } },
      },
    });
  }

  static async getById(id: string) {
    return prisma.clientProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        leads: { orderBy: { createdAt: "desc" }, take: 20, include: { assignedTo: { select: { firstName: true, lastName: true } } } },
        invoices: { orderBy: { issueDate: "desc" }, take: 20 },
        projects: { include: { project: { select: { id: true, name: true, code: true, status: true } } } },
      },
    });
  }

  static async create(data: any, actorId: string) {
    const client = await prisma.clientProfile.create({
      data,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    await createAuditLog({ userId: actorId, action: "CREATE", entity: "ClientProfile", entityId: client.id });
    return client;
  }

  static async update(id: string, data: any, actorId: string) {
    const client = await prisma.clientProfile.update({ where: { id }, data });
    await createAuditLog({ userId: actorId, action: "UPDATE", entity: "ClientProfile", entityId: id });
    return client;
  }
}

// ══════════════════════════════════════════════════════════════
// Lead Service
// ══════════════════════════════════════════════════════════════

export class LeadService {
  static async list(params: {
    page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc";
    search?: string; status?: string; source?: string; assignedToId?: string;
  }) {
    const where: Prisma.LeadWhereInput = {};
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ];
    }
    if (params.status) where.status = params.status as any;
    if (params.source) where.source = params.source as any;
    if (params.assignedToId) where.assignedToId = params.assignedToId;

    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          client: { select: { id: true, companyName: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { activities: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);
    return { data, total };
  }

  static async create(data: any, createdById: string) {
    const lead = await prisma.lead.create({
      data: {
        ...data,
        createdById,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
      },
      include: {
        client: { select: { companyName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    await createAuditLog({ userId: createdById, action: "CREATE", entity: "Lead", entityId: lead.id });
    return lead;
  }

  static async updateStatus(id: string, status: string, actorId: string) {
    const lead = await prisma.lead.update({ where: { id }, data: { status: status as any } });
    await createAuditLog({ userId: actorId, action: "UPDATE", entity: "Lead", entityId: id, newValue: { status } });
    return lead;
  }

  static async addActivity(leadId: string, data: any) {
    return prisma.leadActivity.create({
      data: {
        leadId,
        type: data.type,
        title: data.title,
        description: data.description,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      },
    });
  }

  static async getPipelineSummary() {
    const pipeline = await prisma.lead.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { estimatedValue: true },
    });

    const totalLeads = pipeline.reduce((sum, s) => sum + s._count.id, 0);
    const totalValue = pipeline.reduce((sum, s) => sum + Number(s._sum.estimatedValue || 0), 0);

    return {
      stages: pipeline.map((s) => ({
        status: s.status,
        count: s._count.id,
        totalValue: Number(s._sum.estimatedValue || 0),
      })),
      totalLeads,
      totalPipelineValue: totalValue,
    };
  }
}

// ══════════════════════════════════════════════════════════════
// Invoice Service
// ══════════════════════════════════════════════════════════════

export class InvoiceService {
  static async list(params: {
    page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc";
    search?: string; status?: string; clientId?: string;
  }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { title: { contains: params.search, mode: "insensitive" } },
      ];
    }
    if (params.status) where.status = params.status as any;
    if (params.clientId) where.clientId = params.clientId;

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          client: { select: { id: true, companyName: true, preferredCurrency: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { lineItems: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);
    return { data, total };
  }

  static async getById(id: string) {
    return prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lineItems: true,
      },
    });
  }

  static async create(data: any, createdById: string) {
    const subtotal = data.lineItems.reduce(
      (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unitPrice), 0
    );
    const taxRate = data.taxRate ?? 18;
    const discount = data.discount || 0;
    const taxAmount = (subtotal - discount) * (taxRate / 100);
    const totalAmount = subtotal - discount + taxAmount;
    const exchangeRate = data.exchangeRate || 1;
    const baseCurrencyTotal = totalAmount * exchangeRate;

    const count = await prisma.invoice.count();
    const fy = getFinancialYear();
    const invoiceNumber = `${INVOICE_PREFIX}-${fy.split("-")[0]}-${String(count + 1).padStart(4, "0")}`;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber, clientId: data.clientId, createdById,
        title: data.title, description: data.description,
        dueDate: new Date(data.dueDate),
        subtotal, taxRate, taxAmount, discount, totalAmount,
        currency: data.currency || "INR", exchangeRate, baseCurrencyTotal,
        notes: data.notes, termsConditions: data.termsConditions,
        lineItems: {
          create: data.lineItems.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: Number(item.quantity) * Number(item.unitPrice),
            taxable: item.taxable !== false,
          })),
        },
      },
      include: { lineItems: true, client: { select: { companyName: true } } },
    });

    await createAuditLog({ userId: createdById, action: "CREATE", entity: "Invoice", entityId: invoice.id, newValue: { invoiceNumber, totalAmount } });
    return invoice;
  }

  static async recordPayment(id: string, amount: number, paymentMethod: string | undefined, paymentRef: string | undefined, actorId: string) {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new Error("Invoice not found");

    const newPaidAmount = Number(existing.paidAmount) + amount;
    const isPaid = newPaidAmount >= Number(existing.totalAmount);

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        paidAmount: newPaidAmount,
        paidAt: isPaid ? new Date() : undefined,
        status: isPaid ? "PAID" : "PARTIALLY_PAID",
        paymentMethod, paymentRef,
      },
    });

    await createAuditLog({ userId: actorId, action: "PAYMENT", entity: "Invoice", entityId: id, newValue: { amount, isPaid } });
    return invoice;
  }

  static async updateStatus(id: string, status: string, actorId: string) {
    const invoice = await prisma.invoice.update({ where: { id }, data: { status: status as any } });
    await createAuditLog({ userId: actorId, action: "UPDATE", entity: "Invoice", entityId: id, newValue: { status } });
    return invoice;
  }

  static async getRevenueDashboard(year?: number) {
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31);

    const [paidInvoices, totalOutstanding, overdueCount, invoicesByStatus] = await Promise.all([
      prisma.invoice.findMany({
        where: { issueDate: { gte: startDate, lte: endDate }, status: { in: ["PAID", "PARTIALLY_PAID"] } },
        select: { baseCurrencyTotal: true, paidAmount: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ["SENT", "VIEWED", "OVERDUE"] } },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.count({ where: { status: "OVERDUE" } }),
      prisma.invoice.groupBy({
        by: ["status"],
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + Number(inv.baseCurrencyTotal), 0);
    const totalCollected = paidInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0);

    return {
      year: targetYear,
      totalRevenue, totalCollected,
      outstanding: Number(totalOutstanding._sum.totalAmount || 0),
      overdueInvoices: overdueCount,
      invoiceCount: paidInvoices.length,
      byStatus: invoicesByStatus,
    };
  }
}
