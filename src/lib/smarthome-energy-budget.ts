// Energy Budgets & Tariffs — local tariff-slab configuration and a monthly
// budget target, layered on top of the existing energy summary/series data
// from control-plane.ts. Client-side only (localStorage).

const KEY = "cv-console-energy-budget";

export interface TariffSlab {
  uptoKwh: number; // upper bound of this slab (Infinity-like: use a very large number for the last slab)
  ratePerKwh: number;
}

export interface EnergyBudgetSettings {
  monthlyBudgetKwh: number;
  alertThresholdPct: number;
  slabs: TariffSlab[];
}

function defaults(): EnergyBudgetSettings {
  return {
    monthlyBudgetKwh: 250,
    alertThresholdPct: 85,
    // A typical Indian domestic slab structure — fully editable by the user.
    slabs: [
      { uptoKwh: 100, ratePerKwh: 4.5 },
      { uptoKwh: 200, ratePerKwh: 6.5 },
      { uptoKwh: 300, ratePerKwh: 8.5 },
      { uptoKwh: 999999, ratePerKwh: 10.5 },
    ],
  };
}

export function getSettings(): EnergyBudgetSettings {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<EnergyBudgetSettings>) };
  } catch {
    return defaults();
  }
}

export function saveSettings(settings: EnergyBudgetSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** Walks cumulative tariff slabs to price a total kWh figure for the month so far. */
export function computeSlabCost(kwh: number, slabs: TariffSlab[]): number {
  let remaining = kwh;
  let cost = 0;
  let lowerBound = 0;
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const slabWidth = Math.max(0, slab.uptoKwh - lowerBound);
    const consumedInSlab = Math.min(remaining, slabWidth);
    cost += consumedInSlab * slab.ratePerKwh;
    remaining -= consumedInSlab;
    lowerBound = slab.uptoKwh;
  }
  return Math.round(cost * 100) / 100;
}
