import { buildDocument, availableDocuments, warrantyFooter, formatAddress, type DocumentOrderLike } from "./documents";

const at = (s: string) => new Date(s).toISOString();

const order = (over: Partial<DocumentOrderLike> = {}): DocumentOrderLike => ({
  orderNo: "CV-20260110-AB12C",
  placedAt: at("2026-01-10T10:00:00Z"),
  status: "delivered",
  updatedAt: at("2026-01-20T10:00:00Z"),
  items: [
    { name: "Smart Switch 4CH", price: 2499, qty: 2, lineTotal: 4998 },
    { name: "Water Controller", price: 3999, qty: 1, lineTotal: 3999 },
  ],
  subtotal: 8997,
  shipping: 0,
  discount: 0,
  total: 8997,
  customer: {
    name: "Asha Rao",
    email: "asha@example.com",
    phone: "+91 90000 00000",
    address: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  history: [
    { status: "placed", at: at("2026-01-10T10:00:00Z") },
    { status: "delivered", at: at("2026-01-20T10:00:00Z") },
  ],
  paymentMethod: "razorpay",
  paymentStatus: "paid",
  ...over,
});

const NOW = new Date("2026-02-01T00:00:00Z").getTime();

describe("buildDocument — addresses", () => {
  it("uses the billing address for delivery when no separate one was captured", () => {
    const doc = buildDocument(order(), "invoice", { now: NOW });
    expect(doc.shipToSameAsBillTo).toBe(true);
    expect(doc.shipTo.address).toBe("12 MG Road");
  });

  it("keeps a separate delivery address distinct from the billing address", () => {
    // The reason this exists: a gift, an office delivery, or anyone who bills
    // to one place and ships to another. Before this, both blocks on the
    // invoice rendered the same address under two different headings.
    const doc = buildDocument(
      order({
        shippingAddress: { name: "Site Office", address: "Plot 9, Industrial Area", city: "Pune", state: "Maharashtra", pincode: "411001" },
      }),
      "invoice",
      { now: NOW }
    );
    expect(doc.shipToSameAsBillTo).toBe(false);
    expect(doc.billTo.city).toBe("Bengaluru");
    expect(doc.shipTo.city).toBe("Pune");
  });

  it("treats a delivery address that only differs by spacing or case as the same", () => {
    const doc = buildDocument(
      order({ shippingAddress: { name: "asha  rao", address: "12 MG ROAD", city: "bengaluru", state: "Karnataka", pincode: "560001" } }),
      "invoice",
      { now: NOW }
    );
    expect(doc.shipToSameAsBillTo).toBe(true);
  });

  it("formats an address without leaving stray commas for missing parts", () => {
    expect(formatAddress({ address: "12 MG Road", city: "Bengaluru", pincode: "560001" })).toBe("12 MG Road, Bengaluru, 560001");
    expect(formatAddress({})).toBe("");
  });
});

describe("buildDocument — what each kind shows", () => {
  it("puts no prices on a packing slip, because it travels in the box", () => {
    // A gift should not arrive with the amount paid printed on it.
    const doc = buildDocument(order(), "packing-slip", { now: NOW });
    expect(doc.shows.prices).toBe(false);
    expect(doc.shows.totals).toBe(false);
    expect(doc.shows.payment).toBe(false);
  });

  it("puts prices and payment on an invoice", () => {
    const doc = buildDocument(order(), "invoice", { now: NOW });
    expect(doc.shows.prices).toBe(true);
    expect(doc.shows.payment).toBe(true);
  });

  it("gives a warranty certificate no prices but full cover detail", () => {
    const doc = buildDocument(order(), "warranty-certificate", { now: NOW });
    expect(doc.shows.prices).toBe(false);
    expect(doc.shows.warrantyDetail).toBe(true);
  });

  it("titles each kind distinctly", () => {
    expect(buildDocument(order(), "invoice", { now: NOW }).title).toBe("TAX INVOICE");
    expect(buildDocument(order(), "packing-slip", { now: NOW }).title).toBe("PACKING SLIP");
    expect(buildDocument(order(), "delivery-note", { now: NOW }).title).toBe("DELIVERY NOTE");
    expect(buildDocument(order(), "warranty-certificate", { now: NOW }).title).toBe("WARRANTY CERTIFICATE");
  });

  it("numbers documents stably, so a reprint carries the same number", () => {
    const a = buildDocument(order(), "invoice", { now: NOW });
    const b = buildDocument(order(), "invoice", { now: NOW + 86_400_000 });
    expect(a.number).toBe(b.number);
    expect(a.number).toBe("INV-CV-20260110-AB12C");
  });

  it("gives different kinds different numbers for the same order", () => {
    expect(buildDocument(order(), "invoice", { now: NOW }).number).not.toBe(
      buildDocument(order(), "packing-slip", { now: NOW }).number
    );
  });
});

describe("buildDocument — money", () => {
  it("carries the order's own totals rather than recomputing them", () => {
    const doc = buildDocument(order({ subtotal: 8997, shipping: 199, discount: 500, total: 8696 }), "invoice", { now: NOW });
    expect(doc.totals).toEqual({ subtotal: 8997, shipping: 199, discount: 500, total: 8696 });
  });

  it("derives a missing subtotal and total from the lines", () => {
    const doc = buildDocument(
      order({ subtotal: undefined, total: undefined, shipping: 100, discount: 0 }),
      "invoice",
      { now: NOW }
    );
    expect(doc.totals.subtotal).toBe(8997);
    expect(doc.totals.total).toBe(9097);
  });

  it("derives a unit price when only a line total is present", () => {
    const doc = buildDocument(order({ items: [{ name: "X", qty: 4, lineTotal: 1000 }] }), "invoice", { now: NOW });
    expect(doc.lines[0].unitPrice).toBe(250);
  });

  it("does not produce fractional-paise totals", () => {
    const doc = buildDocument(order({ items: [{ name: "X", qty: 3, lineTotal: 100 }] , subtotal: undefined, total: undefined }), "invoice", { now: NOW });
    expect(doc.lines[0].unitPrice).toBe(33.33);
  });

  it("treats a quantity of zero or nonsense as one rather than dividing by it", () => {
    const doc = buildDocument(order({ items: [{ name: "X", qty: 0, lineTotal: 500 }] }), "invoice", { now: NOW });
    expect(doc.lines[0].qty).toBe(1);
    expect(Number.isFinite(doc.lines[0].unitPrice)).toBe(true);
  });
});

describe("buildDocument — warranty", () => {
  it("dates cover from delivery on every line", () => {
    const doc = buildDocument(order(), "invoice", { now: NOW });
    expect(doc.warranty.start?.slice(0, 10)).toBe("2026-01-20");
    expect(doc.warranty.expiry?.slice(0, 10)).toBe("2026-07-20");
    expect(doc.lines.every((l) => l.warranty.expiry === doc.warranty.expiry)).toBe(true);
  });

  it("does not print an expiry date for an order still in transit", () => {
    const doc = buildDocument(
      order({ status: "placed", history: [{ status: "placed", at: at("2026-01-10T10:00:00Z") }] }),
      "invoice",
      { now: NOW }
    );
    expect(doc.warranty.state).toBe("not-started");
    expect(warrantyFooter(doc)).toContain("beginning on the date of delivery");
  });

  it("states the expiry date in the footer once cover has begun", () => {
    expect(warrantyFooter(buildDocument(order(), "invoice", { now: NOW }))).toContain("until");
  });

  it("offers out-of-warranty support in the footer once cover has ended", () => {
    const doc = buildDocument(order(), "invoice", { now: new Date("2027-01-01T00:00:00Z").getTime() });
    expect(warrantyFooter(doc)).toContain("Paid repair");
  });
});

describe("availableDocuments", () => {
  it("offers no warranty certificate before delivery", () => {
    // Certifying cover that has not started would be a false statement.
    const kinds = availableDocuments(order({ status: "placed", history: [{ status: "placed", at: at("2026-01-10T10:00:00Z") }] }));
    expect(kinds).not.toContain("warranty-certificate");
    expect(kinds).toContain("invoice");
  });

  it("offers a delivery note once the order has shipped", () => {
    const kinds = availableDocuments(order({ status: "shipped", history: [{ status: "shipped", at: at("2026-01-12T10:00:00Z") }] }));
    expect(kinds).toContain("delivery-note");
    expect(kinds).not.toContain("warranty-certificate");
  });

  it("offers everything once delivered", () => {
    expect(availableDocuments(order())).toEqual(
      expect.arrayContaining(["invoice", "packing-slip", "delivery-note", "warranty-certificate"])
    );
  });
});

describe("buildDocument — robustness", () => {
  it("does not throw on an order with no items", () => {
    const doc = buildDocument(order({ items: [] }), "invoice", { now: NOW });
    expect(doc.lines).toEqual([]);
    expect(doc.totals.total).toBe(8997);
  });

  it("does not throw when the customer block is missing", () => {
    const doc = buildDocument(order({ customer: undefined }), "invoice", { now: NOW });
    expect(doc.billTo.name).toBeUndefined();
    expect(doc.shipToSameAsBillTo).toBe(true);
  });
});
