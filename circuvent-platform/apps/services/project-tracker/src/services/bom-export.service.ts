// ──────────────────────────────────────────────────────────────
// Project Tracker — BOM Export Service
// Exports Bill of Materials data in CSV and PDF formats,
// with cost rollups, R&D tagging, and supplier summary.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// Lazy-load PDF engine to avoid crashing if not built yet
async function getPDFEngine() {
  try {
    return await import("@circuvent/pdf-engine");
  } catch {
    throw new Error("PDF engine not available. Build @circuvent/pdf-engine first.");
  }
}

export interface BOMExportOptions {
  revisionId: string;
  format: "csv" | "pdf" | "json";
  includeRnDOnly?: boolean;
  groupByCategory?: boolean;
  groupBySupplier?: boolean;
}

export class BOMExportService {
  static async exportCSV(revisionId: string, includeRnDOnly = false): Promise<string> {
    const items = await this.getItems(revisionId, includeRnDOnly);
    const revision = await prisma.hardwareRevision.findUnique({
      where: { id: revisionId },
      include: { project: { select: { name: true, code: true } } },
    });

    const headers = [
      "Part Number", "Part Name", "Description", "Manufacturer", "Supplier",
      "Quantity", "Unit Price", "Currency", "Total Cost", "Lead Time (Days)",
      "Category", "R&D Component",
    ];

    const rows = items.map((item: any) => [
      item.partNumber,
      `"${item.partName}"`,
      `"${item.description || ""}"`,
      item.manufacturer || "",
      item.supplier || "",
      item.quantity,
      Number(item.unitPrice).toFixed(4),
      item.currency,
      (Number(item.unitPrice) * item.quantity).toFixed(2),
      item.leadTimeDays || "",
      item.category || "",
      item.isRnDComponent ? "Yes" : "No",
    ]);

    const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.unitPrice) * i.quantity, 0);

    let csv = `# BOM Export — ${revision?.project.name || "Unknown"} (${revision?.project.code || ""})
# Revision: ${revision?.revisionCode || revisionId}
# Generated: ${new Date().toISOString()}
# Total Items: ${items.length}
# Total Cost: ${totalCost.toFixed(2)}
\n`;

    csv += headers.join(",") + "\n";
    csv += rows.map((r: any) => r.join(",")).join("\n");
    csv += `\n\n# Summary\n# Total Items: ${items.length}\n# Total Cost: ${totalCost.toFixed(2)}\n`;

    return csv;
  }

  static async exportPDF(revisionId: string, userId: string): Promise<{ buffer: Buffer; checksum: string; filename: string }> {
    const revision = await prisma.hardwareRevision.findUnique({
      where: { id: revisionId },
      include: {
        project: { select: { name: true, code: true } },
        bomItems: { orderBy: { partNumber: "asc" } },
      },
    });

    if (!revision) throw new Error("Revision not found");

    const items = revision.bomItems;
    const totalCost = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
    const rndCost = items.filter((i) => i.isRnDComponent).reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);

    // Group by category
    const byCategory: Record<string, { count: number; cost: number }> = {};
    for (const item of items) {
      const cat = item.category || "Other";
      if (!byCategory[cat]) byCategory[cat] = { count: 0, cost: 0 };
      byCategory[cat].count += 1;
      byCategory[cat].cost += Number(item.unitPrice) * item.quantity;
    }

    const columns: any[] = [
      { header: "Part #", key: "partNumber", width: 70 },
      { header: "Part Name", key: "partName", width: 130 },
      { header: "Mfr", key: "manufacturer", width: 80 },
      { header: "Qty", key: "quantity", width: 40, align: "center" },
      { header: "Unit Price", key: "unitPrice", width: 70, align: "right", format: (v) => `₹${Number(v).toFixed(2)}` },
      { header: "Total", key: "total", width: 80, align: "right", format: (v) => `₹${Number(v).toFixed(2)}` },
      { header: "R&D", key: "isRnD", width: 30, align: "center" },
    ];

    const tableData = items.map((i) => ({
      partNumber: i.partNumber,
      partName: i.partName,
      manufacturer: i.manufacturer || "—",
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      total: Number(i.unitPrice) * i.quantity,
      isRnD: i.isRnDComponent ? "✓" : "",
    }));

    const pdfEngine = await getPDFEngine();
    const { buffer, checksum } = await pdfEngine.generateReportPDF({
      title: `Bill of Materials — ${revision.revisionCode}`,
      subtitle: `${revision.project.name} (${revision.project.code})`,
      generatedBy: userId,
      summary: [
        { label: "Revision", value: revision.revisionCode },
        { label: "Project", value: revision.project.name },
        { label: "Total Items", value: String(items.length) },
        { label: "Total Cost", value: `₹${totalCost.toLocaleString("en-IN")}` },
        { label: "R&D Cost", value: `₹${rndCost.toLocaleString("en-IN")}` },
        { label: "R&D %", value: `${totalCost > 0 ? Math.round((rndCost / totalCost) * 100) : 0}%` },
      ],
      sections: [
        { title: "BOM Items", type: "table", columns, data: tableData },
        {
          title: "Category Summary",
          type: "table",
          columns: [
            { header: "Category", key: "category", width: 200 },
            { header: "Items", key: "count", width: 60, align: "center" },
            { header: "Cost", key: "cost", width: 100, align: "right", format: (v: any) => `₹${Number(v).toLocaleString("en-IN")}` },
          ],
          data: Object.entries(byCategory).map(([category, data]) => ({ category, ...data })),
        },
      ],
    });

    await createAuditLog({
      userId,
      action: "EXPORT",
      entity: "BOMItem",
      entityId: revisionId,
      newValue: { format: "PDF", itemCount: items.length, totalCost },
    });

    const filename = `BOM_${revision.project.code}_${revision.revisionCode}.pdf`;
    return { buffer, checksum, filename };
  }

  static async exportJSON(revisionId: string): Promise<any> {
    const revision = await prisma.hardwareRevision.findUnique({
      where: { id: revisionId },
      include: {
        project: { select: { name: true, code: true } },
        bomItems: { orderBy: { partNumber: "asc" } },
      },
    });

    if (!revision) throw new Error("Revision not found");

    return {
      revision: {
        code: revision.revisionCode,
        title: revision.title,
        status: revision.status,
        project: revision.project,
      },
      items: revision.bomItems.map((i) => ({
        partNumber: i.partNumber,
        partName: i.partName,
        description: i.description,
        manufacturer: i.manufacturer,
        supplier: i.supplier,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        totalCost: Number(i.unitPrice) * i.quantity,
        currency: i.currency,
        leadTimeDays: i.leadTimeDays,
        category: i.category,
        isRnDComponent: i.isRnDComponent,
      })),
      summary: {
        totalItems: revision.bomItems.length,
        totalCost: revision.bomItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0),
        rndItemCount: revision.bomItems.filter((i) => i.isRnDComponent).length,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  private static async getItems(revisionId: string, rndOnly: boolean) {
    const where: any = { revisionId };
    if (rndOnly) where.isRnDComponent = true;
    return prisma.bOMItem.findMany({ where, orderBy: { partNumber: "asc" } });
  }
}
