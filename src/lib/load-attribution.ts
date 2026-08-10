/**
 * What each load actually draws.
 *
 * There are two honest ways to know, and one dishonest one.
 *
 * The direct way: a metering channel per load. cv-em3 in a switchboard gives
 * three loads their own shunt, and the answer needs no inference at all — it
 * is a measurement. Where that exists, this module gets out of the way.
 *
 * The inferred way: one meter on the incoming supply, plus knowledge of which
 * relays are on. When a channel switches and nothing else changes, the step in
 * total power IS that load's draw. Observe a few of those and the fan's
 * consumption is known to within the noise of the observation — not modelled,
 * measured, just measured indirectly.
 *
 * The dishonest way is to disaggregate a single whole-home reading with no
 * switching information and present the result as fact. That is a real field
 * of research (NILM) and it does not work well enough on a 10-second average
 * to tell somebody their fridge costs them 300 rupees a month. Nothing here
 * attempts it. A load whose draw has never been observed is reported as
 * unknown, which an operator can act on — by metering it — in a way that a
 * confident wrong number does not allow.
 *
 * THE EDGE HAS TO BE CLEAN.
 *
 * A step is only attributable when exactly one thing changed. If the geyser
 * and the pump switch within the same sample, the step is their sum and
 * assigning it to either is worse than assigning it to neither. Samples where
 * more than one channel moved are discarded, which throws away a lot of
 * observations in a busy house and keeps the ones that are true.
 *
 * Pure: samples and `now` come in as arguments.
 */

export interface PowerSample {
  at: number;
  /** Total measured watts at this instant. */
  totalWatts: number;
  /** Which loads were on, by stable key. */
  on: Record<string, boolean>;
}

export interface LoadProfile {
  key: string;
  /** Median observed step, in watts. */
  watts: number;
  /** How many clean transitions this is based on. */
  observations: number;
  /** Spread across observations — a wide one means a variable load, not a wrong answer. */
  spreadWatts: number;
  /** True when the figure came from the load's own metering channel. */
  measured: boolean;
  confidence: "measured" | "high" | "low" | "unknown";
}

/** Below this a step is indistinguishable from another appliance cycling. */
export const MIN_STEP_WATTS = 5;

/** Fewer than this and one odd observation dominates the median. */
const MIN_OBSERVATIONS_FOR_CONFIDENCE = 3;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Which single load changed between two samples, if exactly one did.
 *
 * Returns null when nothing changed or when more than one did — the second
 * case is the important one, because a step covering two loads is not evidence
 * about either.
 */
export function soleTransition(prev: PowerSample, next: PowerSample): { key: string; turnedOn: boolean } | null {
  const keys = new Set([...Object.keys(prev.on || {}), ...Object.keys(next.on || {})]);
  let found: { key: string; turnedOn: boolean } | null = null;

  for (const key of keys) {
    const before = Boolean(prev.on?.[key]);
    const after = Boolean(next.on?.[key]);
    if (before === after) continue;
    if (found) return null; // two things moved; the step belongs to neither
    found = { key, turnedOn: after };
  }
  return found;
}

/**
 * Learn each load's draw from the steps in total power.
 *
 * Both directions are used: switching on gives a positive step, switching off
 * a negative one, and both are the same quantity. Using only one throws away
 * half the evidence, and in a house where things are turned off more
 * deliberately than on, often the better half.
 */
export function learnLoadProfiles(samples: PowerSample[]): Record<string, LoadProfile> {
  const observations: Record<string, number[]> = {};
  const ordered = [...(samples || [])].filter((s) => s && Number.isFinite(s.at) && Number.isFinite(s.totalWatts)).sort((a, b) => a.at - b.at);

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const next = ordered[i];
    const change = soleTransition(prev, next);
    if (!change) continue;

    const delta = next.totalWatts - prev.totalWatts;
    // A step in the wrong direction is not this load: something else moved
    // between the samples, or the meter was still settling.
    const step = change.turnedOn ? delta : -delta;
    if (!Number.isFinite(step) || step < MIN_STEP_WATTS) continue;

    (observations[change.key] ??= []).push(step);
  }

  const out: Record<string, LoadProfile> = {};
  for (const [key, steps] of Object.entries(observations)) {
    const watts = median(steps);
    out[key] = {
      key,
      watts: Math.round(watts * 10) / 10,
      observations: steps.length,
      spreadWatts: Math.round(mad(steps) * 10) / 10,
      measured: false,
      confidence: steps.length >= MIN_OBSERVATIONS_FOR_CONFIDENCE ? "high" : "low",
    };
  }
  return out;
}

