/**
 * One model for every customer-facing document.
 *
 * Invoices, packing slips, delivery notes and warranty certificates are the
 * same order seen from four angles. They were not built that way: the invoice
 * component decides for itself what a total is and what the warranty says, and
 * anything added later would have to make the same decisions again. That is
 * how a customer ends up with an invoice and a certificate that disagree about
 * when their cover ends.
 *
 * So the document is built once, as data, and the components only lay it out.
 * What each kind hides is declared here rather than being scattered through
 * JSX conditionals — a packing slip has no prices on it because it travels in
 * the box, not because some `{!packing && ...}` happened to wrap the column.
 *
 * Pure. No server-only imports, so the same builder runs in the API route, in
 * a component, and in a PDF renderer.
 */
import { warrantyTerm, warrantyDate, type WarrantyTerm, type OrderLike } from "./warranty";

export type DocumentKind = "invoice" | "packing-slip" | "delivery-note" | "warranty-certificate";

export interface DocumentAddress {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface DocumentLine {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Cover for this line. Present on every kind so a packing slip can still state it. */
  warranty: WarrantyTerm;
}

export interface DocumentTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}

export interface BusinessDocument {
  kind: DocumentKind;
  title: string;
  /** Document number. Derived from the order so it is stable across reprints. */
  number: string;
  orderNo: string;
  placedAt: string;
  issuedAt: string;
  status: string;

  billTo: DocumentAddress;
  shipTo: DocumentAddress;
  /** True when no separate delivery address was captured, so the layout can say so once instead of printing the same block twice. */
  shipToSameAsBillTo: boolean;

  lines: DocumentLine[];
  totals: DocumentTotals;

  /** Order-level cover — the shortest remaining term across the lines. */
  warranty: WarrantyTerm;

  trackingNumber?: string | null;
  carrier?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;

  /** What this kind of document shows. Declared, not implied by markup. */
  shows: {
    prices: boolean;
    totals: boolean;
    payment: boolean;
    warrantyDetail: boolean;
    tracking: boolean;
  };
}

export interface DocumentOrderLike extends OrderLike {
  orderNo: string;
  placedAt: string;
  status: string;
  items: { name: string; price?: number; qty?: number; lineTotal?: number }[];
  subtotal?: number;
  shipping?: number;
  discount?: number;
  total?: number;
  customer?: DocumentAddress;
  /** Separate delivery address, when one was captured. Falls back to the billing address. */
  shippingAddress?: DocumentAddress | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
}

const TITLES: Record<DocumentKind, string> = {
  invoice: "TAX INVOICE",
  "packing-slip": "PACKING SLIP",
  "delivery-note": "DELIVERY NOTE",
  "warranty-certificate": "WARRANTY CERTIFICATE",
};

const PREFIX: Record<DocumentKind, string> = {
  invoice: "INV",
  "packing-slip": "PS",
  "delivery-note": "DN",
  "warranty-certificate": "WC",
};

/**
 * A packing slip goes in the box, so it must not carry prices — the recipient
 * is often not the buyer, and a gift should not arrive with the amount paid
 * printed on it.
 */
const SHOWS: Record<DocumentKind, BusinessDocument["shows"]> = {
  invoice: { prices: true, totals: true, payment: true, warrantyDetail: true, tracking: true },
  "packing-slip": { prices: false, totals: false, payment: false, warrantyDetail: false, tracking: true },
  "delivery-note": { prices: false, totals: false, payment: false, warrantyDetail: true, tracking: true },
  "warranty-certificate": { prices: false, totals: false, payment: false, warrantyDetail: true, tracking: false },
};

function addressOf(a: DocumentAddress | null | undefined): DocumentAddress {
  return {
    name: a?.name,
    phone: a?.phone,
    email: a?.email,
    address: a?.address,
    city: a?.city,
    state: a?.state,
    pincode: a?.pincode,
  };
}

/** The postal part of an address, joined for display. */
export function formatAddress(a: DocumentAddress): string {
  return [a.address, a.city, a.state, a.pincode].filter(Boolean).join(", ");
}

function sameAddress(a: DocumentAddress, b: DocumentAddress): boolean {
  const key = (x: DocumentAddress) =>
    [x.name, x.address, x.city, x.state, x.pincode]
      .map((v) => (v || "").trim().toLowerCase().replace(/\s+/g, " "))
      .join("|");
  return key(a) === key(b);
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Build the document.
 *
 * `now` is injectable so a reprint of an old document can be rendered as it
 * stood, and so the warranty state in tests does not depend on the clock.
 */
export function buildDocument(
  order: DocumentOrderLike,
  kind: DocumentKind,
  opts: { now?: number; issuedAt?: string } = {}
): BusinessDocument {
  const now = opts.now ?? Date.now();
  const term = warrantyTerm(order, { now });

  const lines: DocumentLine[] = (Array.isArray(order.items) ? order.items : []).map((it) => {
    const qty = Math.max(1, Number(it.qty) || 1);
    const lineTotal = round2(typeof it.lineTotal === "number" ? it.lineTotal : (Number(it.price) || 0) * qty);
    const unitPrice = round2(typeof it.price === "number" ? it.price : lineTotal / qty);
    return { name: it.name, qty, unitPrice, lineTotal, warranty: term };
  });

  const billTo = addressOf(order.customer);
  // No separate delivery address captured means the goods went to the billing
  // address. Saying so is more useful than printing the same block twice.
  const shipTo = order.shippingAddress ? addressOf(order.shippingAddress) : billTo;

  const subtotal = round2(typeof order.subtotal === "number" ? order.subtotal : lines.reduce((s, l) => s + l.lineTotal, 0));
  const shipping = round2(order.shipping ?? 0);
  const discount = round2(order.discount ?? 0);
  const total = round2(typeof order.total === "number" ? order.total : subtotal + shipping - discount);

  return {
    kind,
    title: TITLES[kind],
    number: `${PREFIX[kind]}-${order.orderNo}`,
    orderNo: order.orderNo,
    placedAt: order.placedAt,
    issuedAt: opts.issuedAt ?? new Date(now).toISOString(),
    status: order.status,

    billTo,
    shipTo,
    shipToSameAsBillTo: sameAddress(billTo, shipTo),

    lines,
    totals: { subtotal, shipping, discount, total },
    warranty: term,

    trackingNumber: order.trackingNumber ?? null,
    carrier: order.carrier ?? null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,

    shows: SHOWS[kind],
  };
}

/**
 * Which documents can be produced for this order right now?
 *
 * A warranty certificate for something still in transit would state cover that
 * has not begun, so it is not offered until the order is delivered.
 */
export function availableDocuments(order: DocumentOrderLike): DocumentKind[] {
  const kinds: DocumentKind[] = ["invoice", "packing-slip"];
  const delivered = order.status === "delivered" || (order.history || []).some((e) => e.status === "delivered");
  if (order.status === "shipped" || delivered) kinds.push("delivery-note");
  if (delivered) kinds.push("warranty-certificate");
  return kinds;
}

/** One-line cover statement for a document footer. */
export function warrantyFooter(doc: BusinessDocument): string {
  const t = doc.warranty;
  if (t.state === "not-started") {
    return `Every Circuvent device carries a ${t.months}-month limited warranty, beginning on the date of delivery.`;
  }
  if (t.state === "expired") {
    return `The ${t.months}-month limited warranty for this order ended on ${warrantyDate(t.expiry)}. Paid repair and spare-part options remain available.`;
  }
  return `Covered by the ${t.months}-month Circuvent limited warranty until ${warrantyDate(t.expiry)}.`;
}
