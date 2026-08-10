/**
 * Predictive maintenance.
 *
 * The distinction this module exists to hold is between "something is wrong"
 * and "something is going to be wrong". The fleet already has the first:
 * analysis.ts finds a device that has stopped reporting, a load drawing power
 * while nominally off, a reading far outside its own history. All of it is
 * present tense. None of it tells anybody to do something before a failure.
 *
 * THE HARD PART IS REFUSING TO ANSWER.
 *
 * A predictive feature that always produces a number is worse than no feature.
 * Fit a line to anything and it will project a date; the projection will be
 * confidently wrong, somebody will act on it once, and after that nobody reads
 * any of them. So the default here is "not enough evidence", and a forecast
 * has to earn its way out of that:
 *
 *   - enough samples, spread over enough time to see a trend rather than an
 *     afternoon;
 *   - a slope large enough to matter against the noise in the same series;
 *   - a projection near enough to be actionable and far enough to be a
 *     prediction rather than a description of the present.
 *
 * Any of those failing produces `insufficient-data` with the reason, which is
 * a useful thing to display: it tells an operator the system is watching and
 * has nothing to say, which is different from the system not watching.
 *
 * THE SLOPE IS THEIL–SEN, NOT LEAST SQUARES.
 *
 * Device telemetry is spiky: a Wi-Fi reading during a microwave cycle, a power
 * sample during inrush. Least squares gives every outlier leverage
 * proportional to its distance, so one bad sample bends the forecast. Theil–Sen
 * takes the median of pairwise slopes and tolerates up to ~29% garbage before
 * it breaks, which is the right trade for readings from a radio on a wall.
 *
 * Pure. No clock of its own, no I/O; every entry point takes its samples and
 * its `now`, so the same input always produces the same forecast.
 */

export type Trend = "rising" | "falling" | "flat";

export type ForecastState =
  /** A projected date the operator can act on. */
  | "forecast"
  /** Watching, nothing conclusive. Not the same as healthy. */
  | "insufficient-data"
  /** Already past the threshold — this is observation, not prediction. */
  | "already-breached";

export interface Sample {
  /** Milliseconds since epoch. */
  at: number;
  value: number;
}

export interface Forecast {
  state: ForecastState;
  /** Units per day. Positive is rising. */
  slopePerDay: number;
  trend: Trend;
  /** Days until the threshold is crossed, when a forecast was possible. */
  daysToThreshold: number | null;
  /** ISO date the threshold is projected to be crossed. */
  projectedAt: string | null;
  /** Samples the forecast is based on. */
  samples: number;
  /** Days between the first and last sample. */
  spanDays: number;
  /** Plain-language explanation, always present — including why there is no forecast. */
  reason: string;
}

export interface ForecastOptions {
  /** The value that constitutes failure or a service point. */
  threshold: number;
  /** Whether crossing means going above or below the threshold. */
  direction: "above" | "below";
  now?: number;
  /** Fewest samples worth fitting. Below this, noise dominates. */
  minSamples?: number;
  /** Shortest span worth calling a trend. An afternoon is not one. */
  minSpanDays?: number;
  /** Furthest ahead worth reporting; beyond this it is speculation. */
  maxHorizonDays?: number;
}

const DAY_MS = 86_400_000;

const DEFAULTS = {
  minSamples: 12,
  minSpanDays: 3,
  maxHorizonDays: 180,
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Median absolute deviation, scaled to compare with a standard deviation.
 *
 * Used to size the noise floor for the same reason Theil–Sen is used for the
 * slope: one spike must not be able to make a series look either calm or wild.
 */
export function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Theil–Sen slope, in units per day.
 *
 * The median of the slopes between every pair of points. Quadratic in the
 * sample count, which is fine for the hundreds of readings a device produces
 * and would not be for millions; a caller with more should downsample first.
 */
export function theilSenSlopePerDay(samples: Sample[]): number {
  const pts = samples.filter((s) => Number.isFinite(s.at) && Number.isFinite(s.value)).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return 0;

  const slopes: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dtDays = (pts[j].at - pts[i].at) / DAY_MS;
      // Two readings in the same instant say nothing about rate of change and
      // would divide by ~zero.
      if (dtDays <= 1e-9) continue;
      slopes.push((pts[j].value - pts[i].value) / dtDays);
    }
  }
  return slopes.length ? median(slopes) : 0;
}

