// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Invoice Entity (Client Portal Domain)
// ══════════════════════════════════════════════════════════════════════════════

import { InvoiceEntity, InvoiceStatus } from "../../../src/domain/entities/invoice.entity";

function createInvoice(overrides?: Partial<ConstructorParameters<typeof InvoiceEntity>[0]>): InvoiceEntity {
  return new InvoiceEntity({
    id: "inv-001", invoiceNumber: "INV-2026-0001",
    clientId: "client-001", clientName: "TechCorp",
    issueDate: new Date("2026-03-01"),
    dueDate: new Date("2026-03-31"),
    ...overrides,
  });
}

describe("InvoiceEntity", () => {
  describe("Line Items & GST", () => {
    it("should calculate intra-state GST (CGST + SGST)", () => {
      const inv = createInvoice({ isInterState: false });
      inv.addLineItem({ description: "IoT Consulting", quantity: 1, unitPrice: 100000, hsnSacCode: "998314", gstRate: 18 });
      
      const gst = inv.gstBreakdown;
      expect(gst.subtotal).toBe(100000);
      expect(gst.cgst).toBe(9000);
      expect(gst.sgst).toBe(9000);
      expect(gst.igst).toBe(0);
      expect(gst.grandTotal).toBe(118000);
    });

    it("should calculate inter-state GST (IGST)", () => {
      const inv = createInvoice({ isInterState: true });
      inv.addLineItem({ description: "Software License", quantity: 1, unitPrice: 50000, gstRate: 18 });
      
      const gst = inv.gstBreakdown;
      expect(gst.igst).toBe(9000);
      expect(gst.cgst).toBe(0);
      expect(gst.sgst).toBe(0);
      expect(gst.grandTotal).toBe(59000);
    });

    it("should handle multiple line items", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service A", quantity: 2, unitPrice: 10000, gstRate: 18 });
      inv.addLineItem({ description: "Service B", quantity: 1, unitPrice: 30000, gstRate: 18 });
      
      expect(inv.gstBreakdown.subtotal).toBe(50000); // 20000 + 30000
      expect(inv.grandTotal).toBe(59000); // 50000 + 18% GST
    });

    it("should handle discounts", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 100000, gstRate: 18, discount: 10 });
      
      expect(inv.gstBreakdown.discountTotal).toBe(10000);
      expect(inv.gstBreakdown.taxableAmount).toBe(90000);
      expect(inv.gstBreakdown.totalGST).toBe(16200); // 18% of 90000
    });

    it("should NOT modify non-DRAFT invoices", () => {
      const inv = createInvoice({ status: InvoiceStatus.SENT });
      expect(() => inv.addLineItem({ description: "Late add", quantity: 1, unitPrice: 1000, gstRate: 18 })).toThrow("Cannot modify");
    });
  });

  describe("Sending", () => {
    it("should send a DRAFT invoice", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 50000, gstRate: 18 });
      inv.send();
      expect(inv.status).toBe(InvoiceStatus.SENT);
    });

    it("should NOT send without line items", () => {
      const inv = createInvoice();
      expect(() => inv.send()).toThrow("no line items");
    });

    it("should emit InvoiceSent event", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 50000, gstRate: 18 });
      inv.send();
      expect(inv.events.find((e: any) => e.type === "InvoiceSent")).toBeDefined();
    });
  });

  describe("Payments", () => {
    it("should record partial payment", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 100000, gstRate: 18 });
      inv.send();
      inv.recordPayment({ id: "pay-1", amount: 50000, currency: "INR", method: "BANK_TRANSFER", reference: "TXN001", receivedAt: new Date() });
      
      expect(inv.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(inv.totalPaid).toBe(50000);
      expect(inv.balanceDue).toBe(68000); // 118000 - 50000
    });

    it("should mark as PAID when fully paid", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 100000, gstRate: 18 });
      inv.send();
      inv.recordPayment({ id: "pay-1", amount: 118000, currency: "INR", method: "UPI", reference: "UPI001", receivedAt: new Date() });
      
      expect(inv.status).toBe(InvoiceStatus.PAID);
      expect(inv.balanceDue).toBe(0);
    });

    it("should reject overpayment", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 1000, gstRate: 18 });
      inv.send();
      expect(() => inv.recordPayment({ id: "pay-1", amount: 999999, currency: "INR", method: "CASH", reference: "X", receivedAt: new Date() })).toThrow("exceeds balance");
    });

    it("should NOT accept payment on cancelled invoice", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 1000, gstRate: 18 });
      inv.cancel("Client withdrew");
      expect(() => inv.recordPayment({ id: "pay-1", amount: 500, currency: "INR", method: "CASH", reference: "X", receivedAt: new Date() })).toThrow();
    });
  });

  describe("Overdue & Aging", () => {
    it("should detect overdue invoices", () => {
      const inv = createInvoice({ dueDate: new Date("2026-01-01") }); // Past due
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 10000, gstRate: 0 });
      inv.send();
      expect(inv.isOverdue).toBe(true);
      expect(inv.daysOverdue).toBeGreaterThan(0);
    });

    it("should categorize into aging bucket", () => {
      const inv = createInvoice({ dueDate: new Date("2025-12-01") });
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 10000, gstRate: 0 });
      inv.send();
      expect(inv.agingBucket).toBe("90+");
    });

    it("should generate dunning notice for overdue invoices", () => {
      const inv = createInvoice({ dueDate: new Date("2026-02-01") });
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 10000, gstRate: 0 });
      inv.send();
      const notice = inv.generateDunningNotice();
      expect(notice).not.toBeNull();
      expect(notice!.amountDue).toBe(10000);
    });

    it("should NOT generate dunning for paid invoices", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 10000, gstRate: 0 });
      inv.send();
      inv.recordPayment({ id: "p1", amount: 10000, currency: "INR", method: "UPI", reference: "X", receivedAt: new Date() });
      expect(inv.generateDunningNotice()).toBeNull();
    });
  });

  describe("Cancellation", () => {
    it("should cancel an unpaid invoice", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 10000, gstRate: 0 });
      inv.cancel("Client withdrew");
      expect(inv.status).toBe(InvoiceStatus.CANCELLED);
    });

    it("should NOT cancel invoice with payments", () => {
      const inv = createInvoice();
      inv.addLineItem({ description: "Service", quantity: 1, unitPrice: 10000, gstRate: 0 });
      inv.send();
      inv.recordPayment({ id: "p1", amount: 5000, currency: "INR", method: "CASH", reference: "X", receivedAt: new Date() });
      expect(() => inv.cancel("Test")).toThrow("credit note");
    });
  });
});
