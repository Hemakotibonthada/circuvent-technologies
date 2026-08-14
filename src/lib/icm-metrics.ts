/**
 * Incident metrics over time.
 *
 * `IcmStats` answers "how are we right now": how many are open, what the
 * median time to acknowledge is, whether the SLA is being met. That is the
 * right thing on a queue page and it is a snapshot — it cannot answer the
 * question an incident review actually asks, which is **whether any of this is
 * getting better**.
 *
 * A median time-to-acknowledge of nine minutes means nothing on its own. Nine
 * minutes when it was four last month is the finding.
 *
 * Two deliberate departures from the existing stats:
 *
 *   - **Time to resolve is computed here.** IcmStats has time-to-acknowledge
 *     and time-to-mitigate but not resolve, so nothing measured how long
 *     incidents stayed open. Mitigation stops the bleeding; resolution is when
 *     it is actually finished, and the gap between them is where postmortems
 *     go to die.
 *
 *   - **Buckets are keyed by when the incident STARTED**, not when it
 *     resolved. Bucketing by resolution date moves a week-long incident into
 *     the week it ended, which is the week that looks bad — and hides the week
 *     it began, which is the week something went wrong.
 */

import type { Incident, Severity } from "./icm";

export interface IcmBucket {
  /** ISO date at the start of the bucket. */
  at: string;
  /** Incidents that STARTED in this bucket. */
  opened: number;
  /** Incidents that RESOLVED in this bucket. Different question, different set. */
  resolved: number;
  bySeverity: Record<Severity, number>;
  /** Medians in minutes over incidents in this bucket that reached the milestone. */
  medianTta: number | null;
  medianTtm: number | null;
  medianTtr: number | null;
  /** People affected by incidents opened in this bucket. */
  customersImpacted: number;
}

export interface IcmTrend {
  buckets: IcmBucket[];
  /** Over the whole range, not per bucket. */
  totals: {
    opened: number;
    resolved: number;
    medianTta: number | null;
    medianTtm: number | null;
    medianTtr: number | null;
    /** Longest single incident, in minutes. */
    worstTtr: number | null;
  };
}

export type Grain = "hour" | "day" | "week";

const MIN = 60_000;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Minutes between two stamps, or null when either is missing or nonsensical.
 *
 * Negative durations are dropped rather than clamped to zero. A resolution
 * recorded before its own incident is a data problem — a clock skew, a
 * back-dated impact time — and folding it in as "resolved instantly" drags a
 * median down and makes the process look better than it is.
 */
function minutesBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = ms(from);
  const b = ms(to);
  if (a === null || b === null) return null;
  const d = (b - a) / MIN;
  return d >= 0 ? Math.round(d) : null;
}

export function timeToAcknowledge(i: Incident): number | null {
  return minutesBetween(i.createdAt, i.acknowledgedAt);
}

export function timeToMitigate(i: Incident): number | null {
  return minutesBetween(i.createdAt, i.mitigatedAt);
}

/**
 * How long the incident was open.
 *
 * Measured from `createdAt` rather than `impactStartedAt` on purpose. Impact
 * often predates the record — sometimes by hours, once somebody works out when
 * it really began — and measuring the team's response from a time nobody knew
 * about scores them on a clock that had already been running.
 *
 * `customerImpactMinutes` is the other measurement, and it is deliberately
 * separate because it answers a different question.
 */
export function timeToResolve(i: Incident): number | null {
  return minutesBetween(i.createdAt, i.resolvedAt);
}

/** How long customers were actually affected, which is not the same thing. */
export function customerImpactMinutes(i: Incident): number | null {
  return minutesBetween(i.impactStartedAt || i.createdAt, i.mitigatedAt ?? i.resolvedAt);
}

/**
 * The start of the bucket a timestamp belongs to.
 *
 * UTC throughout, deliberately. Local-time bucketing means the same incident
 * data produces different daily counts depending on who opens the page — an
 * admin in Bengaluru and one in California would disagree about how many
 * incidents happened on Tuesday, and a report that changes with the reader's
 * laptop is not a report. It also silently emits a different number of buckets
 * than the range implies, which is how this was noticed.
 *
 * The cost is that "day" means a UTC day rather than the viewer's working day.
 * That is the right trade for a shared operational record: consistent for
 * everyone beats convenient for one.
 */
function bucketStart(t: number, grain: Grain): number {
  const d = new Date(t);
  if (grain === "hour") {
    d.setUTCMinutes(0, 0, 0);
    return d.getTime();
  }
  d.setUTCHours(0, 0, 0, 0);
  if (grain === "week") {
    // Monday. Sunday-start weeks put a Friday incident and the following
    // Monday's follow-up in different weeks in most of the world.
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
  }
  return d.getTime();
}

