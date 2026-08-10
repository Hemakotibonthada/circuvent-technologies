/**
 * Turning power readings into money the household can actually save.
 *
 * The console already measures well: live watts, kWh since midnight, per-device
 * history, tariffs with time-of-use bands and Indian slab structures. What it
 * has never done is join the two and say what to do. A number in kilowatt-hours
 * is not a decision; "your geyser costs ₹340 a month more because it runs at
 * 7pm" is.
 *
 * WHY THIS IS NOT "AI THAT LEARNS YOUR PATTERNS".
 *
 * Learning a household's routine needs a record of that routine, and the fleet
 * retains 24 events and 151 telemetry rows in total. There is nothing to learn
 * from yet, and a model trained on two hours of one camera would produce
 * confident nonsense. Collection now runs on every alert sweep, so pattern work
 * becomes possible in weeks rather than never — and in the meantime everything
 * here is computable from a live reading and the tariff the user has already
 * configured. It is arithmetic they could check by hand, which is the right
 * standard for anything that tells somebody to change their habits.
 *
 * THE HARD PART IS NOT THE MATHS.
 *
 * It is refusing to give useless advice. Telling someone to run their fridge at
 * night, or to switch off a 2 W doorbell, is how an energy feature loses the
 * reader — and once it has, the one recommendation that would have saved real
 * money goes unread with the rest. So a device is only proposed for shifting if
 * it can be shifted, and a saving is only reported if it is worth more than the
 * effort of reading about it.
 *
 * Pure. No clock, no I/O; `now` and the readings come in as arguments.
 */
import type { Tariff, TouBand } from "@/app/smarthome/energy/tariff";
import { touRateForHour } from "@/app/smarthome/energy/tariff";

/** Below this monthly saving, saying nothing is more useful than saying something. */
export const MIN_MONTHLY_SAVING = 20;

/** A load that can wait. Everything else is either always-on or wanted on demand. */
const SHIFTABLE_TYPES = new Set([
  "aquaguard",
  "watertank",
  "agri-starter",
  "smart-plug",
  "water-heater",
  "geyser",
  "pump",
  "ev-charger",
  "washing-machine",
  "dishwasher",
]);

/**
 * A load nobody can sensibly move.
 *
 * Refrigeration, safety and security run when they run. Advice to shift them is
 * advice to ignore the whole panel.
 */
const NEVER_SHIFTABLE = new Set([
  "camera",
  "cctv",
  "doorbell",
  "anpr-cam",
  "guardian",
  "motion-sensor",
  "smart-lock",
  "facedoor",
  "rfid-gate",
  "sentinel",
  "fridge",
  "refrigerator",
  "light",
  "smart-light",
]);

export function isShiftable(deviceType: string): boolean {
  const t = (deviceType || "").toLowerCase();
  if (NEVER_SHIFTABLE.has(t)) return false;
  return SHIFTABLE_TYPES.has(t);
}

export interface EnergyDevice {
  id: string;
  name?: string;
  type: string;
  /** Present draw in watts, when the device meters. */
  watts?: number | null;
  /** Whether the load is currently on. */
  on?: boolean | null;
}

export type SavingKind = "standby-drain" | "peak-shift" | "slab-warning";

export interface Saving {
  kind: SavingKind;
  deviceIds: string[];
  title: string;
  /** What to do. Never a restatement of the problem. */
  action: string;
  /** Estimated rupees (or tariff currency) saved per month. */
  monthlySaving: number;
  /** The numbers behind the figure, so a reader can check it. */
  evidence: Record<string, number | string>;
}

const HOURS_PER_MONTH = 730;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(amount: number, tariff: Tariff): string {
  return `${tariff.symbol}${Math.round(amount)}`;
}

/**
 * Power drawn while nominally off, priced at the user's own tariff.
 *
 * analysis.ts already reports the watts. The watts are not the point — a
 * household cannot judge whether 6 W matters. The monthly cost can be judged
 * immediately, and it is the same number either way.
 */
