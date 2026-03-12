// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Revenue Forecast Domain Service
// ══════════════════════════════════════════════════════════════════════════════

import { RevenueForecastService } from "../../../src/domain/services/revenue-forecast.service";
import { LeadEntity, LeadStage } from "../../../src/domain/entities/lead.entity";
import { InvoiceEntity, InvoiceStatus } from "../../../src/domain/entities/invoice.entity";

function createLead(stage: LeadStage, value: number, closeDate?: Date): LeadEntity {
  return new LeadEntity({
    id: `lead-${Math.random().toString(36).slice(2, 6)}`,
    title: "Test Lead", company: "TestCorp", contactName: "Test",
    stage, estimatedValue: value,
    expectedCloseDate: closeDate || new Date("2026-05-15"),
    source: "WEBSITE",
  });
}

function createInvoice(total: number, status: InvoiceStatus, issueDate: Date): InvoiceEntity {
  const inv = new InvoiceEntity({
    id: `inv-${Math.random().toString(36).slice(2, 6)}`,
    invoiceNumber: `INV-${Math.random().toString(36).slice(2, 6)}`,
    clientId: "c1", clientName: "TestCorp",
    status, issueDate,
  });
  inv.addLineItem({ description: "Service", quantity: 1, unitPrice: total, gstRate: 0 });
  if (status === InvoiceStatus.PAID) {
    (inv as any)._status = InvoiceStatus.SENT;
    inv.recordPayment({ id: "p1", amount: total, currency: "INR", method: "BANK_TRANSFER", reference: "X", receivedAt: new Date() });
  }
  return inv;
}

describe("RevenueForecastService", () => {
  let service: RevenueForecastService;

  beforeEach(() => { service = new RevenueForecastService(); });

  describe("Period Forecasting", () => {
    it("should combine confirmed revenue and pipeline", () => {
      const leads = [
        createLead(LeadStage.NEGOTIATION, 100000, new Date("2026-05-15")),
        createLead(LeadStage.QUALIFIED, 200000, new Date("2026-05-20")),
      ];
      const invoices = [
        createInvoice(50000, InvoiceStatus.PAID, new Date("2026-04-15")),
      ];

      const forecast = service.forecastPeriod(
        leads, invoices,
        new Date("2026-04-01"), new Date("2026-06-30"),
        "Q2 2026"
      );

      expect(forecast.confirmedRevenue).toBe(50000);
      expect(forecast.pipelineRevenue).toBeGreaterThan(0);
      expect(forecast.totalForecast).toBe(forecast.confirmedRevenue + forecast.pipelineRevenue);
    });

    it("should break down by confidence", () => {
      const leads = [
        createLead(LeadStage.NEGOTIATION, 100000), // 80% prob = HIGH
        createLead(LeadStage.QUALIFIED, 200000),    // 40% prob = MEDIUM
        createLead(LeadStage.CONTACTED, 50000),     // 20% prob = LOW
      ];

      const forecast = service.forecastPeriod(leads, [], new Date("2026-04-01"), new Date("2026-06-30"), "Q2");
      expect(forecast.byConfidence.high.count).toBe(1);
      expect(forecast.byConfidence.medium.count).toBe(1);
      expect(forecast.byConfidence.low.count).toBe(1);
    });

    it("should exclude leads closing outside period", () => {
      const leads = [
        createLead(LeadStage.QUALIFIED, 500000, new Date("2027-01-15")),
      ];

      const forecast = service.forecastPeriod(leads, [], new Date("2026-04-01"), new Date("2026-06-30"), "Q2");
      expect(forecast.pipelineRevenue).toBe(0);
      expect(forecast.contributingLeads.length).toBe(0);
    });
  });

  describe("Win Rate Analysis", () => {
    it("should calculate win rate", () => {
      const leads = [
        createLead(LeadStage.WON, 100000),
        createLead(LeadStage.WON, 200000),
        createLead(LeadStage.LOST, 150000),
        createLead(LeadStage.QUALIFIED, 80000),
      ];

      const analysis = service.analyzeWinRate(leads);
      expect(analysis.totalLeads).toBe(4);
      expect(analysis.wonLeads).toBe(2);
      expect(analysis.lostLeads).toBe(1);
      expect(analysis.activeLeads).toBe(1);
      expect(analysis.winRate).toBeCloseTo(66.7, 0);
    });

    it("should calculate average deal size", () => {
      const leads = [
        createLead(LeadStage.WON, 100000),
        createLead(LeadStage.WON, 300000),
      ];
      const analysis = service.analyzeWinRate(leads);
      expect(analysis.avgDealSize).toBe(200000);
    });

    it("should break down by source", () => {
      const leads = [
        new LeadEntity({ id: "1", title: "A", company: "A", contactName: "A", stage: LeadStage.WON, estimatedValue: 100000, source: "LINKEDIN" }),
        new LeadEntity({ id: "2", title: "B", company: "B", contactName: "B", stage: LeadStage.LOST, estimatedValue: 50000, source: "LINKEDIN" }),
        new LeadEntity({ id: "3", title: "C", company: "C", contactName: "C", stage: LeadStage.WON, estimatedValue: 80000, source: "REFERRAL" }),
      ];
      const analysis = service.analyzeWinRate(leads);
      expect(analysis.bySource.LINKEDIN.rate).toBe(50);
      expect(analysis.bySource.REFERRAL.rate).toBe(100);
    });
  });

  describe("Aging Report", () => {
    it("should categorize outstanding invoices", () => {
      const invoices = [
        createInvoice(50000, InvoiceStatus.SENT, new Date()),
        createInvoice(30000, InvoiceStatus.SENT, new Date("2026-01-15")),
      ];
      // Force due dates for aging
      invoices[0].dueDate = new Date("2026-04-15"); // Not overdue yet
      invoices[1].dueDate = new Date("2025-12-01"); // 90+ days overdue

      const report = service.generateAgingReport(invoices);
      expect(report.totalOutstanding).toBeGreaterThan(0);
    });
  });

  describe("Stale Lead Detection", () => {
    it("should find stale leads", () => {
      const leads = [
        createLead(LeadStage.CONTACTED, 100000),
        createLead(LeadStage.QUALIFIED, 200000),
      ];
      // Both have no activity → stale
      const stale = service.findStaleLeads(leads, 14);
      expect(stale.length).toBe(2);
    });

    it("should not flag recently active leads", () => {
      const lead = createLead(LeadStage.NEW, 100000);
      lead.moveTo(LeadStage.CONTACTED); // Adds activity
      const stale = service.findStaleLeads([lead], 14);
      expect(stale.length).toBe(0);
    });
  });
});
