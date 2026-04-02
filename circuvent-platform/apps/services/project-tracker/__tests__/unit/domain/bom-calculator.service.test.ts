// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — BOM Calculator Domain Service (Project Tracker)
// ══════════════════════════════════════════════════════════════════════════════

import { BOMCalculatorService, BOMLineItem } from "../../../src/domain/services/bom-calculator.service";

function createBOMItems(): BOMLineItem[] {
  return [
    { partNumber: "ESP32-WROOM", description: "MCU Module", category: "IC", quantity: 1, unitCost: 250, currency: "INR", leadTimeDays: 14, supplier: "Mouser", isRnDEligible: true },
    { partNumber: "BME280", description: "Temp/Humidity Sensor", category: "SENSOR", quantity: 2, unitCost: 180, currency: "INR", leadTimeDays: 7, supplier: "DigiKey", isRnDEligible: true },
    { partNumber: "PCB-MAIN-V3", description: "Main PCB 4-layer", category: "PCB", quantity: 1, unitCost: 450, currency: "INR", leadTimeDays: 21, supplier: "JLCPB", isRnDEligible: true },
    { partNumber: "ENCL-ABS-01", description: "ABS Enclosure", category: "MECHANICAL", quantity: 1, unitCost: 120, currency: "INR", leadTimeDays: 10, supplier: "LocalVendor", isRnDEligible: false },
    { partNumber: "CONN-USB-C", description: "USB-C Connector", category: "CONNECTOR", quantity: 1, unitCost: 35, currency: "INR", leadTimeDays: 5, supplier: "Mouser", isRnDEligible: false },
    { partNumber: "CAP-100UF", description: "100µF Capacitor", category: "COMPONENT", quantity: 4, unitCost: 8, currency: "INR", leadTimeDays: 3, supplier: "LCSC", isRnDEligible: false },
    { partNumber: "RES-10K", description: "10kΩ Resistor", category: "COMPONENT", quantity: 8, unitCost: 2, currency: "INR", leadTimeDays: 3, supplier: "LCSC", isRnDEligible: false },
  ];
}

describe("BOMCalculatorService", () => {
  let calculator: BOMCalculatorService;

  beforeEach(() => {
    calculator = new BOMCalculatorService();
  });

  describe("calculateCost", () => {
    it("should calculate total BOM cost", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);

      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.currency).toBe("INR");
      expect(result.grandTotal).toBe(result.totalCost + result.assemblyOverhead);
    });

    it("should calculate correct component costs for batch of 1", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);
      // ESP32 (250×1) + BME280 (180×2) + PCB (450×1) + Enclosure (120×1) + USB-C (35×1) + Caps (8×4) + Res (2×8) = 1263
      expect(result.totalCost).toBe(1263);
    });

    it("should apply quantity discount for batch of 100", () => {
      const items = createBOMItems();
      const result1 = calculator.calculateCost(items, 1);
      const result100 = calculator.calculateCost(items, 100);

      // Cost per unit should be lower in batch of 100
      expect(result100.costPerUnit).toBeLessThan(result1.costPerUnit);
    });

    it("should calculate R&D eligible cost", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);
      // ESP32 + 2×BME280 + PCB = 250 + 360 + 450 = 1060
      expect(result.rndEligibleCost).toBe(1060);
    });

    it("should find max lead time", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);
      expect(result.maxLeadTimeDays).toBe(21); // PCB has longest lead time
    });

    it("should count unique suppliers", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);
      expect(result.supplierCount).toBe(5); // Mouser, DigiKey, JLCPB, LocalVendor, LCSC
    });

    it("should include 15% assembly overhead", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);
      expect(result.assemblyOverhead).toBeCloseTo(result.totalCost * 0.15, 1);
    });

    it("should provide cost by category", () => {
      const items = createBOMItems();
      const result = calculator.calculateCost(items, 1);
      expect(result.costByCategory.IC).toBeDefined();
      expect(result.costByCategory.SENSOR).toBeDefined();
      expect(result.costByCategory.PCB).toBeDefined();
    });
  });

  describe("compareRevisions", () => {
    it("should compare costs across BOM revisions", () => {
      const rev1: BOMLineItem[] = [
        { partNumber: "ESP32", description: "MCU", category: "IC", quantity: 1, unitCost: 250, currency: "INR", leadTimeDays: 14, supplier: "Mouser", isRnDEligible: true },
      ];
      const rev2: BOMLineItem[] = [
        { partNumber: "ESP32-S3", description: "MCU v2", category: "IC", quantity: 1, unitCost: 320, currency: "INR", leadTimeDays: 14, supplier: "Mouser", isRnDEligible: true },
        { partNumber: "BME280", description: "Sensor", category: "SENSOR", quantity: 1, unitCost: 180, currency: "INR", leadTimeDays: 7, supplier: "DigiKey", isRnDEligible: true },
      ];

      const comparison = calculator.compareRevisions([
        { version: "v1.0", items: rev1 },
        { version: "v2.0", items: rev2 },
      ]);

      expect(comparison.length).toBe(2);
      expect(comparison[0].deltaFromPrevious).toBe(0); // First revision has no delta
      expect(comparison[1].deltaFromPrevious).toBeGreaterThan(0); // v2 is more expensive
    });
  });

  describe("identifyCriticalComponents", () => {
    it("should identify components with long lead time", () => {
      const items: BOMLineItem[] = [
        { partNumber: "LONG-LEAD", description: "Long lead part", category: "IC", quantity: 1, unitCost: 10, currency: "INR", leadTimeDays: 60, supplier: "UniqueSupplier", isRnDEligible: false },
        { partNumber: "NORMAL", description: "Normal part", category: "COMPONENT", quantity: 1, unitCost: 5, currency: "INR", leadTimeDays: 5, supplier: "CommonSupplier", isRnDEligible: false },
      ];

      const critical = calculator.identifyCriticalComponents(items);
      const longLead = critical.find((c: any) => c.partNumber === "LONG-LEAD");
      expect(longLead).toBeDefined();
      expect(longLead?.reason.some((r: any) => r.includes("lead time"))).toBe(true);
    });

    it("should identify single-source suppliers", () => {
      const items: BOMLineItem[] = [
        { partNumber: "SOLE-SRC", description: "Single source", category: "IC", quantity: 1, unitCost: 100, currency: "INR", leadTimeDays: 40, supplier: "OnlyThisGuy", isRnDEligible: false },
      ];

      const critical = calculator.identifyCriticalComponents(items);
      expect(critical.some((c: any) => c.reason.some((r: any) => r.includes("Single-source")))).toBe(true);
    });
  });
});