export function standbyDrainSavings(devices: EnergyDevice[], tariff: Tariff, floorWatts = 3): Saving[] {
  const out: Saving[] = [];
  for (const d of devices || []) {
    const w = Number(d.watts);
    if (!Number.isFinite(w) || w < floorWatts) continue;
    if (d.on !== false) continue; // only when it claims to be off

    const kwhPerMonth = (w * HOURS_PER_MONTH) / 1000;
    // Standby runs at all hours, so an average across the day is the honest
    // rate for it rather than whichever band happens to apply right now.
    const rate = averageRate(tariff);
    const monthly = kwhPerMonth * rate;
    if (monthly < MIN_MONTHLY_SAVING) continue;

    out.push({
      kind: "standby-drain",
      deviceIds: [d.id],
      title: `${d.name || d.id} draws ${round2(w)} W while off`,
      action: `Switch it off at the socket, or put it on a smart plug that cuts power. That is ${money(monthly, tariff)} a month for nothing.`,
      monthlySaving: round2(monthly),
      evidence: { watts: round2(w), kwhPerMonth: round2(kwhPerMonth), ratePerKwh: round2(rate) },
    });
  }
  return out;
}

/** The rate a load pays if it runs evenly around the clock. */
function averageRate(tariff: Tariff): number {
  if (tariff.model !== "tou" || !tariff.bands?.length) return tariff.flatRate;
  let total = 0;
  for (let h = 0; h < 24; h++) total += touRateForHour(h, tariff);
  return total / 24;
}

/** The cheapest band, and the hour it starts. */
export function cheapestBand(tariff: Tariff): { band: TouBand; rate: number } | null {
  if (tariff.model !== "tou" || !tariff.bands?.length) return null;
  let best: TouBand | null = null;
  for (const b of tariff.bands) if (!best || b.rate < best.rate) best = b;
  return best ? { band: best, rate: best.rate } : null;
}

/**
 * A shiftable load running at an expensive hour.
 *
 * The saving is real and checkable: the same kilowatt-hours at a cheaper rate.
 * It is only offered for loads that can actually wait, and only when the two
 * rates differ enough to be worth the inconvenience.
 */
export function peakShiftSavings(
  devices: EnergyDevice[],
  tariff: Tariff,
  opts: { hour: number; assumedHoursPerDay?: number }
): Saving[] {
  if (tariff.model !== "tou") return [];
  const cheap = cheapestBand(tariff);
  if (!cheap) return [];

  const nowRate = touRateForHour(opts.hour, tariff);
  if (nowRate <= cheap.rate) return []; // already in the cheapest band

  const hoursPerDay = opts.assumedHoursPerDay ?? 2;
  const out: Saving[] = [];

  for (const d of devices || []) {
    if (!isShiftable(d.type)) continue;
    if (d.on !== true) continue;
    const w = Number(d.watts);
    if (!Number.isFinite(w) || w <= 0) continue;

    const kwhPerMonth = (w / 1000) * hoursPerDay * 30;
    const monthly = kwhPerMonth * (nowRate - cheap.rate);
    if (monthly < MIN_MONTHLY_SAVING) continue;

    out.push({
      kind: "peak-shift",
      deviceIds: [d.id],
      title: `${d.name || d.id} is running at the expensive rate`,
      action: `Schedule it for the ${cheap.band.label.toLowerCase()} band from ${formatHour(cheap.band.fromHour)}. Same energy, about ${money(monthly, tariff)} a month less.`,
      monthlySaving: round2(monthly),
      evidence: {
        watts: round2(w),
        currentRate: round2(nowRate),
        cheapestRate: round2(cheap.rate),
        assumedHoursPerDay: hoursPerDay,
        kwhPerMonth: round2(kwhPerMonth),
      },
    });
  }
  return out;
}

function formatHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  return `${String(hh).padStart(2, "0")}:00`;
}

export interface Slab {
  uptoKwh: number;
  ratePerKwh: number;
}

/**
 * How close this month is to a more expensive slab.
 *
 * Indian domestic tariffs step: every unit past a boundary costs more, and the
 * step is often 20–30%. Nothing in the console has ever mentioned it, so a
 * household crosses one without knowing and sees the result four weeks later on
 * a bill it cannot explain.
 *
 * This is a warning, not a saving, so the figure reported is what the rest of
 * the month costs extra at the higher rate — the money at stake, not money
 * already saved.
 */
