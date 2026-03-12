// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Hiring Stage Value Object
// Tests state machine transitions and stage metadata.
// ══════════════════════════════════════════════════════════════════════════════

import { HiringStageVO } from "../../../src/domain/value-objects/hiring-stage.vo";

describe("HiringStageVO", () => {
  describe("Creation", () => {
    it("should create from valid stage string", () => {
      const stage = HiringStageVO.of("APPLIED");
      expect(stage.value).toBe("APPLIED");
    });

    it("should reject invalid stage", () => {
      expect(() => HiringStageVO.of("INVALID")).toThrow("Invalid hiring stage");
    });
  });

  describe("Transitions", () => {
    it("should allow APPLIED → SCREENING", () => {
      const stage = HiringStageVO.of("APPLIED");
      const next = stage.transitionTo("SCREENING");
      expect(next.value).toBe("SCREENING");
    });

    it("should allow SCREENING → SHORTLISTED", () => {
      const stage = HiringStageVO.of("SCREENING");
      const next = stage.transitionTo("SHORTLISTED");
      expect(next.value).toBe("SHORTLISTED");
    });

    it("should NOT allow APPLIED → HIRED (must go through pipeline)", () => {
      const stage = HiringStageVO.of("APPLIED");
      expect(() => stage.transitionTo("HIRED")).toThrow("Cannot transition");
    });

    it("should NOT allow HIRED → anything (terminal state)", () => {
      const stage = HiringStageVO.of("HIRED");
      expect(stage.allowedTransitions).toHaveLength(0);
    });

    it("should allow any stage → REJECTED", () => {
      for (const source of ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND", "FINAL_ROUND"]) {
        const stage = HiringStageVO.of(source);
        expect(stage.canTransitionTo("REJECTED")).toBe(true);
      }
    });

    it("should allow any stage → WITHDRAWN", () => {
      for (const source of ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND"]) {
        const stage = HiringStageVO.of(source);
        expect(stage.canTransitionTo("WITHDRAWN")).toBe(true);
      }
    });

    it("should allow ON_HOLD → back into pipeline", () => {
      const stage = HiringStageVO.of("ON_HOLD");
      expect(stage.canTransitionTo("SCREENING")).toBe(true);
      expect(stage.canTransitionTo("TECHNICAL_ROUND")).toBe(true);
    });

    it("should allow OFFER_EXTENDED → ACCEPTED or DECLINED", () => {
      const stage = HiringStageVO.of("OFFER_EXTENDED");
      expect(stage.canTransitionTo("OFFER_ACCEPTED")).toBe(true);
      expect(stage.canTransitionTo("OFFER_DECLINED")).toBe(true);
    });

    it("should NOT allow REJECTED → anything", () => {
      const stage = HiringStageVO.of("REJECTED");
      expect(stage.allowedTransitions).toHaveLength(0);
    });
  });

  describe("Terminal States", () => {
    it("HIRED, REJECTED, WITHDRAWN, OFFER_DECLINED are terminal", () => {
      expect(HiringStageVO.of("HIRED").isTerminal).toBe(true);
      expect(HiringStageVO.of("REJECTED").isTerminal).toBe(true);
      expect(HiringStageVO.of("WITHDRAWN").isTerminal).toBe(true);
      expect(HiringStageVO.of("OFFER_DECLINED").isTerminal).toBe(true);
    });

    it("Active stages are not terminal", () => {
      expect(HiringStageVO.of("APPLIED").isActive).toBe(true);
      expect(HiringStageVO.of("SCREENING").isActive).toBe(true);
      expect(HiringStageVO.of("OFFER_EXTENDED").isActive).toBe(true);
    });
  });

  describe("Progress Tracking", () => {
    it("should calculate pipeline progress", () => {
      expect(HiringStageVO.of("APPLIED").progressPercent).toBe(0);
      expect(HiringStageVO.of("SCREENING").progressPercent).toBeLessThan(30);
      expect(HiringStageVO.of("HIRED").progressPercent).toBe(100);
    });

    it("terminal non-pipeline stages should be 0%", () => {
      expect(HiringStageVO.of("REJECTED").progressPercent).toBe(0);
      expect(HiringStageVO.of("WITHDRAWN").progressPercent).toBe(0);
    });
  });

  describe("Metadata", () => {
    it("should have label, color, icon", () => {
      const stage = HiringStageVO.of("APPLIED");
      expect(stage.meta.label).toBe("Applied");
      expect(stage.meta.color).toBe("blue");
      expect(stage.meta.icon).toBe("📩");
    });
  });
});
