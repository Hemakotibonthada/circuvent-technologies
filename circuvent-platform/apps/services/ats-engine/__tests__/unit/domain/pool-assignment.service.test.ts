// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Pool Assignment Service (ATS)
// ══════════════════════════════════════════════════════════════════════════════

import { PoolAssignmentService, TalentPoolRule, PoolCandidate } from "../../../src/domain/services/pool-assignment.service";

const service = new PoolAssignmentService();

const pools: TalentPoolRule[] = [
  {
    poolId: "pool-iot", poolName: "IoT Firmware Experts", category: "IOT_FIRMWARE", division: "IOT_EMBEDDED",
    rules: { skills: ["ESP32", "MQTT", "Embedded C", "FreeRTOS"], minExperience: 3, minScore: 60 },
  },
  {
    poolId: "pool-ai", poolName: "Niche AI Experts", category: "NICHE_AI_EXPERT", division: "AI_ML",
    rules: { skills: ["PyTorch", "TensorFlow", "Deep Learning"], minExperience: 2, minScore: 50 },
  },
  {
    poolId: "pool-senior", poolName: "Senior Leadership", category: "LEADERSHIP", division: null,
    rules: { minExperience: 10, minScore: 70 },
  },
  {
    poolId: "pool-campus", poolName: "Campus Pipeline", category: "INTERN_PIPELINE", division: null,
    rules: { sources: ["CAMPUS"], maxExperience: 2 },
  },
];

describe("PoolAssignmentService", () => {
  describe("Single Candidate Assignment", () => {
    it("should assign IoT expert to IoT pool", () => {
      const candidate: PoolCandidate = {
        candidateId: "c1", skills: ["ESP32", "MQTT", "FreeRTOS", "C++"],
        experienceYears: 5, source: "LINKEDIN", atsScore: 75, tags: [],
      };
      const result = service.assignToPool(candidate, pools);
      const iotPool = result.assignedPools.find(p => p.poolId === "pool-iot");
      expect(iotPool).toBeDefined();
      expect(iotPool?.matchReason).toContain("ESP32");
    });

    it("should assign AI specialist to AI pool", () => {
      const candidate: PoolCandidate = {
        candidateId: "c2", skills: ["PyTorch", "TensorFlow", "Python", "NLP"],
        experienceYears: 4, source: "WEBSITE", atsScore: 80, tags: [],
      };
      const result = service.assignToPool(candidate, pools);
      expect(result.assignedPools.some(p => p.poolId === "pool-ai")).toBe(true);
    });

    it("should assign to multiple pools if matching", () => {
      const candidate: PoolCandidate = {
        candidateId: "c3", skills: ["ESP32", "PyTorch", "IoT"],
        experienceYears: 12, source: "REFERRAL", atsScore: 85, tags: [],
      };
      const result = service.assignToPool(candidate, pools);
      // Should match IoT + AI + Senior Leadership (12 years, 85 score)
      expect(result.assignedPools.length).toBeGreaterThanOrEqual(2);
    });

    it("should reject candidates not meeting criteria", () => {
      const candidate: PoolCandidate = {
        candidateId: "c4", skills: ["Java", "Spring Boot"],
        experienceYears: 1, source: "WEBSITE", atsScore: 30, tags: [],
      };
      const result = service.assignToPool(candidate, pools);
      expect(result.assignedPools.length).toBe(0);
      expect(result.rejectedPools.length).toBeGreaterThan(0);
    });

    it("should match campus source for intern pool", () => {
      const candidate: PoolCandidate = {
        candidateId: "c5", skills: ["Python", "React"],
        experienceYears: 0, source: "CAMPUS", atsScore: 40, tags: [],
      };
      const result = service.assignToPool(candidate, pools);
      expect(result.assignedPools.some(p => p.poolId === "pool-campus")).toBe(true);
    });

    it("should set priority based on score", () => {
      const highScorer: PoolCandidate = {
        candidateId: "c6", skills: ["ESP32", "MQTT"],
        experienceYears: 5, source: "LINKEDIN", atsScore: 90, tags: [],
      };
      const result = service.assignToPool(highScorer, pools);
      const assigned = result.assignedPools[0];
      expect(assigned?.priority).toBe("CRITICAL"); // 90+ score
    });
  });

  describe("Batch Assignment", () => {
    it("should assign multiple candidates", () => {
      const candidates: PoolCandidate[] = [
        { candidateId: "b1", skills: ["ESP32"], experienceYears: 5, source: "LINKEDIN", atsScore: 70, tags: [] },
        { candidateId: "b2", skills: ["PyTorch"], experienceYears: 3, source: "WEBSITE", atsScore: 65, tags: [] },
        { candidateId: "b3", skills: ["Java"], experienceYears: 1, source: "CAMPUS", atsScore: 35, tags: [] },
      ];

      const results = service.batchAssign(candidates, pools);
      expect(results.length).toBe(3);
      expect(results[0].assignedPools.length).toBeGreaterThan(0); // IoT
      expect(results[1].assignedPools.length).toBeGreaterThan(0); // AI
    });
  });

  describe("Pool Suggestions", () => {
    it("should suggest new pools for unassigned candidates", () => {
      const unassigned: PoolCandidate[] = [
        { candidateId: "u1", skills: ["Kubernetes", "Docker", "Terraform"], experienceYears: 4, source: "WEBSITE", atsScore: 60, tags: [] },
        { candidateId: "u2", skills: ["Kubernetes", "AWS", "CI/CD"], experienceYears: 5, source: "LINKEDIN", atsScore: 65, tags: [] },
        { candidateId: "u3", skills: ["Kubernetes", "GCP", "Helm"], experienceYears: 3, source: "REFERRAL", atsScore: 55, tags: [] },
      ];

      const suggestions = service.suggestNewPools(unassigned);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].suggestedName.toLowerCase()).toContain("kubernetes");
      expect(suggestions[0].candidateCount).toBe(3);
    });
  });
});
