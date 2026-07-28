// Warranty & RMA Center — warranty registrations (linking a purchased
// product / IoT device to a customer + purchase date) and a return-merchandise
// -authorization workflow for defect/repair/replacement cases. Bridges the
// e-commerce order history with the physical IoT device identity (the same
// device ids used by the console/control-plane, e.g. "hub-a1b2c3") without
// depending on the external platform/ backend — registrations are entered
// here (by support staff, from the customer's order + device label).
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface WarrantyRegistration {
  id: string;
  orderNo?: string;
  productName: string;
  deviceOrSerial: string;
  customerEmail: string;
  purchaseDate: string;
  warrantyMonths: number;
  createdAt: string;
}

export type RmaStatus = "requested" | "diagnosing" | "approved" | "repair" | "replaced" | "rejected" | "closed";

export interface RmaCase {
  id: string;
  registrationId: string;
  issueDescription: string;
  status: RmaStatus;
  createdAt: string;
  updatedAt: string;
  resolutionNote?: string;
}

interface WarrantyDB {
  registrations: WarrantyRegistration[];
  cases: RmaCase[];
}

const store = createFileStore<WarrantyDB>("admin-warranty.json", () => ({ registrations: [], cases: [] }));

export function listRegistrations(): WarrantyRegistration[] {
  return [...store.read().registrations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function registerWarranty(input: Omit<WarrantyRegistration, "id" | "createdAt">): WarrantyRegistration {
  return store.mutate((db) => {
    const created: WarrantyRegistration = { ...input, id: shortId("wty"), createdAt: new Date().toISOString() };
    db.registrations.unshift(created);
    return created;
  });
}

export function findRegistration(id: string): WarrantyRegistration | null {
  return store.read().registrations.find((r) => r.id === id) ?? null;
}

export function warrantyStatus(reg: WarrantyRegistration): "active" | "expired" {
  const expiry = new Date(reg.purchaseDate);
  expiry.setMonth(expiry.getMonth() + reg.warrantyMonths);
  return Date.now() <= expiry.getTime() ? "active" : "expired";
}

export function listRmas(status?: RmaStatus): RmaCase[] {
  const rows = store.read().cases;
  return (status ? rows.filter((c) => c.status === status) : rows).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createRma(registrationId: string, issueDescription: string): RmaCase {
  return store.mutate((db) => {
    const now = new Date().toISOString();
    const created: RmaCase = { id: shortId("rma"), registrationId, issueDescription, status: "requested", createdAt: now, updatedAt: now };
    db.cases.unshift(created);
    return created;
  });
}

export function updateRmaStatus(id: string, status: RmaStatus, resolutionNote?: string): RmaCase | null {
  return store.mutate((db) => {
    const c = db.cases.find((x) => x.id === id);
    if (!c) return null;
    c.status = status;
    c.resolutionNote = resolutionNote ?? c.resolutionNote;
    c.updatedAt = new Date().toISOString();
    return c;
  });
}

export function warrantyStats(): { registrations: number; openCases: number; closedCases: number } {
  const db = store.read();
  return {
    registrations: db.registrations.length,
    openCases: db.cases.filter((c) => c.status !== "closed" && c.status !== "rejected").length,
    closedCases: db.cases.filter((c) => c.status === "closed").length,
  };
}
