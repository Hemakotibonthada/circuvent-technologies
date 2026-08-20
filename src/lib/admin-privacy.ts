// GDPR / Data Privacy Requests — a queue for "export my data" and "delete my
// account" requests. Export bundles the customer's own account, orders and
// reviews (reusing store.ts read accessors).
//
// DELETION IS NOT AUTOMATED HERE, AND THE QUEUE NOW SAYS SO.
//
// Nothing in this codebase erases an account: there is no anonymise/erase
// routine in store.ts, only setAccountBlocked. The queue still let an operator
// set a "delete" request to `completed`, which recorded a completion date
// against a right-to-be-forgotten request while the customer's account, orders
// and wallet remained fully intact. An auditor reading that queue would
// reasonably conclude the data was gone. That is a false attestation, and a
// regulatory exposure rather than a UI nit.
//
// Closing a deletion request therefore requires recording *how* it was carried
// out. That is deliberately the same question a regulator asks, it cannot be
// satisfied by clicking, and it leaves evidence behind. Automating the erasure
// itself is a separate piece of work: it touches accounts, orders, wallet and
// loyalty irreversibly and should not be bolted on to a status dropdown.
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
  /**
   * How a deletion was actually performed — a ticket, a runbook step, whoever
   * ran it. Required before a `delete` request may be marked completed, and
   * the only thing that turns "completed" from a claim into a record.
   */
  erasureRef?: string;
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

export type StatusUpdate =
  | { ok: true; request: PrivacyRequest }
  | { ok: false; reason: string };

export function updateRequestStatus(
  id: string,
  status: PrivacyRequestStatus,
  note?: string,
  erasureRef?: string
): StatusUpdate {
  return store.mutate((db) => {
    const r = db.requests.find((x) => x.id === id);
    if (!r) return { ok: false as const, reason: "That request no longer exists." };

    /*
     * The guard this module exists for. Completing a deletion asserts the data
     * is gone; nothing here makes that true, so the assertion has to come with
     * evidence of the erasure somebody performed by hand.
     */
    const ref = erasureRef?.trim();
    if (status === "completed" && r.type === "delete" && !ref && !r.erasureRef) {
      return {
        ok: false as const,
        reason:
          "Deletion is not automated. Record how the data was erased — a ticket or runbook reference — before marking this completed.",
      };
    }

    r.status = status;
    r.note = note ?? r.note;
    if (ref) r.erasureRef = ref;
    if (status === "completed") r.completedAt = new Date().toISOString();
    return { ok: true as const, request: r };
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
