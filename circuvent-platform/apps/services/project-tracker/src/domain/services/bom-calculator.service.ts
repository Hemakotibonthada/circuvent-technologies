// ══════════════════════════════════════════════════════════════════════════════
// Project Tracker — BOM Cost Calculator Domain Service
// Calculates Bill of Materials cost with multi-currency support,
// quantity breaks, and R&D tax tagging.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A single line item in a Bill of Materials.
 */
export interface BOMLineItem {
  partNumber: string;
  description: string;
  category: "COMPONENT" | "PCB" | "MECHANICAL" | "CONNECTOR" | "IC" | "SENSOR" | "OTHER";
  quantity: number;
  unitCost: number;
  currency: string;
  leadTimeDays: number;
  supplier: string;
  isRnDEligible: boolean;
}

/**
 * BOM cost breakdown result.
 */
export interface BOMCostBreakdown {
  /** Total cost of all line items */
  totalCost: number;
  /** Cost by category */
  costByCategory: Record<string, { count: number; cost: number }>;
  /** Total R&D eligible cost (for tax credits under Section 35) */
  rndEligibleCost: number;
  /** Longest lead time in days */
  maxLeadTimeDays: number;
  /** Unique suppliers count */
  supplierCount: number;
  /** Cost per unit (if quantity provided) */
  costPerUnit: number;
  /** Assembly overhead estimate (15% of component cost) */
  assemblyOverhead: number;
  /** Grand total including overhead */
  grandTotal: number;
  /** Currency */
  currency: string;
}

/**
 * Quantity price break tier.
 */
export interface QuantityBreak {
  minQuantity: number;
  maxQuantity: number;
  discount: number; // percentage
}

/** Standard quantity breaks for electronics components */
const QUANTITY_BREAKS: QuantityBreak[] = [
  { minQuantity: 1, maxQuantity: 99, discount: 0 },
  { minQuantity: 100, maxQuantity: 499, discount: 5 },
  { minQuantity: 500, maxQuantity: 999, discount: 10 },
  { minQuantity: 1000, maxQuantity: 4999, discount: 15 },
  { minQuantity: 5000, maxQuantity: Infinity, discount: 20 },
];

/** Assembly overhead percentage */
const ASSEMBLY_OVERHEAD_RATE = 0.15;

/**
 * BOM Calculator Domain Service.
 *
 * Provides:
 * - Total cost calculation with quantity breaks
 * - Category-wise cost breakdown
 * - R&D tax-eligible cost identification
 * - Lead time analysis
 * - Multi-revision cost comparison
 *
 * @example
 * ```ts
 * const calculator = new BOMCalculatorService();
 * const breakdown = calculator.calculateCost(bomItems, 100);
 * console.log(breakdown.totalCost);      // 45,230.00
 * console.log(breakdown.rndEligibleCost); // 12,500.00+
 * ```
 */
export class BOMCalculatorService {

  /**
   * Calculates the full BOM cost breakdown.
   *
   * @param items BOM line items
   * @param batchQuantity Number of units to produce (for quantity breaks)
   * @param currency Target currency for output
   * @returns Complete cost breakdown
   */
  calculateCost(
    items: BOMLineItem[],
    batchQuantity: number = 1,
    currency: string = "INR",
  ): BOMCostBreakdown {
    const costByCategory: Record<string, { count: number; cost: number }> = {};
    let totalCost = 0;
    let rndEligibleCost = 0;
    let maxLeadTimeDays = 0;
    const suppliers = new Set<string>();

    for (const item of items) {
      // Apply quantity break discount
      const discount = this.getQuantityDiscount(item.quantity * batchQuantity);
      const effectiveUnitCost = item.unitCost * (1 - discount / 100);
      const lineCost = effectiveUnitCost * item.quantity * batchQuantity;

      totalCost += lineCost;

      if (item.isRnDEligible) {
        rndEligibleCost += lineCost;
      }

      if (item.leadTimeDays > maxLeadTimeDays) {
        maxLeadTimeDays = item.leadTimeDays;
      }

      suppliers.add(item.supplier);

      if (!costByCategory[item.category]) {
        costByCategory[item.category] = { count: 0, cost: 0 };
      }
      costByCategory[item.category].count += item.quantity;
      costByCategory[item.category].cost += lineCost;
    }

    const assemblyOverhead = totalCost * ASSEMBLY_OVERHEAD_RATE;

    return {
      totalCost: Number(totalCost.toFixed(2)),
      costByCategory,
      rndEligibleCost: Number(rndEligibleCost.toFixed(2)),
      maxLeadTimeDays,
      supplierCount: suppliers.size,
      costPerUnit: batchQuantity > 0 ? Number(((totalCost + assemblyOverhead) / batchQuantity).toFixed(2)) : 0,
      assemblyOverhead: Number(assemblyOverhead.toFixed(2)),
      grandTotal: Number((totalCost + assemblyOverhead).toFixed(2)),
      currency,
    };
  }

  /**
   * Compares BOM costs across revisions to show cost deltas.
   *
   * @param revisions Array of { version, items } pairs
   * @param batchQuantity Quantity for cost calculation
   * @returns Cost comparison across revisions
   */
  compareRevisions(
    revisions: Array<{ version: string; items: BOMLineItem[] }>,
    batchQuantity: number = 1,
  ): Array<{
    version: string;
    totalCost: number;
    grandTotal: number;
    itemCount: number;
    deltaFromPrevious: number;
    deltaPercent: number;
  }> {
    let previousCost = 0;

    return revisions.map(rev => {
      const breakdown = this.calculateCost(rev.items, batchQuantity);
      const delta = previousCost > 0 ? breakdown.grandTotal - previousCost : 0;
      const deltaPercent = previousCost > 0 ? Number(((delta / previousCost) * 100).toFixed(2)) : 0;
      previousCost = breakdown.grandTotal;

      return {
        version: rev.version,
        totalCost: breakdown.totalCost,
        grandTotal: breakdown.grandTotal,
        itemCount: rev.items.length,
        deltaFromPrevious: Number(delta.toFixed(2)),
        deltaPercent,
      };
    });
  }

  /**
   * Identifies critical components (high cost, long lead time, single source).
   */
  identifyCriticalComponents(items: BOMLineItem[]): Array<{
    partNumber: string;
    reason: string[];
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
  }> {
    const avgCost = items.reduce((s, i) => s + i.unitCost * i.quantity, 0) / items.length;
    const supplierCounts = new Map<string, number>();
    items.forEach(i => supplierCounts.set(i.supplier, (supplierCounts.get(i.supplier) || 0) + 1));

    return items.map(item => {
      const reasons: string[] = [];
      if (item.unitCost * item.quantity > avgCost * 3) reasons.push("High cost (>3x average)");
      if (item.leadTimeDays > 30) reasons.push(`Long lead time (${item.leadTimeDays} days)`);
      if ((supplierCounts.get(item.supplier) || 0) === 1) reasons.push("Single-source supplier");

      const riskLevel = (reasons.length >= 2 ? "HIGH" : reasons.length === 1 ? "MEDIUM" : "LOW") as "LOW" | "MEDIUM" | "HIGH";

      return { partNumber: item.partNumber, reason: reasons, riskLevel };
    }).filter(c => c.reason.length > 0);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getQuantityDiscount(totalQuantity: number): number {
    const tier = QUANTITY_BREAKS.find(b => totalQuantity >= b.minQuantity && totalQuantity <= b.maxQuantity);
    return tier?.discount ?? 0;
  }
}
