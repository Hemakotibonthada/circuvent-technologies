// ══════════════════════════════════════════════════════════════════════════════
// Client Portal — Revenue Forecast Domain Service
// Pipeline-weighted revenue projection, win-rate analysis,
// and quarterly forecast generation.
// ══════════════════════════════════════════════════════════════════════════════

import { LeadEntity, LeadStage } from "../entities/lead.entity";
import { InvoiceEntity, InvoiceStatus } from "../entities/invoice.entity";

/**
 * Revenue forecast for a period.
 */
export interface PeriodForecast {
  period: string;
  startDate: Date;
  endDate: Date;
  /** Confirmed revenue (paid invoices) */
  confirmedRevenue: number;
  /** Pipeline-weighted expected revenue from active leads */
  pipelineRevenue: number;
  /** Total forecast = confirmed + weighted pipeline */
  totalForecast: number;
  /** Breakdown by confidence level */
  byConfidence: {
    high: { count: number; value: number };
    medium: { count: number; value: number };
    low: { count: number; value: number };
  };
  /** Leads contributing to this forecast */
  contributingLeads: Array<{
    id: string;
    title: string;
    company: string;
    stage: string;
    value: number;
    weightedValue: number;
    probability: number;
    expectedClose: Date | null;
  }>;
}

/**
 * Win rate analysis result.
 */
export interface WinRateAnalysis {
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  activeLeads: number;
  winRate: number; // percentage
  avgDealSize: number;
  avgDaysToClose: number;
  bySource: Record<string, { total: number; won: number; rate: number }>;
  byStage: Record<string, { count: number; avgValue: number }>;
}

/**
 * AR Aging report.
 */
export interface AgingReport {
  current: { count: number; amount: number };
  "1-30": { count: number; amount: number };
  "31-60": { count: number; amount: number };
  "61-90": { count: number; amount: number };
  "90+": { count: number; amount: number };
  totalOutstanding: number;
  overduePercentage: number;
}

/**
 * Revenue Forecast Domain Service.
 *
 * Provides:
 * 1. Period-based revenue forecasting using pipeline probabilities
 * 2. Win rate analysis by source and stage
 * 3. Accounts receivable aging analysis
 * 4. Revenue trend computation
 *
 * @example
 * ```ts
 * const service = new RevenueForecastService();
 * const q2 = service.forecastPeriod(
 *   leads,
 *   invoices,
 *   new Date("2026-04-01"),
 *   new Date("2026-06-30"),
 *   "Q2 2026"
 * );
 * console.log(q2.totalForecast); // ₹45,00,000
 * ```
 */
export class RevenueForecastService {

  /**
   * Generates a revenue forecast for a specific period.
   */
  forecastPeriod(
    leads: LeadEntity[],
    invoices: InvoiceEntity[],
    startDate: Date,
    endDate: Date,
    periodLabel: string,
  ): PeriodForecast {
    // Confirmed revenue from paid invoices in the period
    const paidInvoices = invoices.filter(inv =>
      inv.status === InvoiceStatus.PAID &&
      inv.issueDate >= startDate &&
      inv.issueDate <= endDate
    );
    const confirmedRevenue = paidInvoices.reduce((s, inv) => s + inv.grandTotal, 0);

    // Pipeline revenue from active leads expected to close in this period
    const activeLeads = leads.filter(l => l.isActive && l.expectedCloseDate);
    const periodLeads = activeLeads.filter(l =>
      l.expectedCloseDate! >= startDate && l.expectedCloseDate! <= endDate
    );

    const contributingLeads = periodLeads.map(l => ({
      id: l.id,
      title: l.title,
      company: l.company,
      stage: l.stage,
      value: l.estimatedValue,
      weightedValue: l.weightedValue,
      probability: l.probability,
      expectedClose: l.expectedCloseDate,
    }));

    const pipelineRevenue = contributingLeads.reduce((s, l) => s + l.weightedValue, 0);

    // Confidence breakdown
    const high = contributingLeads.filter(l => l.probability >= 70);
    const medium = contributingLeads.filter(l => l.probability >= 40 && l.probability < 70);
    const low = contributingLeads.filter(l => l.probability < 40);

    return {
      period: periodLabel,
      startDate,
      endDate,
      confirmedRevenue: Math.round(confirmedRevenue),
      pipelineRevenue: Math.round(pipelineRevenue),
      totalForecast: Math.round(confirmedRevenue + pipelineRevenue),
      byConfidence: {
        high: { count: high.length, value: high.reduce((s, l) => s + l.weightedValue, 0) },
        medium: { count: medium.length, value: medium.reduce((s, l) => s + l.weightedValue, 0) },
        low: { count: low.length, value: low.reduce((s, l) => s + l.weightedValue, 0) },
      },
      contributingLeads,
    };
  }

