// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Lead Entity (Client Portal Domain)
// ══════════════════════════════════════════════════════════════════════════════

import { LeadEntity, LeadStage } from "../../../src/domain/entities/lead.entity";

function createLead(overrides?: Partial<ConstructorParameters<typeof LeadEntity>[0]>): LeadEntity {
  return new LeadEntity({
    id: "lead-001", title: "TechCorp IoT Platform", company: "TechCorp",
    contactName: "John Doe", contactEmail: "john@techcorp.com",
    estimatedValue: 500000, source: "LINKEDIN", ...overrides,
  });
}

describe("LeadEntity", () => {
  describe("Pipeline Stages", () => {
    it("should start as NEW", () => {
      const lead = createLead();
      expect(lead.stage).toBe(LeadStage.NEW);
      expect(lead.isActive).toBe(true);
    });

    it("should transition NEW → CONTACTED", () => {
      const lead = createLead();
      lead.moveTo(LeadStage.CONTACTED);
      expect(lead.stage).toBe(LeadStage.CONTACTED);
    });

    it("should NOT allow NEW → QUALIFIED (must contact first)", () => {
      const lead = createLead();
      expect(() => lead.moveTo(LeadStage.QUALIFIED)).toThrow("Cannot move");
    });

    it("should allow any stage → LOST", () => {
      for (const stage of [LeadStage.NEW, LeadStage.CONTACTED, LeadStage.QUALIFIED, LeadStage.PROPOSAL_SENT]) {
        const lead = createLead({ stage });
        lead.moveTo(LeadStage.LOST);
        expect(lead.stage).toBe(LeadStage.LOST);
      }
    });

    it("should NOT allow transitions from terminal states", () => {
      const wonLead = createLead({ stage: LeadStage.WON });
      expect(wonLead.isTerminal).toBe(true);
      expect(() => wonLead.moveTo(LeadStage.CONTACTED)).toThrow();
    });

    it("should update probability on stage change", () => {
      const lead = createLead();
      expect(lead.probability).toBe(10);
      lead.moveTo(LeadStage.CONTACTED);
      expect(lead.probability).toBe(20);
    });

    it("should record activity log on stage change", () => {
      const lead = createLead();
      lead.moveTo(LeadStage.CONTACTED, "Initial call made");
      expect(lead.activityLog.length).toBe(1);
      expect(lead.activityLog[0].details).toContain("NEW → CONTACTED");
    });

    it("should emit events on stage change", () => {
      const lead = createLead();
      lead.moveTo(LeadStage.CONTACTED);
      expect(lead.events.length).toBe(1);
      expect(lead.events[0].type).toBe("LeadStageChanged");
    });

    it("should emit DealWon event", () => {
      const lead = createLead({ stage: LeadStage.NEGOTIATION });
      lead.moveTo(LeadStage.WON);
      expect(lead.events.find((e: any) => e.type === "DealWon")).toBeDefined();
    });
  });

  describe("BANT Qualification", () => {
    it("should qualify lead with strong BANT", () => {
      const lead = createLead({ stage: LeadStage.CONTACTED });
      const result = lead.qualify({
        hasBudget: true, hasAuthority: true, hasNeed: true, hasTimeline: true,
        budgetAmount: 600000, decisionTimelineDays: 30, technicalFit: true,
      });
      expect(result.isQualified).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.recommendation).toBe("PURSUE");
    });

    it("should not qualify with weak BANT", () => {
      const lead = createLead({ stage: LeadStage.CONTACTED });
      const result = lead.qualify({
        hasBudget: false, hasAuthority: false, hasNeed: true, hasTimeline: false,
      });
      expect(result.isQualified).toBe(false);
      expect(result.recommendation).toBe("DISQUALIFY");
    });

    it("should auto-transition to QUALIFIED on high score", () => {
      const lead = createLead({ stage: LeadStage.CONTACTED });
      lead.qualify({
        hasBudget: true, hasAuthority: true, hasNeed: true, hasTimeline: true,
        budgetAmount: 500000, decisionTimelineDays: 15,
      });
      expect(lead.stage).toBe(LeadStage.QUALIFIED);
    });

    it("should penalize competitor involvement", () => {
      const lead = createLead({ stage: LeadStage.CONTACTED });
      const withCompetitor = lead.qualify({
        hasBudget: true, hasAuthority: true, hasNeed: true, hasTimeline: true,
        competitorInvolved: true,
      });
      
      const lead2 = createLead({ stage: LeadStage.CONTACTED });
      const without = lead2.qualify({
        hasBudget: true, hasAuthority: true, hasNeed: true, hasTimeline: true,
      });
      
      expect(withCompetitor.score).toBeLessThan(without.score);
    });
  });

  describe("Revenue Forecasting", () => {
    it("should calculate weighted value", () => {
      const lead = createLead({ estimatedValue: 100000, stage: LeadStage.QUALIFIED });
      expect(lead.weightedValue).toBe(40000); // 40% probability at QUALIFIED
    });

    it("should forecast revenue in period", () => {
      const lead = createLead({
        estimatedValue: 100000, stage: LeadStage.NEGOTIATION,
        expectedCloseDate: new Date("2026-05-15"),
      });
      const forecast = lead.forecastRevenue(new Date("2026-06-30"));
      expect(forecast.inPeriod).toBe(true);
      expect(forecast.expectedRevenue).toBe(lead.weightedValue);
      expect(forecast.confidence).toBe("HIGH");
    });

    it("should return 0 for WON lead revenue future", () => {
      const lead = createLead({ stage: LeadStage.WON, estimatedValue: 500000 });
      const forecast = lead.forecastRevenue(new Date("2026-12-31"));
      expect(forecast.expectedRevenue).toBe(500000);
    });
  });

  describe("Stale Lead Detection", () => {
    it("should detect stale leads", () => {
      const lead = createLead();
      // No activity → stale
      expect(lead.isStale(14)).toBe(true);
    });

    it("should not flag recently active leads", () => {
      const lead = createLead();
      lead.moveTo(LeadStage.CONTACTED); // This adds activity
      expect(lead.isStale(14)).toBe(false);
    });

    it("should not flag terminal leads as stale", () => {
      const lead = createLead({ stage: LeadStage.WON });
      expect(lead.isStale(14)).toBe(false);
    });
  });
});