function noForecast(samples: Sample[], slopePerDay: number, reason: string): Forecast {
  const span = spanDays(samples);
  return {
    state: "insufficient-data",
    slopePerDay,
    trend: trendOf(slopePerDay, samples),
    daysToThreshold: null,
    projectedAt: null,
    samples: samples.length,
    spanDays: span,
    reason,
  };
}

function spanDays(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  const ats = samples.map((s) => s.at).filter(Number.isFinite);
  if (ats.length < 2) return 0;
  return (Math.max(...ats) - Math.min(...ats)) / DAY_MS;
}

/**
 * How much the series scatters around its own trend line.
 *
 * Measuring noise from the raw values, as this first did, is backwards for
 * exactly the series that matter: a steady decline has a large spread, so the
 * "noise floor" grows with the trend and a clean linear signal is reported as
 * flat. The longer and clearer the trend, the flatter it looked.
 *
 * The residuals are what is left after the trend is removed, which is the
 * actual jitter. MAD of those tolerates a spike the way Theil–Sen does.
 */
function residualNoise(samples: Sample[], slopePerDay: number): number {
  const pts = samples.filter((s) => Number.isFinite(s.at) && Number.isFinite(s.value));
  if (pts.length < 3) return 0;
  const t0 = Math.min(...pts.map((s) => s.at));
  // Intercept as the median residual, keeping the whole fit robust.
  const offsets = pts.map((s) => s.value - slopePerDay * ((s.at - t0) / DAY_MS));
  const intercept = median(offsets);
  const residuals = pts.map((s) => s.value - (intercept + slopePerDay * ((s.at - t0) / DAY_MS)));
  return mad(residuals);
}

function trendOf(slopePerDay: number, samples: Sample[]): Trend {
  // Against the scatter around the trend, not the spread of the values —
  // otherwise a longer, cleaner trend reads as flatter.
  const noise = residualNoise(samples, slopePerDay);
  const floor = Math.max(noise / 10, 1e-9);
  if (slopePerDay > floor) return "rising";
  if (slopePerDay < -floor) return "falling";
  return "flat";
}

/**
 * When will this series cross the threshold?
 *
 * Returns a forecast only when the evidence supports one. Everything else is
 * `insufficient-data` with the reason spelled out.
 */
