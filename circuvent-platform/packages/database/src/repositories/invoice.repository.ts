// ──────────────────────────────────────────────────────────────
// Invoice Repository — financial queries, aging report,
// revenue analytics, multi-currency aggregation.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class InvoiceRepository extends BaseRepository<"invoice"> {
  constructor() { super("invoice"); }

  async findByNumber(invoiceNumber: string): Promise<any | null> {
    return this.model.findUnique({
      where: { invoiceNumber },
      include: { lineItems: true, client: true },
    });
  }

  async findByClient(clientId: string, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, { clientId }, {
      client: { select: { companyName: true } },
      _count: { select: { lineItems: true } },
    });
  }

  async findOverdue(): Promise<any[]> {
    return this.model.findMany({
      where: {
        status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] },
        dueDate: { lt: new Date() },
      },
      include: { client: { select: { companyName: true } } },
      orderBy: { dueDate: "asc" },
    });
  }

  async getAgingReport(): Promise<{
    current: { count: number; amount: number };
    thirtyDays: { count: number; amount: number };
    sixtyDays: { count: number; amount: number };
    ninetyDays: { count: number; amount: number };
    overNinety: { count: number; amount: number };
  }> {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const unpaid = await this.model.findMany({
      where: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { totalAmount: true, paidAmount: true, dueDate: true },
    });

    const bucket = (items: any[]) => ({
      count: items.length,
      amount: items.reduce((sum, i) => sum + Number(i.totalAmount) - Number(i.paidAmount), 0),
    });

    return {
      current: bucket(unpaid.filter((i) => i.dueDate >= now)),
      thirtyDays: bucket(unpaid.filter((i) => i.dueDate < now && i.dueDate >= d30)),
      sixtyDays: bucket(unpaid.filter((i) => i.dueDate < d30 && i.dueDate >= d60)),
      ninetyDays: bucket(unpaid.filter((i) => i.dueDate < d60 && i.dueDate >= d90)),
      overNinety: bucket(unpaid.filter((i) => i.dueDate < d90)),
    };
  }

  async getRevenueByMonth(year: number): Promise<{ month: number; revenue: number; collected: number }[]> {
    const months: { month: number; revenue: number; collected: number }[] = [];

    for (let m = 1; m <= 12; m++) {
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 0);

      const result = await this.model.aggregate({
        where: {
          issueDate: { gte: start, lte: end },
          status: { not: "CANCELLED" },
        },
        _sum: { baseCurrencyTotal: true, paidAmount: true },
      });

      months.push({
        month: m,
        revenue: Number(result._sum.baseCurrencyTotal || 0),
        collected: Number(result._sum.paidAmount || 0),
      });
    }

    return months;
  }

  async getRevenueByCurrency(): Promise<{ currency: string; total: number; count: number }[]> {
    const result = await this.model.groupBy({
      by: ["currency"],
      where: { status: { not: "CANCELLED" } },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    return result.map((r: any) => ({
      currency: r.currency,
      total: Number(r._sum.totalAmount || 0),
      count: r._count.id,
    }));
  }

  async getTopClients(limit = 10): Promise<{ clientId: string; companyName: string; totalRevenue: number; invoiceCount: number }[]> {
    const result = await this.prisma.$queryRaw`
      SELECT
        cp."id" AS "clientId",
        cp."companyName",
        SUM(i."baseCurrencyTotal")::numeric AS "totalRevenue",
        COUNT(i."id")::int AS "invoiceCount"
      FROM invoices i
      JOIN client_profiles cp ON i."clientId" = cp."id"
      WHERE i."status" != 'CANCELLED'
      GROUP BY cp."id", cp."companyName"
      ORDER BY "totalRevenue" DESC
      LIMIT ${limit}
    ` as any[];

    return result.map((r: any) => ({
      clientId: r.clientId,
      companyName: r.companyName,
      totalRevenue: Number(r.totalRevenue || 0),
      invoiceCount: r.invoiceCount,
    }));
  }
}

export const invoiceRepository = new InvoiceRepository();
