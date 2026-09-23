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
import { WARRANTY_MONTHS, warrantyStart, warrantyTerm, type WarrantyBasis } from "./warranty";

export interface WarrantyRegistration {
  id: string;
  orderNo?: string;
  productName: string;
  deviceOrSerial: string;
  customerEmail: string;
  purchaseDate: string;
  warrantyMonths: number;
  createdAt: string;
  /** True when registered automatically on delivery rather than typed in by support. */
  auto?: boolean;
  /** Which order event started the cover — delivery, dispatch or order date. */
  basis?: WarrantyBasis;
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

const store = createFileStore<WarrantyDB>(
  "admin-warranty.json",
  () => ({ registrations: [], cases: [] }),
  /*
   * Kept in the database, not just in a file.
   *
   * Everything below worked and none of it survived. The serverless host has
   * no writable disk, so `createFileStore` degrades to memory for the life of
   * one lambda instance: a warranty registered the moment an order was marked
   * delivered went into whichever instance handled that click, and the Warranty
   * & RMA screen — served by a different instance minutes later — read an empty
   * document and showed nothing. The same applied to registrations typed in by
   * support and to every RMA case ever opened.
   *
   * There is no error in that sequence. Each request succeeds, the panel
   * renders, and the data is simply not there afterwards, which is the hardest
   * kind of failure to notice and the worst one to have in the record that
   * decides whether a customer is still under cover.
   */
  { durable: true }
);

/**
 * Loads the authoritative copy before a request reads or writes.
 *
 * Mirrors `revalidateIcm()`: the accessors below stay synchronous and every
 * route awaits this first. Skipping it cannot corrupt the document —
 * `createFileStore` refuses to save a store it has not hydrated — but it does
 * mean serving one instance's empty copy, and any write in that request is
 * refused and logged.
 */
export async function revalidateWarranty(): Promise<void> {
  await store.hydrate();
}

/**
 * Waits for the pending database write to land.
 *
 * Awaited before responding rather than fired and forgotten: a serverless
 * function that returns before its promises settle is frozen mid-write, and the
 * registration is lost — which looks exactly like the bug this is fixing.
 */
export async function flushWarranty(): Promise<void> {
  await store.flush();
}

export function listRegistrations(): WarrantyRegistration[] {
  return [...store.read().registrations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function registerWarranty(input: Omit<WarrantyRegistration, "id" | "createdAt">): WarrantyRegistration {
  const created = store.mutate((db) => {
    const row: WarrantyRegistration = { ...input, id: shortId("wty"), createdAt: new Date().toISOString() };
    db.registrations.unshift(row);
    return row;
  });
  void syncWarrantyToCrm(created);
  void syncCustomerToCrm({ email: created.customerEmail });
  return created;
}

export function findRegistration(id: string): WarrantyRegistration | null {
  return store.read().registrations.find((r) => r.id === id) ?? null;
}

/**
 * Is this registration still in cover?
 *
 * This used to do `expiry.setMonth(expiry.getMonth() + months)`, which turns
 * 31 August into 3 March rather than 28 February — so a device bought at the
 * end of a long month got two days of cover the policy never granted, and the
 * date shown here disagreed with the one on the customer's invoice. The shared
 * engine clamps; both now give the same answer because both call the same code.
 */
export function warrantyStatus(reg: WarrantyRegistration): "active" | "expired" {
  const term = warrantyTerm(
    { status: "delivered", updatedAt: reg.purchaseDate, history: [{ status: "delivered", at: reg.purchaseDate }] },
    { months: reg.warrantyMonths }
  );
  return term.state === "expired" ? "expired" : "active";
}

export function listRmas(status?: RmaStatus): RmaCase[] {
  const rows = store.read().cases;
  return (status ? rows.filter((c) => c.status === status) : rows).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createRma(registrationId: string, issueDescription: string): RmaCase {
  const created = store.mutate((db) => {
    const now = new Date().toISOString();
    const row: RmaCase = { id: shortId("rma"), registrationId, issueDescription, status: "requested", createdAt: now, updatedAt: now };
    db.cases.unshift(row);
    return row;
  });
  void syncRmaToCrm(created);
  return created;
}

export function updateRmaStatus(id: string, status: RmaStatus, resolutionNote?: string): RmaCase | null {
  const updated = store.mutate((db) => {
    const c = db.cases.find((x) => x.id === id);
    if (!c) return null;
    c.status = status;
    c.resolutionNote = resolutionNote ?? c.resolutionNote;
    c.updatedAt = new Date().toISOString();
    return c;
  });
  if (updated) void syncRmaToCrm(updated);
  return updated;
}

export function warrantyStats(): { registrations: number; openCases: number; closedCases: number } {
  const db = store.read();
  return {
    registrations: db.registrations.length,
    openCases: db.cases.filter((c) => c.status !== "closed" && c.status !== "rejected").length,
    closedCases: db.cases.filter((c) => c.status === "closed").length,
  };
}

/* ------------------------------------------------------ automatic registration --- */

interface DeliveredOrderLike {
  orderNo: string;
  customer?: { email?: string };
  items?: { name: string; qty?: number; warrantyMonths?: number }[];
  history?: { status: string; at: string }[];
  status?: string;
  updatedAt?: string;
  placedAt?: string;
}

/**
 * Register the warranty for an order the moment it is delivered.
 *
 * Until now every registration was typed in by support staff from the
 * customer's order and the label on the device. That means a device is only
 * under warranty if somebody remembered to record it, and the failure is
 * invisible: nothing looks wrong until a customer claims and there is no
 * registration to find. The order already knows what was bought, by whom, and
 * exactly when it arrived, so none of that typing is necessary.
 *
 * One row per physical unit, not per line: two of the same switch on one order
 * are two devices that can fail and be replaced independently. The serial is
 * left unassigned and carries a stable per-unit reference, so support can
 * attach the real device id later without having to work out which of the two
 * they are looking at.
 *
 * Idempotent by order number — a redelivery, a status corrected twice, or a
 * replayed webhook must not create a second set of registrations.
 */
export function autoRegisterForDeliveredOrder(order: DeliveredOrderLike): WarrantyRegistration[] {
  if (!order?.orderNo) return [];

  const email = order.customer?.email?.trim().toLowerCase();
  if (!email) return []; // nothing to attach cover to

  const started = warrantyStart(order);
  if (!started) return []; // not delivered — the policy has not started

  const created = store.mutate((db) => {
    if (db.registrations.some((r) => r.orderNo === order.orderNo && r.auto)) return [];

    const rows: WarrantyRegistration[] = [];
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item, itemIndex) => {
      const qty = Math.max(1, Math.min(99, Number(item.qty) || 1));
      // The term recorded on the line at purchase, not whatever the catalogue
      // says today. A product edited later must not change cover already sold.
      const months =
        Number.isFinite(item.warrantyMonths) && (item.warrantyMonths as number) > 0
          ? Math.round(item.warrantyMonths as number)
          : WARRANTY_MONTHS;
      for (let unit = 0; unit < qty; unit++) {
        rows.push({
          id: shortId("wty"),
          orderNo: order.orderNo,
          productName: item.name,
          deviceOrSerial: `${order.orderNo}/${itemIndex + 1}${qty > 1 ? `-${unit + 1}` : ""}`,
          customerEmail: email,
          purchaseDate: started.at,
          warrantyMonths: months,
          createdAt: new Date().toISOString(),
          auto: true,
          basis: started.basis,
        });
      }
    });

    db.registrations.unshift(...rows);
    return rows;
  });
  for (const r of created) void syncWarrantyToCrm(r);
  if (created[0]) void syncCustomerToCrm({ email: created[0].customerEmail });
  return created;
}

/** Registrations for one order, for the invoice and the customer's account. */
export function registrationsForOrder(orderNo: string): WarrantyRegistration[] {
  return store.read().registrations.filter((r) => r.orderNo === orderNo);
}

/** Attach a real device id to a unit once it is known. */
export function assignSerial(registrationId: string, deviceOrSerial: string): WarrantyRegistration | null {
  return store.mutate((db) => {
    const r = db.registrations.find((x) => x.id === registrationId);
    if (!r) return null;
    r.deviceOrSerial = deviceOrSerial.trim();
    return r;
  });
}


/* ------------------------------------------------------------------ */
/* CV-365 CRM bridge                                                  */
/* ------------------------------------------------------------------ */

function crmSyncBase(): string {
  return (
    process.env.CV365_URL ||
    process.env.CRM_SYNC_URL ||
    process.env.NEXT_PUBLIC_CV365_URL ||
    "http://localhost:3013"
  ).replace(/\/$/, "");
}

function crmSyncToken(): string {
  return (
    process.env.CROSS_APP_SYNC_TOKEN ||
    process.env.CRM_SYNC_SECRET ||
    ""
  ).trim();
}

async function postToCrm(payload: Record<string, unknown>): Promise<void> {
  const url = `${crmSyncBase()}/api/crm/warranty`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = crmSyncToken();
  if (token) headers["x-service-token"] = token;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      // fire-and-forget friendly; do not block shop checkout on CRM
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn("[crm-sync] CV-365 responded", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.warn("[crm-sync] failed", err instanceof Error ? err.message : err);
  }
}

/** Push one warranty registration to CV-365 Customer 360 / Warranty register. */
export async function syncWarrantyToCrm(registration: WarrantyRegistration): Promise<void> {
  await postToCrm({
    type: "warranty",
    warranty: {
      id: registration.id,
      customerEmail: registration.customerEmail,
      orderNo: registration.orderNo,
      productName: registration.productName,
      deviceOrSerial: registration.deviceOrSerial,
      purchaseDate: registration.purchaseDate,
      warrantyMonths: registration.warrantyMonths,
      basis: registration.basis || "delivered",
      deliveryDate: registration.basis === "delivered" ? registration.purchaseDate : undefined,
      auto: registration.auto,
    },
  });
}

/** Push an RMA case to CV-365 service queue. */
export async function syncRmaToCrm(
  rmaCase: RmaCase,
  extras?: { customerEmail?: string; productName?: string; deviceOrSerial?: string; orderNo?: string }
): Promise<void> {
  const reg = findRegistration(rmaCase.registrationId);
  await postToCrm({
    type: "rma",
    rma: {
      id: rmaCase.id,
      registrationId: rmaCase.registrationId,
      customerEmail: extras?.customerEmail || reg?.customerEmail || "",
      orderNo: extras?.orderNo || reg?.orderNo || "",
      deviceOrSerial: extras?.deviceOrSerial || reg?.deviceOrSerial || "",
      productName: extras?.productName || reg?.productName || "",
      issueDescription: rmaCase.issueDescription,
      status: rmaCase.status,
      resolutionNote: rmaCase.resolutionNote,
    },
  });
}

/** Push a Circuvent.com shop customer into CV-365 Customer 360. */
export async function syncCustomerToCrm(customer: {
  email: string;
  name?: string;
  totalSpend?: number;
  orderCount?: number;
  phone?: string;
  company?: string;
}): Promise<void> {
  if (!customer?.email) return;
  await postToCrm({
    type: "customer",
    customer: {
      email: customer.email,
      name: customer.name,
      totalSpend: customer.totalSpend || 0,
      orderCount: customer.orderCount || 0,
      phone: customer.phone,
      company: customer.company,
      tags: ["shop-admin"],
    },
  });
}