export function forecastThreshold(samples: Sample[], opts: ForecastOptions): Forecast {
  const now = opts.now ?? Date.now();
  const minSamples = opts.minSamples ?? DEFAULTS.minSamples;
  const minSpanDays = opts.minSpanDays ?? DEFAULTS.minSpanDays;
  const maxHorizonDays = opts.maxHorizonDays ?? DEFAULTS.maxHorizonDays;

  const clean = (samples || []).filter((s) => s && Number.isFinite(s.at) && Number.isFinite(s.value));
  const slope = theilSenSlopePerDay(clean);

  if (clean.length < minSamples) {
    return noForecast(clean, slope, `Only ${clean.length} readings; ${minSamples} are needed before a trend means anything.`);
  }

  const span = spanDays(clean);
  if (span < minSpanDays) {
    return noForecast(
      clean,
      slope,
      `Readings span ${span.toFixed(1)} days; a trend needs at least ${minSpanDays}. An afternoon of data describes an afternoon.`
    );
  }

  const latest = [...clean].sort((a, b) => a.at - b.at)[clean.length - 1];
  const breached = opts.direction === "above" ? latest.value >= opts.threshold : latest.value <= opts.threshold;
  if (breached) {
    return {
      state: "already-breached",
      slopePerDay: slope,
      trend: trendOf(slope, clean),
      daysToThreshold: 0,
      projectedAt: new Date(latest.at).toISOString(),
      samples: clean.length,
      spanDays: span,
      reason: `Already at ${round(latest.value)} against a threshold of ${opts.threshold}. This is a current fault, not a forecast.`,
    };
  }

  /*
   * Is the movement real, or is it the series' own jitter?
   *
   * Measured against the scatter around the trend line rather than the spread
   * of the values. Using the raw spread rejected exactly the signals worth
   * catching: a clean, steady decline has a wide range of values, so it looked
   * noisier the longer it had been declining.
   */
  const noise = residualNoise(clean, slope);
  if (Math.abs(slope) <= noise) {
    return noForecast(
      clean,
      slope,
      `Movement of ${round(slope)}/day is within the scatter of this series (±${round(noise)}). Nothing to project.`
    );
  }

  const movingToward = opts.direction === "above" ? slope > 0 : slope < 0;
  if (!movingToward) {
    return noForecast(clean, slope, `Trending away from the threshold. Nothing to schedule.`);
  }

  const daysToThreshold = (opts.threshold - latest.value) / slope;
  if (!Number.isFinite(daysToThreshold) || daysToThreshold <= 0) {
    return noForecast(clean, slope, `No usable projection from this series.`);
  }
  if (daysToThreshold > maxHorizonDays) {
    return noForecast(
      clean,
      slope,
      `On the current trend the threshold is ${Math.round(daysToThreshold)} days away, beyond the ${maxHorizonDays}-day horizon worth acting on.`
    );
  }

  return {
    state: "forecast",
    slopePerDay: slope,
    trend: trendOf(slope, clean),
    daysToThreshold,
    projectedAt: new Date(now + daysToThreshold * DAY_MS).toISOString(),
    samples: clean.length,
    spanDays: span,
    reason: `Moving ${round(slope)}/day; on this trend it reaches ${opts.threshold} in about ${Math.round(daysToThreshold)} days.`,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Service intervals — the part that works without a trend             */
/* ------------------------------------------------------------------ */

export interface ServiceDue {
  due: boolean;
  /** Negative when already overdue. */
  daysRemaining: number | null;
  reason: string;
}

/**
 * Maintenance that is scheduled rather than predicted.
 *
 * A filter due at 2000 running hours needs no statistics; it needs a counter
 * and arithmetic. This is separated from forecasting deliberately, because it
 * is the half that is trustworthy on day one — it depends on a number the
 * device already reports, not on months of history nobody has retained yet.
 */
export function serviceByRuntime(
  runtimeHours: number,
  intervalHours: number,
  opts: { hoursPerDay?: number; warnWithinHours?: number } = {}
): ServiceDue {
  const interval = Math.max(1, intervalHours);
  const hours = Math.max(0, Number(runtimeHours) || 0);
  const used = hours % interval;
  const remaining = interval - used;
  const warnWithin = opts.warnWithinHours ?? interval * 0.1;

  if (hours >= interval && used < 1e-9) {
    return { due: true, daysRemaining: 0, reason: `Service interval of ${interval} hours reached.` };
  }
  if (remaining > warnWithin) {
    const perDay = opts.hoursPerDay;
    return {
      due: false,
      daysRemaining: perDay && perDay > 0 ? remaining / perDay : null,
      reason: `${Math.round(remaining)} hours until the next service.`,
    };
  }
  const perDay = opts.hoursPerDay;
  return {
    due: true,
    daysRemaining: perDay && perDay > 0 ? remaining / perDay : null,
    reason: `${Math.round(remaining)} hours until the next service — within the reminder window.`,
  };
}

/**
 * How much history a device would need before a forecast is possible.
 *
 * Exposed so a panel can say "watching, 3 of 12 readings" instead of showing
 * an empty space. An operator seeing nothing assumes the feature is broken; an
 * operator seeing progress knows it is collecting.
 */
export function historyRequirement(
  samples: Sample[],
  opts: { minSamples?: number; minSpanDays?: number } = {}
): { ready: boolean; haveSamples: number; needSamples: number; haveSpanDays: number; needSpanDays: number } {
  const minSamples = opts.minSamples ?? DEFAULTS.minSamples;
  const minSpanDays = opts.minSpanDays ?? DEFAULTS.minSpanDays;
  const clean = (samples || []).filter((s) => s && Number.isFinite(s.at) && Number.isFinite(s.value));
  const span = spanDays(clean);
  return {
    ready: clean.length >= minSamples && span >= minSpanDays,
    haveSamples: clean.length,
    needSamples: minSamples,
    haveSpanDays: Math.round(span * 10) / 10,
    needSpanDays: minSpanDays,
  };
}
