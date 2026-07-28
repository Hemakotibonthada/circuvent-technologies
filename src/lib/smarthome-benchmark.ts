// Cost Comparison / Benchmark — compares the user's own live energy usage
// against reference averages for similar home sizes. The reference figures
// are static published-style estimates (clearly presented as estimates, not
// measured data); the comparison math itself is real and uses the user's
// actual energySummary.todayKwh from control-plane.ts.

const KEY = "cv-console-home-size";

export type HomeSize = "1bhk" | "2bhk" | "3bhk" | "villa";

export const HOME_SIZE_LABELS: Record<HomeSize, string> = {
  "1bhk": "1BHK apartment",
  "2bhk": "2BHK apartment",
  "3bhk": "3BHK apartment",
  villa: "Independent house / villa",
};

/** Typical daily kWh reference figures for Indian homes, by size (estimates). */
export const BENCHMARK_KWH_PER_DAY: Record<HomeSize, number> = {
  "1bhk": 4.5,
  "2bhk": 7.5,
  "3bhk": 11,
  villa: 16,
};

export function getHomeSize(): HomeSize {
  if (typeof window === "undefined") return "2bhk";
  const v = window.localStorage.getItem(KEY);
  return v === "1bhk" || v === "3bhk" || v === "villa" ? v : "2bhk";
}

export function setHomeSize(size: HomeSize): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, size);
}

export interface BenchmarkComparison {
  yourKwh: number;
  averageKwh: number;
  diffPct: number; // negative means you use less than average
  betterThanAverage: boolean;
}

export function compareToAverage(yourKwhToday: number, size: HomeSize): BenchmarkComparison {
  const averageKwh = BENCHMARK_KWH_PER_DAY[size];
  const diffPct = averageKwh ? Math.round(((yourKwhToday - averageKwh) / averageKwh) * 100) : 0;
  return { yourKwh: yourKwhToday, averageKwh, diffPct, betterThanAverage: diffPct <= 0 };
}
