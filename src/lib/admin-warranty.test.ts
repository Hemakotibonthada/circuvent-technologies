/**
 * Automatic warranty registration on delivery.
 *
 * The behaviour that matters here is not "a row gets written". It is that the
 * row gets written *without anyone remembering to*, that it does not get
 * written twice, and that it carries the delivery date rather than the order
 * date. Each of those is a way this silently goes wrong in production, and
 * none of them is visible until a customer makes a claim.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The warranty store writes through data-file, which resolves its directory
// once at import time — so the temp directory has to be in place first.
const dir = mkdtempSync(join(tmpdir(), "cv-warranty-"));
process.env.CIRCUVENT_DATA_DIR = dir;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { autoRegisterForDeliveredOrder, registrationsForOrder, warrantyStatus, assignSerial } = require("./admin-warranty");

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows can hold the handle briefly; the temp dir is disposable */
  }
});

const at = (s: string) => new Date(s).toISOString();

const deliveredOrder = (over: Record<string, unknown> = {}) => ({
  orderNo: `CV-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  status: "delivered",
  placedAt: at("2026-01-10T10:00:00Z"),
  updatedAt: at("2026-01-20T10:00:00Z"),
  customer: { email: "Buyer@Example.com" },
  items: [{ name: "Smart Switch 4CH", qty: 2 }],
  history: [
    { status: "placed", at: at("2026-01-10T10:00:00Z") },
    { status: "delivered", at: at("2026-01-20T10:00:00Z") },
  ],
  ...over,
});

describe("autoRegisterForDeliveredOrder", () => {
  it("registers one row per physical unit, not one per line", () => {
    // Two of the same switch are two devices that can fail and be replaced
    // independently, so they need separate cover records.
    const o = deliveredOrder();
    const created = autoRegisterForDeliveredOrder(o);
    expect(created).toHaveLength(2);
    expect(registrationsForOrder(o.orderNo)).toHaveLength(2);
  });

  it("dates the cover from delivery, not from the order date", () => {
    const o = deliveredOrder();
    const [reg] = autoRegisterForDeliveredOrder(o);
    expect(reg.purchaseDate.slice(0, 10)).toBe("2026-01-20");
    expect(reg.basis).toBe("delivered");
  });

  it("is idempotent — a redelivery or a replayed update does not duplicate cover", () => {
    const o = deliveredOrder();
    autoRegisterForDeliveredOrder(o);
    autoRegisterForDeliveredOrder(o);
    autoRegisterForDeliveredOrder(o);
    expect(registrationsForOrder(o.orderNo)).toHaveLength(2);
  });

  it("gives each unit a distinct reference so support can tell them apart", () => {
    const o = deliveredOrder();
    const created = autoRegisterForDeliveredOrder(o);
    const refs = created.map((r: { deviceOrSerial: string }) => r.deviceOrSerial);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("normalises the customer email so a claim matches the account", () => {
    const o = deliveredOrder();
    const [reg] = autoRegisterForDeliveredOrder(o);
    expect(reg.customerEmail).toBe("buyer@example.com");
  });

  it("marks the registration as automatic, so a hand-entered one is distinguishable", () => {
    const o = deliveredOrder();
    const [reg] = autoRegisterForDeliveredOrder(o);
    expect(reg.auto).toBe(true);
  });

  it("does nothing for an order that has not been delivered", () => {
    const o = deliveredOrder({
      status: "shipped",
      history: [{ status: "placed", at: at("2026-01-10T10:00:00Z") }],
    });
    expect(autoRegisterForDeliveredOrder(o)).toHaveLength(0);
  });

  it("does nothing when there is no customer email to attach cover to", () => {
    const o = deliveredOrder({ customer: {} });
    expect(autoRegisterForDeliveredOrder(o)).toHaveLength(0);
  });

  it("does not throw on a malformed order", () => {
    expect(() => autoRegisterForDeliveredOrder({} as never)).not.toThrow();
    expect(autoRegisterForDeliveredOrder({} as never)).toHaveLength(0);
  });

  it("registers cover that is immediately active", () => {
    const o = deliveredOrder({
      updatedAt: new Date().toISOString(),
      history: [{ status: "delivered", at: new Date().toISOString() }],
    });
    const [reg] = autoRegisterForDeliveredOrder(o);
    expect(warrantyStatus(reg)).toBe("active");
  });
});

describe("assignSerial", () => {
  it("attaches a real device id to a unit once it is known", () => {
    const o = deliveredOrder();
    const [reg] = autoRegisterForDeliveredOrder(o);
    const updated = assignSerial(reg.id, "hub-a1b2c3");
    expect(updated?.deviceOrSerial).toBe("hub-a1b2c3");
    expect(registrationsForOrder(o.orderNo).find((r: { id: string }) => r.id === reg.id)?.deviceOrSerial).toBe("hub-a1b2c3");
  });

  it("returns null for a registration that does not exist", () => {
    expect(assignSerial("wty_nope", "hub-x")).toBeNull();
  });
});

describe("warrantyStatus", () => {
  it("does not grant extra cover for an end-of-month purchase", () => {
    // 31 August + 6 months via Date.setMonth is 3 March, not 28 February.
    // That bug was here before the shared engine existed.
    const reg = {
      id: "wty_x",
      productName: "X",
      deviceOrSerial: "s",
      customerEmail: "a@b.com",
      purchaseDate: at("2026-08-31T00:00:00Z"),
      warrantyMonths: 6,
      createdAt: at("2026-08-31T00:00:00Z"),
    };
    jest.useFakeTimers().setSystemTime(new Date("2027-03-01T00:00:00Z"));
    expect(warrantyStatus(reg)).toBe("expired");
    jest.useRealTimers();
  });
});
