// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Model Registry Entity (AI/MLOps Domain)
// ══════════════════════════════════════════════════════════════════════════════

import { ModelRegistryEntity, ModelStage } from "../../../src/domain/entities/model-registry.entity";

function createModel(overrides?: Partial<ConstructorParameters<typeof ModelRegistryEntity>[0]>): ModelRegistryEntity {
  return new ModelRegistryEntity({
    id: "m-001",
    name: "anomaly-detector",
    version: "2.1.0",
    type: "CLASSIFICATION",
    framework: "PyTorch",
    metrics: { accuracy: 0.95, f1Score: 0.93, latencyP99Ms: 45 },
    createdBy: "data-team",
    ...overrides,
  });
}

describe("ModelRegistryEntity", () => {
  describe("Creation", () => {
    it("should create a model in DEVELOPMENT stage", () => {
      const model = createModel();
      expect(model.stage).toBe(ModelStage.DEVELOPMENT);
      expect(model.name).toBe("anomaly-detector");
      expect(model.version).toBe("2.1.0");
    });
  });

  describe("Promotion Lifecycle", () => {
    it("should promote DEVELOPMENT → STAGING", () => {
      const model = createModel();
      model.promoteToStaging("reviewer-001");
      expect(model.stage).toBe(ModelStage.STAGING);
      expect(model.stagingApprovedBy).toBe("reviewer-001");
      expect(model.promotedToStagingAt).not.toBeNull();
    });

    it("should promote STAGING → PRODUCTION", () => {
      const model = createModel();
      model.promoteToStaging("reviewer-001");
      model.promoteToProduction("ml-admin", {
        endpoint: "/v1/anomaly-detector",
        replicas: 2,
        gpuType: "T4",
        maxBatchSize: 32,
        timeoutMs: 100,
        minInstances: 1,
        maxInstances: 4,
        autoscaleMetric: "rps",
        autoscaleThreshold: 1000,
      });
      expect(model.stage).toBe(ModelStage.PRODUCTION);
      expect(model.deploymentConfig?.endpoint).toBe("/v1/anomaly-detector");
    });

    it("should NOT promote DEVELOPMENT → PRODUCTION directly", () => {
      const model = createModel();
      expect(() => model.promoteToProduction("admin", {} as any)).toThrow("must be STAGING");
    });

    it("should NOT promote without metrics", () => {
      const model = createModel({ metrics: {} });
      expect(() => model.promoteToStaging("reviewer")).toThrow("without training metrics");
    });

    it("should archive from any active stage", () => {
      const model = createModel();
      model.promoteToStaging("reviewer");
      model.archive("Superseded by v3", "admin");
      expect(model.stage).toBe(ModelStage.ARCHIVED);
      expect(model.archivedAt).not.toBeNull();
    });

    it("should NOT archive already archived model", () => {
      const model = createModel();
      model.archive("Test", "admin");
      expect(() => model.archive("Again", "admin")).toThrow("already archived");
    });
  });

  describe("SLA Tracking", () => {
    it("should record SLA breaches", () => {
      const model = createModel();
      model.recordSLABreach("latencyP99", 150, 100);
      expect(model.slaBreaches).toBe(1);
    });

    it("should flag review after 3 breaches", () => {
      const model = createModel();
      model.recordSLABreach("latency", 150, 100);
      model.recordSLABreach("latency", 200, 100);
      model.recordSLABreach("latency", 180, 100);
      const event = model.events.find((e: any) => e.payload.requiresReview === true);
      expect(event).toBeDefined();
    });
  });

  describe("Quality Gates", () => {
    it("should pass quality gate with good metrics", () => {
      const model = createModel({ metrics: { accuracy: 0.95, latencyP99Ms: 45, throughputRPS: 2000 } });
      const result = model.meetsQualityGate({
        minAccuracy: 0.90,
        maxLatencyP99Ms: 100,
        minThroughputRPS: 1000,
      });
      expect(result.passes).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it("should fail quality gate with bad metrics", () => {
      const model = createModel({ metrics: { accuracy: 0.75, latencyP99Ms: 200 } });
      const result = model.meetsQualityGate({
        minAccuracy: 0.90,
        maxLatencyP99Ms: 100,
      });
      expect(result.passes).toBe(false);
      expect(result.failures.length).toBe(2);
    });
  });

  describe("Domain Events", () => {
    it("should emit events on promotion", () => {
      const model = createModel();
      model.promoteToStaging("reviewer");
      expect(model.events.find((e: any) => e.type === "ModelPromotedToStaging")).toBeDefined();
    });

    it("should emit archive event with previous stage", () => {
      const model = createModel();
      model.promoteToStaging("reviewer");
      model.archive("Replaced", "admin");
      const event = model.events.find((e: any) => e.type === "ModelArchived");
      expect(event?.payload.previousStage).toBe("STAGING");
    });
  });
});
