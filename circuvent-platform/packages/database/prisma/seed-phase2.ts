// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Phase 2 Enhanced Seed
// Seeds AI compute resources, statutory config, PT slabs,
// TDS slabs, and sample training jobs.
// Run after the base seed: npx ts-node prisma/seed-phase2.ts
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Phase 2 data...\n");

  // ── Statutory Config FY 2025-2026 ──
  const statutory = await prisma.statutoryConfig.upsert({
    where: { financialYear: "2025-2026" },
    update: {},
    create: {
      financialYear: "2025-2026",
      epfEmployeeRate: 0.12,
      epfEmployerRate: 0.12,
      epfWageCeiling: 15000,
      epsRate: 0.0833,
      esiEmployeeRate: 0.0075,
      esiEmployerRate: 0.0325,
      esiWageCeiling: 21000,
      ptMaxAnnual: 2500,
      gratuityRate: 0.0577,
      gratuityMinYears: 5,
      standardDeduction: 75000,
      cessRate: 0.04,
      isActive: true,
    },
  });
  console.log("  ✓ Statutory config:", statutory.financialYear);

  // ── Professional Tax Slabs — Karnataka ──
  const ptSlabs = [
    { state: "Karnataka", minSalary: 0, maxSalary: 15000, monthlyTax: 0, financialYear: "2025-2026" },
    { state: "Karnataka", minSalary: 15001, maxSalary: 99999999, monthlyTax: 200, financialYear: "2025-2026" },
    { state: "Maharashtra", minSalary: 0, maxSalary: 7500, monthlyTax: 0, financialYear: "2025-2026" },
    { state: "Maharashtra", minSalary: 7501, maxSalary: 10000, monthlyTax: 175, financialYear: "2025-2026" },
    { state: "Maharashtra", minSalary: 10001, maxSalary: 99999999, monthlyTax: 200, financialYear: "2025-2026" },
  ];

  for (const slab of ptSlabs) {
    await prisma.professionalTaxSlab.upsert({
      where: { state_minSalary_maxSalary_financialYear: {
        state: slab.state, minSalary: slab.minSalary, maxSalary: slab.maxSalary, financialYear: slab.financialYear,
      }},
      update: {},
      create: slab,
    });
  }
  console.log("  ✓ Professional Tax slabs seeded:", ptSlabs.length);

  // ── TDS Slabs — New Regime FY 2025-2026 ──
  const tdsSlabs = [
    { regime: "NEW", financialYear: "2025-2026", minIncome: 0, maxIncome: 400000, rate: 0 },
    { regime: "NEW", financialYear: "2025-2026", minIncome: 400001, maxIncome: 800000, rate: 0.05 },
    { regime: "NEW", financialYear: "2025-2026", minIncome: 800001, maxIncome: 1200000, rate: 0.10 },
    { regime: "NEW", financialYear: "2025-2026", minIncome: 1200001, maxIncome: 1600000, rate: 0.15 },
    { regime: "NEW", financialYear: "2025-2026", minIncome: 1600001, maxIncome: 2000000, rate: 0.20 },
    { regime: "NEW", financialYear: "2025-2026", minIncome: 2000001, maxIncome: 2400000, rate: 0.25 },
    { regime: "NEW", financialYear: "2025-2026", minIncome: 2400001, maxIncome: 999999999, rate: 0.30 },
    { regime: "OLD", financialYear: "2025-2026", minIncome: 0, maxIncome: 250000, rate: 0 },
    { regime: "OLD", financialYear: "2025-2026", minIncome: 250001, maxIncome: 500000, rate: 0.05 },
    { regime: "OLD", financialYear: "2025-2026", minIncome: 500001, maxIncome: 1000000, rate: 0.20 },
    { regime: "OLD", financialYear: "2025-2026", minIncome: 1000001, maxIncome: 999999999, rate: 0.30 },
  ];

  for (const slab of tdsSlabs) {
    await prisma.tDSSlab.upsert({
      where: { regime_financialYear_minIncome: { regime: slab.regime, financialYear: slab.financialYear, minIncome: slab.minIncome } },
      update: {},
      create: slab,
    });
  }
  console.log("  ✓ TDS slabs seeded:", tdsSlabs.length);

  // ── Compute Resources ──
  const resources = [
    { name: "NVIDIA A100 #1", type: "GPU", model: "NVIDIA A100 80GB", vramGb: 80, location: "DC-BLR-1, Rack-3", costPerHourINR: 180, status: "AVAILABLE" },
    { name: "NVIDIA A100 #2", type: "GPU", model: "NVIDIA A100 80GB", vramGb: 80, location: "DC-BLR-1, Rack-3", costPerHourINR: 180, status: "AVAILABLE" },
    { name: "NVIDIA RTX 4090 #1", type: "GPU", model: "NVIDIA RTX 4090 24GB", vramGb: 24, location: "DC-BLR-1, Rack-5", costPerHourINR: 85, status: "AVAILABLE" },
    { name: "AMD EPYC Server #1", type: "CPU", model: "AMD EPYC 7763 64-Core", coresCount: 64, memoryGb: 512, location: "DC-BLR-2, Rack-1", costPerHourINR: 45, status: "AVAILABLE" },
    { name: "AMD EPYC Server #2", type: "CPU", model: "AMD EPYC 7763 64-Core", coresCount: 64, memoryGb: 256, location: "DC-BLR-2, Rack-1", costPerHourINR: 35, status: "MAINTENANCE" },
  ];

  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const typePrefix = r.type === "GPU" ? "GPU" : "CPU";
    const resourceCode = `${typePrefix}-${String(i + 1).padStart(3, "0")}`;

    await prisma.computeResource.upsert({
      where: { resourceCode },
      update: {},
      create: {
        ...r,
        resourceCode,
        type: r.type as any,
        status: r.status as any,
      },
    });
  }
  console.log("  ✓ Compute resources seeded:", resources.length);

  // ── Sample Training Job ──
  const existingJob = await prisma.trainingJob.findUnique({ where: { jobCode: "TJ-2026-001" } });
  if (!existingJob) {
    const admin = await prisma.user.findUnique({ where: { email: "admin@circuvent.com" } });
    if (admin) {
      await prisma.trainingJob.create({
        data: {
          jobCode: "TJ-2026-001",
          name: "Anomaly Detection Model v3",
          description: "Training anomaly detection model for IoT sensor data",
          modelName: "anomaly-detector-v3",
          framework: "PyTorch",
          requestedById: admin.id,
          status: "QUEUED",
          priority: 3,
          datasetPath: "/data/iot-sensors/anomaly-v3",
          configJson: {
            learningRate: 0.0001,
            batchSize: 64,
            epochs: 50,
            optimizer: "AdamW",
            schedulerType: "cosine",
            warmupSteps: 500,
            weightDecay: 0.01,
          },
          epochsTotal: 50,
        },
      });
      console.log("  ✓ Sample training job created");
    }
  }

  // ── Sample Trading Bot ──
  const existingBot = await prisma.tradingBot.findUnique({ where: { botCode: "TB-MOME-01" } });
  if (!existingBot) {
    const admin = await prisma.user.findUnique({ where: { email: "admin@circuvent.com" } });
    if (admin) {
      await prisma.tradingBot.create({
        data: {
          botCode: "TB-MOME-01",
          name: "Momentum Alpha Bot",
          description: "Momentum-based trading strategy for NSE index futures",
          strategy: "momentum",
          status: "INACTIVE",
          configJson: {
            market: "NSE",
            instruments: ["NIFTY", "BANKNIFTY"],
            riskLimits: {
              maxPositionSize: 200000,
              maxDailyLoss: 25000,
              maxDrawdownPercent: 5,
              stopLossPercent: 1.5,
              takeProfitPercent: 3,
              maxOpenPositions: 4,
            },
            signalConfig: {
              lookbackPeriod: 20,
              signalThreshold: 0.65,
              rebalanceIntervalMinutes: 30,
            },
            executionConfig: {
              mode: "MARKET",
              slippageTolerance: 0.1,
              dryRun: true,
            },
          },
          createdById: admin.id,
        },
      });
      console.log("  ✓ Sample trading bot created");
    }
  }

  console.log("\n✅ Phase 2 seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
