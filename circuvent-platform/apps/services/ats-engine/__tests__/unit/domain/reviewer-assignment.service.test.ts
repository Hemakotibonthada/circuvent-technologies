// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Reviewer Assignment Service
// Tests round-robin, load-balanced, and expertise-match strategies.
// ══════════════════════════════════════════════════════════════════════════════

import { ReviewerAssignmentService, ReviewerInfo, AssignmentRequest } from "../../../src/domain/services/reviewer-assignment.service";

const service = new ReviewerAssignmentService();

function createReviewers(): ReviewerInfo[] {
  return [
    { reviewerId: "r1", reviewerName: "Alice", department: "Engineering", activeReviews: 2, totalReviews: 10, maxCapacity: 5, isAvailable: true, lastAssignedAt: new Date("2026-03-10T10:00:00"), expertiseAreas: ["TypeScript", "Node.js", "React"] },
    { reviewerId: "r2", reviewerName: "Bob", department: "Engineering", activeReviews: 4, totalReviews: 15, maxCapacity: 5, isAvailable: true, lastAssignedAt: new Date("2026-03-10T14:00:00"), expertiseAreas: ["ESP32", "MQTT", "Embedded C", "IoT"] },
    { reviewerId: "r3", reviewerName: "Carol", department: "HR", activeReviews: 1, totalReviews: 8, maxCapacity: 5, isAvailable: true, lastAssignedAt: new Date("2026-03-09T09:00:00"), expertiseAreas: ["Recruitment", "Culture"] },
    { reviewerId: "r4", reviewerName: "Dave", department: "Engineering", activeReviews: 5, totalReviews: 20, maxCapacity: 5, isAvailable: true, lastAssignedAt: new Date("2026-03-10T16:00:00"), expertiseAreas: ["Python", "PyTorch", "ML"] },
    { reviewerId: "r5", reviewerName: "Eve", department: "Engineering", activeReviews: 0, totalReviews: 0, maxCapacity: 5, isAvailable: false, lastAssignedAt: null, expertiseAreas: ["AWS", "Kubernetes"] },
  ];
}

describe("ReviewerAssignmentService", () => {
  describe("Load Balancing", () => {
    it("should assign to least-loaded reviewer", () => {
      const result = service.assign(
        { applicationId: "app-1", jobDivision: "IOT_EMBEDDED", jobDepartment: "Engineering", requiredSkills: [], roundType: "SCREENING" },
        createReviewers()
      );
      // Carol has fewest (1), but it's HR. Alice has 2 — should pick Alice or Carol
      expect(result.assignedReviewer).not.toBeNull();
      expect(result.assignedReviewer!.activeReviews).toBeLessThanOrEqual(2);
    });

    it("should skip unavailable reviewers", () => {
      const result = service.assign(
        { applicationId: "app-2", jobDivision: "DEVOPS", jobDepartment: "Engineering", requiredSkills: ["AWS"], roundType: "SCREENING" },
        createReviewers()
      );
      // Eve is unavailable, should NOT be assigned
      expect(result.assignedReviewer?.reviewerId).not.toBe("r5");
    });

    it("should skip at-capacity reviewers", () => {
      const result = service.assign(
        { applicationId: "app-3", jobDivision: "AI_ML", jobDepartment: "Engineering", requiredSkills: [], roundType: "SCREENING" },
        createReviewers()
      );
      // Dave is at capacity (5/5), should NOT be assigned
      expect(result.assignedReviewer?.reviewerId).not.toBe("r4");
    });
  });

  describe("Expertise Match", () => {
    it("should prefer IoT expert for TECHNICAL round with IoT skills", () => {
      const result = service.assign(
        { applicationId: "app-4", jobDivision: "IOT_EMBEDDED", jobDepartment: "Engineering", requiredSkills: ["ESP32", "MQTT", "Embedded C"], roundType: "TECHNICAL" },
        createReviewers()
      );
      expect(result.strategy).toBe("EXPERTISE_MATCH");
      expect(result.assignedReviewer?.reviewerName).toBe("Bob");
    });

    it("should fallback to load balance if no expertise match", () => {
      const result = service.assign(
        { applicationId: "app-5", jobDivision: "DESIGN", jobDepartment: "Design", requiredSkills: ["Figma", "UI/UX"], roundType: "TECHNICAL" },
        createReviewers()
      );
      // No one has Figma expertise, should fallback
      expect(["LOAD_BALANCED", "ROUND_ROBIN"]).toContain(result.strategy);
    });
  });

  describe("HR Round Routing", () => {
    it("should prefer HR department for HR rounds", () => {
      const result = service.assign(
        { applicationId: "app-6", jobDivision: "FULL_STACK", jobDepartment: "Engineering", requiredSkills: [], roundType: "HR" },
        createReviewers()
      );
      expect(result.assignedReviewer?.department).toContain("HR");
      expect(result.assignedReviewer?.reviewerName).toBe("Carol");
    });
  });

  describe("No Availability", () => {
    it("should return null when all reviewers are unavailable", () => {
      const unavailable = createReviewers().map(r => ({ ...r, isAvailable: false }));
      const result = service.assign(
        { applicationId: "app-7", jobDivision: "AI_ML", jobDepartment: "Engineering", requiredSkills: [], roundType: "SCREENING" },
        unavailable
      );
      expect(result.assignedReviewer).toBeNull();
      expect(result.strategy).toBe("NONE");
    });
  });

  describe("Batch Assignment", () => {
    it("should distribute evenly across reviewers", () => {
      const requests: AssignmentRequest[] = Array.from({ length: 6 }, (_, i) => ({
        applicationId: `batch-${i}`, jobDivision: "FULL_STACK", jobDepartment: "Eng", requiredSkills: [], roundType: "SCREENING",
      }));

      const reviewers = createReviewers().map(r => ({ ...r, activeReviews: 0, isAvailable: true }));
      const results = service.batchAssign(requests, reviewers);

      const assignedIds = results.map(r => r.assignedReviewer?.reviewerId).filter(Boolean);
      // Should use multiple different reviewers, not pile on one
      const unique = new Set(assignedIds);
      expect(unique.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Workload Stats", () => {
    it("should compute workload distribution", () => {
      const stats = service.getWorkloadStats(createReviewers());
      expect(stats.totalReviewers).toBe(5);
      expect(stats.availableReviewers).toBe(4);
      expect(stats.atCapacity).toBe(1); // Dave
      expect(stats.distribution.length).toBe(5);
      expect(stats.distribution[0].utilization).toBeGreaterThanOrEqual(stats.distribution[4].utilization);
    });
  });
});