export function slabWarning(
  monthToDateKwh: number,
  projectedMonthKwh: number,
  slabs: Slab[],
  tariff: Tariff
): Saving | null {
  if (!Array.isArray(slabs) || slabs.length < 2) return null;
  if (!Number.isFinite(monthToDateKwh) || monthToDateKwh < 0) return null;

  const sorted = [...slabs].sort((a, b) => a.uptoKwh - b.uptoKwh);
  const next = sorted.find((s) => s.uptoKwh > monthToDateKwh);
  if (!next) return null;
  const nextIdx = sorted.indexOf(next);
  const beyond = sorted[nextIdx + 1];
  if (!beyond) return null; // already in the top slab; nothing above to warn about

  const kwhToBoundary = next.uptoKwh - monthToDateKwh;
  // Only worth saying if the month is actually heading over the line.
  if (!Number.isFinite(projectedMonthKwh) || projectedMonthKwh <= next.uptoKwh) return null;

  const kwhOver = projectedMonthKwh - next.uptoKwh;
  const extra = kwhOver * (beyond.ratePerKwh - next.ratePerKwh);
  if (extra < MIN_MONTHLY_SAVING) return null;

  const stepPct = Math.round(((beyond.ratePerKwh - next.ratePerKwh) / next.ratePerKwh) * 100);

  return {
    kind: "slab-warning",
    deviceIds: [],
    title: `${round2(kwhToBoundary)} kWh from a more expensive tariff slab`,
    action: `Past ${next.uptoKwh} kWh every unit costs ${stepPct}% more. On the current pace this month goes ${round2(kwhOver)} kWh over, which is about ${money(extra, tariff)} extra.`,
    monthlySaving: round2(extra),
    evidence: {
      monthToDateKwh: round2(monthToDateKwh),
      projectedMonthKwh: round2(projectedMonthKwh),
      boundaryKwh: next.uptoKwh,
      currentRate: next.ratePerKwh,
      nextRate: beyond.ratePerKwh,
    },
  };
}

export interface EnergyAdvice {
  savings: Saving[];
  /** Sum of everything actionable, so a panel can lead with one number. */
  totalMonthlySaving: number;
  /** Present when there is nothing to say, explaining why. */
  note: string | null;
}

/**
 * Everything worth telling this household, worst first.
 *
 * Ordered by money rather than by category: a reader gives an energy panel
 * about one recommendation's worth of attention, and it should be the
 * expensive one.
 */
export function energyAdvice(input: {
  devices: EnergyDevice[];
  tariff: Tariff;
  hour: number;
  monthToDateKwh?: number;
  projectedMonthKwh?: number;
  slabs?: Slab[];
}): EnergyAdvice {
  const { devices, tariff, hour } = input;

  const savings: Saving[] = [
    ...standbyDrainSavings(devices, tariff),
    ...peakShiftSavings(devices, tariff, { hour }),
  ];

  if (input.slabs && input.monthToDateKwh != null && input.projectedMonthKwh != null) {
    const slab = slabWarning(input.monthToDateKwh, input.projectedMonthKwh, input.slabs, tariff);
    if (slab) savings.push(slab);
  }

  savings.sort((a, b) => b.monthlySaving - a.monthlySaving);
  const total = round2(savings.reduce((s, x) => s + x.monthlySaving, 0));

  let note: string | null = null;
  if (!savings.length) {
    /*
     * "Nothing wrong" and "nothing measured" look identical on screen and mean
     * opposite things — a healthy home, or a home with no metering at all.
     *
     * This counted metered devices with Number(d.watts), and Number(null) is 0,
     * which is finite. So a device reporting no power at all was counted as
     * metering zero watts, and a household with nothing measurable was told
     * everything was fine.
     */
    const metered = (devices || []).filter((d) => typeof d.watts === "number" && Number.isFinite(d.watts)).length;
    note = metered
      ? "Nothing is costing you money unnecessarily right now."
      : "No device is reporting power draw, so there is nothing to price. A metering plug or the energy monitor would let this work.";
  }

  return { savings, totalMonthlySaving: total, note };
}