  /**
   * Analyzes win rates across the lead pipeline.
   */
  analyzeWinRate(leads: LeadEntity[]): WinRateAnalysis {
    const won = leads.filter(l => l.stage === LeadStage.WON);
    const lost = leads.filter(l => l.stage === LeadStage.LOST);
    const active = leads.filter(l => l.isActive);
    const closed = [...won, ...lost];

    const winRate = closed.length > 0 ? (won.length / closed.length) * 100 : 0;
    const avgDealSize = won.length > 0 ? won.reduce((s, l) => s + l.estimatedValue, 0) / won.length : 0;

    // By source analysis
    const bySource: Record<string, { total: number; won: number; rate: number }> = {};
    for (const lead of closed) {
      if (!bySource[lead.source]) bySource[lead.source] = { total: 0, won: 0, rate: 0 };
      bySource[lead.source].total++;
      if (lead.stage === LeadStage.WON) bySource[lead.source].won++;
    }
    for (const source of Object.keys(bySource)) {
      bySource[source].rate = bySource[source].total > 0
        ? Math.round((bySource[source].won / bySource[source].total) * 100)
        : 0;
    }

    // By stage distribution
    const byStage: Record<string, { count: number; avgValue: number }> = {};
    for (const lead of leads) {
      if (!byStage[lead.stage]) byStage[lead.stage] = { count: 0, avgValue: 0 };
      byStage[lead.stage].count++;
    }
    for (const stage of Object.keys(byStage)) {
      const stageLeads = leads.filter(l => l.stage === stage);
      byStage[stage].avgValue = stageLeads.length > 0
        ? Math.round(stageLeads.reduce((s, l) => s + l.estimatedValue, 0) / stageLeads.length)
        : 0;
    }

    return {
      totalLeads: leads.length,
      wonLeads: won.length,
      lostLeads: lost.length,
      activeLeads: active.length,
      winRate: Math.round(winRate * 10) / 10,
      avgDealSize: Math.round(avgDealSize),
      avgDaysToClose: 0, // Would need activity timestamps
      bySource,
      byStage,
    };
  }

  /**
   * Generates an accounts receivable aging report.
   */
  generateAgingReport(invoices: InvoiceEntity[]): AgingReport {
    const unpaid = invoices.filter(inv =>
      inv.balanceDue > 0 &&
      ![InvoiceStatus.CANCELLED, InvoiceStatus.WRITTEN_OFF].includes(inv.status)
    );

    const buckets: Record<string, { count: number; amount: number }> = {
      "CURRENT": { count: 0, amount: 0 },
      "1-30": { count: 0, amount: 0 },
      "31-60": { count: 0, amount: 0 },
      "61-90": { count: 0, amount: 0 },
      "90+": { count: 0, amount: 0 },
    };

    for (const inv of unpaid) {
      const bucket = inv.agingBucket;
      buckets[bucket].count++;
      buckets[bucket].amount += inv.balanceDue;
    }

    const totalOutstanding = unpaid.reduce((s, inv) => s + inv.balanceDue, 0);
    const overdueAmount = totalOutstanding - buckets["CURRENT"].amount;

    return {
      current: buckets["CURRENT"],
      "1-30": buckets["1-30"],
      "31-60": buckets["31-60"],
      "61-90": buckets["61-90"],
      "90+": buckets["90+"],
      totalOutstanding: Math.round(totalOutstanding),
      overduePercentage: totalOutstanding > 0 ? Math.round((overdueAmount / totalOutstanding) * 100) : 0,
    };
  }

  /**
   * Identifies stale leads that need attention.
   */
  findStaleLeads(leads: LeadEntity[], daysThreshold: number = 14): Array<{
    id: string;
    title: string;
    company: string;
    stage: string;
    daysSinceActivity: number;
    estimatedValue: number;
    action: string;
  }> {
    return leads
      .filter(l => l.isStale(daysThreshold))
      .map(l => ({
        id: l.id,
        title: l.title,
        company: l.company,
        stage: l.stage,
        daysSinceActivity: l.daysSinceLastActivity(),
        estimatedValue: l.estimatedValue,
        action: l.daysSinceLastActivity() > 30 ? "ESCALATE — consider closing" :
                l.daysSinceLastActivity() > 21 ? "URGENT — schedule follow-up" :
                "Follow up with contact",
      }))
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  }
}
