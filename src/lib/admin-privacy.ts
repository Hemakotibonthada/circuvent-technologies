// GDPR / Data Privacy Requests — a queue for "export my data" and "delete my
// account" requests. Export bundles the customer's own account, orders and
// reviews (reusing store.ts read accessors); deletion is a soft, admin-
// confirmed action recorded here (does not itself call setAccountBlocked or
// mutate accounts — a follow-up step an admin performs deliberately, kept
// out of this pass to avoid destructive automatic account changes).
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listOrders, listCustomers } from "./store";

export type PrivacyRequestType = "export" | "delete";
export type PrivacyRequestStatus = "pending" | "processing" | "completed" | "rejected";

export interface PrivacyRequest {
  id: string;
  email: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  requestedAt: string;
  completedAt?: string;
  note?: string;
}

const store = createFileStore<{ requests: PrivacyRequest[] }>("admin-privacy.json", () => ({ requests: [] }));

export function listRequests(status?: PrivacyRequestStatus): PrivacyRequest[] {
  const rows = store.read().requests;
  return (status ? rows.filter((r) => r.status === status) : rows).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function createRequest(email: string, type: PrivacyRequestType): PrivacyRequest {
  return store.mutate((db) => {
    const request: PrivacyRequest = { id: shortId("priv"), email: email.toLowerCase(), type, status: "pending", requestedAt: new Date().toISOString() };
    db.requests.unshift(request);
    return request;
  });
}

export function updateRequestStatus(id: string, status: PrivacyRequestStatus, note?: string): PrivacyRequest | null {
  return store.mutate((db) => {
    const r = db.requests.find((x) => x.id === id);
    if (!r) return null;
    r.status = status;
    r.note = note ?? r.note;
    if (status === "completed") r.completedAt = new Date().toISOString();
    return r;
  });
}

/** Builds the exportable data bundle for one customer email (read-only). */
export function buildExportBundle(email: string) {
  const lower = email.toLowerCase();
  const customer = listCustomers().find((c) => c.email.toLowerCase() === lower) || null;
  const orders = listOrders().filter((o) => (o.customer.email || "").toLowerCase() === lower);
  return { customer, orders, exportedAt: new Date().toISOString() };
}

export function privacyStats(): { pending: number; completed: number; total: number } {
  const rows = store.read().requests;
  return { pending: rows.filter((r) => r.status === "pending").length, completed: rows.filter((r) => r.status === "completed").length, total: rows.length };
}