function stepMs(grain: Grain): number {
  return grain === "hour" ? 3_600_000 : grain === "day" ? 86_400_000 : 604_800_000;
}

const emptySeverity = (): Record<Severity, number> => ({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });

/**
 * Bucket incidents into a continuous series.
 *
 * Every bucket in the range is emitted, including empty ones. A chart built
 * from only the buckets that had incidents draws a straight line across a
 * quiet fortnight and puts the two points either side next to each other,
 * which reads as continuous activity — the opposite of what happened.
 */
export function icmTrend(
  incidents: Incident[],
  opts: { from: Date | number | string; to: Date | number | string; grain?: Grain },
): IcmTrend {
  const grain = opts.grain ?? "day";
  const fromMs = new Date(opts.from).getTime();
  const toMs = new Date(opts.to).getTime();
  const step = stepMs(grain);

  const buckets = new Map<number, Incident[]>();
  const resolvedIn = new Map<number, number>();

  if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs >= fromMs) {
    for (let t = bucketStart(fromMs, grain); t <= toMs; t += step) {
      buckets.set(t, []);
      resolvedIn.set(t, 0);
    }
  }

  for (const inc of incidents) {
    const created = ms(inc.createdAt);
    if (created !== null && created >= fromMs && created <= toMs) {
      const key = bucketStart(created, grain);
      if (buckets.has(key)) buckets.get(key)!.push(inc);
    }
    const res = ms(inc.resolvedAt);
    if (res !== null && res >= fromMs && res <= toMs) {
      const key = bucketStart(res, grain);
      if (resolvedIn.has(key)) resolvedIn.set(key, (resolvedIn.get(key) ?? 0) + 1);
    }
  }

  const out: IcmBucket[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, list]) => {
      const bySeverity = emptySeverity();
      for (const i of list) bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
      return {
        at: new Date(at).toISOString(),
        opened: list.length,
        resolved: resolvedIn.get(at) ?? 0,
        bySeverity,
        medianTta: median(list.map(timeToAcknowledge).filter((n): n is number => n !== null)),
        medianTtm: median(list.map(timeToMitigate).filter((n): n is number => n !== null)),
        medianTtr: median(list.map(timeToResolve).filter((n): n is number => n !== null)),
        customersImpacted: list.reduce((s, i) => s + (Number(i.customersImpacted) || 0), 0),
      };
    });

  const inRange = incidents.filter((i) => {
    const c = ms(i.createdAt);
    return c !== null && c >= fromMs && c <= toMs;
  });
  const ttrs = inRange.map(timeToResolve).filter((n): n is number => n !== null);

  return {
    buckets: out,
    totals: {
      opened: inRange.length,
      resolved: out.reduce((s, b) => s + b.resolved, 0),
      medianTta: median(inRange.map(timeToAcknowledge).filter((n): n is number => n !== null)),
      medianTtm: median(inRange.map(timeToMitigate).filter((n): n is number => n !== null)),
      medianTtr: median(ttrs),
      worstTtr: ttrs.length ? Math.max(...ttrs) : null,
    },
  };
}

export interface Breakdown {
  key: string;
  count: number;
  /** Median time to resolve for this group, in minutes. */
  medianTtr: number | null;
  customersImpacted: number;
}

function breakdownBy(incidents: Incident[], pick: (i: Incident) => string | string[]): Breakdown[] {
  const groups = new Map<string, Incident[]>();
  for (const inc of incidents) {
    const keys = pick(inc);
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      const key = (k || "").trim() || "unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inc);
    }
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      count: list.length,
      medianTtr: median(list.map(timeToResolve).filter((n): n is number => n !== null)),
      customersImpacted: list.reduce((s, i) => s + (Number(i.customersImpacted) || 0), 0),
    }))
    .sort((a, b) => b.count - a.count);
}

export const byTeam = (incidents: Incident[]) => breakdownBy(incidents, (i) => i.owningTeam);
export const bySource = (incidents: Incident[]) => breakdownBy(incidents, (i) => i.source);

/**
 * Split by affected service.
 *
 * An incident can name several, so the counts here deliberately sum to more
 * than the number of incidents. That is the honest answer to "which services
 * are involved most often" — forcing a primary service would mean choosing one
 * arbitrarily and under-reporting every other.
 */
export const byService = (incidents: Incident[]) =>
  breakdownBy(incidents, (i) => (i.affectedServices?.length ? i.affectedServices : ["unspecified"]));

/** "4m", "1h 20m", "2d 3h" — no false precision on a long incident. */
export function formatMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  const mins = Math.max(0, Math.round(m));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rm = mins % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}