export interface MeteredChannel {
  key: string;
  watts: number;
}

/**
 * Combine what was measured with what was inferred.
 *
 * A directly metered channel always wins. Inference is a way to know something
 * about a load nobody put a shunt on; it is not a second opinion about one
 * they did.
 */
export function attributeConsumption(
  metered: MeteredChannel[],
  inferred: Record<string, LoadProfile>,
  knownLoads: string[] = []
): Record<string, LoadProfile> {
  const out: Record<string, LoadProfile> = {};

  for (const [key, profile] of Object.entries(inferred || {})) {
    out[key] = profile;
  }

  for (const m of metered || []) {
    if (!m?.key || !Number.isFinite(m.watts)) continue;
    out[m.key] = {
      key: m.key,
      watts: Math.round(m.watts * 10) / 10,
      observations: 0,
      spreadWatts: 0,
      measured: true,
      confidence: "measured",
    };
  }

  /*
   * A load nobody has observed is named as unknown rather than omitted.
   *
   * Leaving it out makes the breakdown look complete when it is not, and the
   * missing rows are exactly the ones worth acting on: "no idea what this
   * costs" is a reason to fit a metering channel, and an absent row is not.
   */
  for (const key of knownLoads) {
    if (out[key]) continue;
    out[key] = { key, watts: 0, observations: 0, spreadWatts: 0, measured: false, confidence: "unknown" };
  }

  return out;
}

export interface Breakdown {
  loads: LoadProfile[];
  /** Watts accounted for by loads that are currently on. */
  accountedWatts: number;
  /** Measured total minus what the profiles explain. */
  unaccountedWatts: number;
  /** True when a meaningful share of the total has no explanation. */
  hasGap: boolean;
  note: string | null;
}

/**
 * What is drawing power right now, and how much of the total is unexplained.
 *
 * The unaccounted figure is the honest part. Everything that is not switched
 * through the system — the fridge, the router, whatever is plugged into a wall
 * socket — still shows up in the incoming total, and a breakdown that quietly
 * distributed it across the known loads would inflate every one of them. It is
 * reported as its own line instead.
 */
export function currentBreakdown(
  profiles: Record<string, LoadProfile>,
  on: Record<string, boolean>,
  totalWatts: number
): Breakdown {
  const loads = Object.values(profiles || {}).filter((p) => on?.[p.key]);
  const accounted = loads.reduce((s, p) => s + (Number.isFinite(p.watts) ? p.watts : 0), 0);
  const total = Number.isFinite(totalWatts) ? totalWatts : 0;
  const unaccounted = Math.max(0, total - accounted);

  // A tenth of the supply with no explanation is worth saying; a rounding
  // difference is not.
  const hasGap = total > 0 && unaccounted / total > 0.1 && unaccounted > MIN_STEP_WATTS;

  let note: string | null = null;
  const unknown = Object.values(profiles || {}).filter((p) => p.confidence === "unknown").length;
  if (unknown) {
    note = `${unknown} load${unknown > 1 ? "s have" : " has"} never been observed switching on its own, so its draw is unknown.`;
  } else if (hasGap) {
    note = `${Math.round(unaccounted)} W is not explained by any known load — most likely something plugged straight into a socket.`;
  }

  return {
    loads: loads.sort((a, b) => b.watts - a.watts),
    accountedWatts: Math.round(accounted * 10) / 10,
    unaccountedWatts: Math.round(unaccounted * 10) / 10,
    hasGap,
    note,
  };
}
