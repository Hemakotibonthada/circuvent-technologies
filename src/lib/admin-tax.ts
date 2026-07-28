// Tax & GST Compliance Center — HSN/GST rate mappings, a period-based GST
// report generator computed from existing paid orders (listOrders(), read
// only), and a gapless tax-invoice numbering register (common statutory
// requirement, distinct from the shop's own internal ORD-* order numbers).
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listOrders } from "./store";

export interface HsnMapping {
  id: string;
  matchType: "category" | "productId";
  matchValue: string;
  hsnCode: string;
  gstRatePct: number;
  createdAt: string;
}

export interface GstReturnRecord {
  id: string;
  periodLabel: string; // "YYYY-MM"
  ordersCount: number;
  grossSales: number;
  taxableValue: number;
  gstCollected: number;
  generatedAt: string;
}

export interface InvoiceSequenceState {
  prefix: string;
  financialYear: string; // e.g. "2026-27"
  nextNumber: number;
}

interface TaxDB {
  hsnMappings: HsnMapping[];
  gstReturns: GstReturnRecord[];
  invoiceSequence: InvoiceSequenceState;
}

const DEFAULT_GST_RATE = 18;

function currentFinancialYear(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // FY starts April in India
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

const store = createFileStore<TaxDB>("admin-tax.json", () => ({
  hsnMappings: [],
  gstReturns: [],
  invoiceSequence: { prefix: "CVT/GST", financialYear: currentFinancialYear(), nextNumber: 1 },
}));

export function listHsnMappings(): HsnMapping[] {
  return store.read().hsnMappings;
}

export function upsertHsnMapping(input: Partial<HsnMapping> & { matchType: "category" | "productId"; matchValue: string; hsnCode: string; gstRatePct: number }): HsnMapping {
  return store.mutate((db) => {
    const existing = input.id ? db.hsnMappings.find((h) => h.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: HsnMapping = { id: shortId("hsn"), matchType: input.matchType, matchValue: input.matchValue, hsnCode: input.hsnCode, gstRatePct: input.gstRatePct, createdAt: new Date().toISOString() };
    db.hsnMappings.unshift(created);
    return created;
  });
}

export function deleteHsnMapping(id: string): boolean {
  return store.mutate((db) => {
    const before = db.hsnMappings.length;
    db.hsnMappings = db.hsnMappings.filter((h) => h.id !== id);
    return db.hsnMappings.length < before;
  });
}

export function listGstReturns(): GstReturnRecord[] {
  return [...store.read().gstReturns].sort((a, b) => b.periodLabel.localeCompare(a.periodLabel));
}

/** Generates (or regenerates) the GST return for a "YYYY-MM" period from paid orders. */
export function generateGstReport(periodLabel: string): GstReturnRecord {
  const [y, m] = periodLabel.split("-").map(Number);
  const orders = listOrders().filter((o) => {
    if (o.paymentStatus !== "paid") return false;
    const d = new Date(o.placedAt);
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  });
  const grossSales = orders.reduce((s, o) => s + o.total, 0);
  // Orders are stored GST-inclusive; back out the tax at the default rate.
  const taxableValue = grossSales / (1 + DEFAULT_GST_RATE / 100);
  const gstCollected = grossSales - taxableValue;

  return store.mutate((db) => {
    db.gstReturns = db.gstReturns.filter((r) => r.periodLabel !== periodLabel);
    const record: GstReturnRecord = {
      id: shortId("gst"),
      periodLabel,
      ordersCount: orders.length,
      grossSales: Math.round(grossSales * 100) / 100,
      taxableValue: Math.round(taxableValue * 100) / 100,
      gstCollected: Math.round(gstCollected * 100) / 100,
      generatedAt: new Date().toISOString(),
    };
    db.gstReturns.unshift(record);
    return record;
  });
}

export function getInvoiceSequence(): InvoiceSequenceState {
  return store.read().invoiceSequence;
}

/** Reserves and returns the next gapless tax-invoice number, e.g. "CVT/GST/2026-27/000042". */
export function nextInvoiceNumber(): string {
  return store.mutate((db) => {
    const fy = currentFinancialYear();
    if (db.invoiceSequence.financialYear !== fy) {
      db.invoiceSequence = { prefix: db.invoiceSequence.prefix, financialYear: fy, nextNumber: 1 };
    }
    const n = db.invoiceSequence.nextNumber;
    db.invoiceSequence.nextNumber += 1;
    return `${db.invoiceSequence.prefix}/${fy}/${String(n).padStart(6, "0")}`;
  });
}

export function updateSequencePrefix(prefix: string): InvoiceSequenceState {
  return store.mutate((db) => {
    db.invoiceSequence.prefix = prefix;
    return db.invoiceSequence;
  });
}

export function taxStats(): { mappings: number; lastReturn?: GstReturnRecord; ytdCollected: number } {
  const db = store.read();
  const fy = currentFinancialYear();
  const [startYear] = fy.split("-").map(Number);
  const ytdCollected = db.gstReturns
    .filter((r) => {
      const [y, m] = r.periodLabel.split("-").map(Number);
      return m >= 4 ? y === startYear : y === startYear + 1;
    })
    .reduce((s, r) => s + r.gstCollected, 0);
  return { mappings: db.hsnMappings.length, lastReturn: listGstReturns()[0], ytdCollected: Math.round(ytdCollected * 100) / 100 };
}
