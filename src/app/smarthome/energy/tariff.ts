"use client";

export type RateModel = "flat" | "tou";

export interface TouBand {
  label: string;
  /** Inclusive start hour, 0–23. */
  fromHour: number;
  /** Exclusive end hour, 0–23. Wrap-around (e.g. 23→7) is supported. */
  toHour: number;
  rate: number;
}

export interface Tariff {
  model: RateModel;
  currency: string;
  symbol: string;
  flatRate: number;
  /** Fixed daily charge added to cost irrespective of consumption. */
  standingCharge: number;
  /** Applicable when model === "tou". */
  bands: TouBand[];
}

export const DEFAULT_TARIFF: Tariff = {
  model: "flat",
  currency: "USD",
  symbol: "$",
  flatRate: 0.13,
  standingCharge: 0.30,
  bands: [
    { label: "Peak", fromHour: 7, toHour: 23, rate: 0.20 },
    { label: "Off-peak", fromHour: 23, toHour: 7, rate: 0.08 },
  ],
};

export function flatCost(kwh: number, tariff: Tariff): number {
  return kwh * tariff.flatRate;
}

/** Rate applicable at a given hour of the day for a ToU tariff. Falls back to flatRate. */
export function touRateForHour(hour: number, tariff: Tariff): number {
  for (const b of tariff.bands) {
    if (b.fromHour < b.toHour) {
      if (hour >= b.fromHour && hour < b.toHour) return b.rate;
    } else {
      // overnight wrap-around, e.g. 23:00–07:00
      if (hour >= b.fromHour || hour < b.toHour) return b.rate;
    }
  }
  return tariff.flatRate;
}

/**
 * Estimate total cost from a watts time-series.
 * `granularityHours` converts each avg-watts sample to kWh for that slot.
 */
export function estimateCostFromSeries(
  points: { t: number; v: number }[],
  tariff: Tariff,
  granularityHours = 0.25
): number {
  if (tariff.model === "flat") {
    const kwh = points.reduce((s, p) => s + (p.v * granularityHours) / 1000, 0);
    return flatCost(kwh, tariff);
  }
  return points.reduce((sum, p) => {
    const hour = new Date(p.t).getHours();
    const rate = touRateForHour(hour, tariff);
    const kwh = (p.v * granularityHours) / 1000;
    return sum + kwh * rate;
  }, 0);
}

export function formatCost(amount: number, tariff: Tariff, digits = 2): string {
  if (!Number.isFinite(amount)) return "—";
  return `${tariff.symbol}${amount.toFixed(digits)}`;
}
