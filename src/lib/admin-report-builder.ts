// Custom Report Builder — pick dimensions + a date range from the data
// already available (orders) and get a CSV, without waiting for a
// purpose-built report. Complements the existing fixed ReportsPanel instead
// of replacing it.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listOrders } from "./store";

export type ReportDimension = "orderNo" | "date" | "customerEmail" | "status" | "paymentMethod" | "total" | "itemsCount";

export interface SavedReport {
  id: string;
  name: string;
  dimensions: ReportDimension[];
  fromDate?: string;
  toDate?: string;
  createdAt: string;
}

const store = createFileStore<{ reports: SavedReport[] }>("admin-report-builder.json", () => ({ reports: [] }));

export function listSavedReports(): SavedReport[] {
  return store.read().reports;
}

export function saveReport(input: Omit<SavedReport, "id" | "createdAt">): SavedReport {
  return store.mutate((db) => {
    const report: SavedReport = { ...input, id: shortId("rpt"), createdAt: new Date().toISOString() };
    db.reports.unshift(report);
    return report;
  });
}

export function deleteReport(id: string): boolean {
  return store.mutate((db) => {
    const before = db.reports.length;
    db.reports = db.reports.filter((r) => r.id !== id);
    return db.reports.length < before;
  });
}

/** Runs a report definition against live order data and returns row objects. */
export function runReport(dimensions: ReportDimension[], fromDate?: string, toDate?: string): Record<string, string | number>[] {
  let orders = listOrders();
  if (fromDate) orders = orders.filter((o) => o.placedAt >= fromDate);
  if (toDate) orders = orders.filter((o) => o.placedAt <= toDate);

  return orders.map((o) => {
    const row: Record<string, string | number> = {};
    for (const d of dimensions) {
      switch (d) {
        case "orderNo": row.orderNo = o.orderNo; break;
        case "date": row.date = o.placedAt; break;
        case "customerEmail": row.customerEmail = o.customer.email || ""; break;
        case "status": row.status = o.status; break;
        case "paymentMethod": row.paymentMethod = o.paymentMethod; break;
        case "total": row.total = o.total; break;
        case "itemsCount": row.itemsCount = o.items.reduce((s, i) => s + i.qty, 0); break;
      }
    }
    return row;
  });
}
