// Vendor Portal — self-service vendor accounts, performance scorecards and a
// quote-approval workflow. Complements (does not duplicate) the existing
// Inventory → Suppliers tab, which only holds static directory info
// (contact, GST, payment terms). This module tracks the *relationship over
// time*: delivery performance events, a computed scorecard, and a lightweight
// approval queue for vendor-submitted quotes/purchase requests.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export type VendorStatus = "invited" | "active" | "suspended";
export type PerfEventType = "on_time" | "late" | "quality_issue" | "note";
export type QuoteStatus = "pending" | "approved" | "rejected";

export interface VendorAccount {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  categories: string[];
  status: VendorStatus;
  portalCode: string; // shared with the vendor for self-service portal access
  createdAt: string;
}

export interface PerformanceEvent {
  id: string;
  vendorId: string;
  type: PerfEventType;
  detail: string;
  at: string;
  loggedBy: string;
}

export interface QuoteRequest {
  id: string;
  vendorId: string;
  title: string;
  itemsDescription: string;
  quotedAmount?: number;
  status: QuoteStatus;
  requestedAt: string;
  respondedAt?: string;
  reviewerNote?: string;
}

interface VendorsDB {
  vendors: VendorAccount[];
  events: PerformanceEvent[];
  quotes: QuoteRequest[];
}

const store = createFileStore<VendorsDB>("admin-vendors.json", () => ({ vendors: [], events: [], quotes: [] }));

function genPortalCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function listVendors(): VendorAccount[] {
  return [...store.read().vendors].sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export function upsertVendor(input: Partial<VendorAccount> & { companyName: string; contactName: string; email: string }): VendorAccount {
  return store.mutate((db) => {
    const existing = input.id ? db.vendors.find((v) => v.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: VendorAccount = {
      id: shortId("vendor"),
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      categories: input.categories || [],
      status: input.status || "invited",
      portalCode: genPortalCode(),
      createdAt: new Date().toISOString(),
    };
    db.vendors.unshift(created);
    return created;
  });
}

export function deleteVendor(id: string): boolean {
  return store.mutate((db) => {
    const before = db.vendors.length;
    db.vendors = db.vendors.filter((v) => v.id !== id);
    db.events = db.events.filter((e) => e.vendorId !== id);
    db.quotes = db.quotes.filter((q) => q.vendorId !== id);
    return db.vendors.length < before;
  });
}

export function logPerformanceEvent(vendorId: string, type: PerfEventType, detail: string, loggedBy: string): PerformanceEvent {
  return store.mutate((db) => {
    const event: PerformanceEvent = { id: shortId("pe"), vendorId, type, detail, at: new Date().toISOString(), loggedBy };
    db.events.unshift(event);
    return event;
  });
}

export function listPerformanceEvents(vendorId: string): PerformanceEvent[] {
  return store.read().events.filter((e) => e.vendorId === vendorId);
}

export interface VendorScorecard {
  vendorId: string;
  deliveries: number;
  // null (not 100) when there is no delivery history yet — an unmeasured
  // vendor is not a perfect one, and defaulting to 100 made a vendor that had
  // never shipped anything indistinguishable from, and averaged in with, one
  // with a genuinely perfect record.
  onTimePct: number | null;
  qualityIssues: number;
  score: number | null; // 0-100, null when unmeasured
}

export function vendorScorecard(vendorId: string): VendorScorecard {
  const events = listPerformanceEvents(vendorId);
  const deliveries = events.filter((e) => e.type === "on_time" || e.type === "late").length;
  const onTime = events.filter((e) => e.type === "on_time").length;
  const issues = events.filter((e) => e.type === "quality_issue").length;
  if (deliveries === 0) {
    return { vendorId, deliveries, onTimePct: null, qualityIssues: issues, score: null };
  }
  const onTimePct = Math.round((onTime / deliveries) * 100);
  const score = Math.max(0, Math.min(100, onTimePct - issues * 5));
  return { vendorId, deliveries, onTimePct, qualityIssues: issues, score };
}

export function listQuoteRequests(vendorId?: string): QuoteRequest[] {
  const rows = store.read().quotes;
  return (vendorId ? rows.filter((q) => q.vendorId === vendorId) : rows).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function createQuoteRequest(input: { vendorId: string; title: string; itemsDescription: string; quotedAmount?: number }): QuoteRequest {
  return store.mutate((db) => {
    const q: QuoteRequest = {
      id: shortId("quote"),
      vendorId: input.vendorId,
      title: input.title,
      itemsDescription: input.itemsDescription,
      quotedAmount: input.quotedAmount,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    db.quotes.unshift(q);
    return q;
  });
}

export function decideQuoteRequest(id: string, approved: boolean, reviewerNote?: string): QuoteRequest | null {
  return store.mutate((db) => {
    const q = db.quotes.find((x) => x.id === id);
    if (!q) return null;
    q.status = approved ? "approved" : "rejected";
    q.respondedAt = new Date().toISOString();
    q.reviewerNote = reviewerNote;
    return q;
  });
}

export function vendorStats(): { total: number; active: number; pendingQuotes: number; avgScore: number | null } {
  const vendors = store.read().vendors;
  // Vendors with no delivery history are excluded rather than counted as 100 —
  // otherwise every brand-new vendor pulled the fleet-wide average up instead
  // of leaving it honestly unmeasured.
  const scores = vendors.map((v) => vendorScorecard(v.id).score).filter((s): s is number => s !== null);
  return {
    total: vendors.length,
    active: vendors.filter((v) => v.status === "active").length,
    pendingQuotes: store.read().quotes.filter((q) => q.status === "pending").length,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
}
